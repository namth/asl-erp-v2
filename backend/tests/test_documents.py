"""Nghiệm thu: tài liệu vụ việc SCR-17 (TSK-20) — TC-DOC-01 → TC-DOC-04.

Hợp đồng: docs/07-api-contracts.md §3.8. Bổ sung đã chốt trong brief TASK-045:
- cấu hình đọc lúc gọi từ `settings.NAS_STORAGE_MOUNT_PATH`, `settings.FILE_ENCRYPTION_MASTER_KEY`,
  `settings.CLAMAV_HOST`, `settings.CLAMAV_PORT`, `settings.MAX_UPLOAD_SIZE_MB`;
- quét virus qua giao thức clamd INSTREAM, chạy sau khi trả 201 (`scan_status` ban đầu `PENDING`);
  không kết nối được ClamAV → giữ `PENDING` (không bao giờ tự coi là sạch);
- audit `entity_name = 'documents'`, `entity_id = id tài liệu`.
Test dựng một máy chủ clamd giả trên cổng ngẫu nhiên (báo FOUND khi gặp chữ ký EICAR).
"""
import asyncio
import hashlib
import io
import os
import socket
import socketserver
import tempfile
import threading
import time
import uuid
import zipfile
from pathlib import Path
from urllib.parse import quote

os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6379/7")

import pytest

from backend.app.core.config import settings
from backend.tests.test_task_flow import (
    create_test_case,
    create_test_client,
    create_test_department,
    create_test_matter_type,
    create_test_user,
    db_conn,
    make_auth_client,
    sync_neo4j_graph,
)

FOLDERS = ["LEGAL_CONTRACTS", "CLIENT_SUBMISSIONS", "OFFICIAL_FILINGS", "INTERNAL_DRAFTS"]
# Ghép từ mảnh để chính file test không bị phần mềm diệt virus trên máy dev bắt.
EICAR = ("X5O!P%@AP[4\\PZX54(P^)7CC)7}$" + "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*").encode()

# ---------------------------------------------------------------- clamd giả


class _Clamd(socketserver.BaseRequestHandler):
    def handle(self):
        f = self.request.makefile("rb")
        cmd = b""
        while not cmd.endswith((b"\0", b"\n")):
            ch = f.read(1)
            if not ch:
                return
            cmd += ch
        if b"INSTREAM" not in cmd:
            self.request.sendall(b"UNKNOWN COMMAND\0")
            return
        data = b""
        while True:
            n = int.from_bytes(f.read(4), "big")
            if n == 0:
                break
            data += f.read(n)
        _CLAMD_SEEN.append(len(data))
        if EICAR in data:
            self.request.sendall(b"stream: Eicar-Test-Signature FOUND\0")
        else:
            self.request.sendall(b"stream: OK\0")


_CLAMD_SEEN: list[int] = []


class _Server(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


def _closed_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


@pytest.fixture(scope="module", autouse=True)
def doc_env():
    srv = _Server(("127.0.0.1", 0), _Clamd)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    store = Path(tempfile.mkdtemp(prefix="asl-nas-test-"))
    saved = {k: getattr(settings, k, None) for k in
             ("NAS_STORAGE_MOUNT_PATH", "FILE_ENCRYPTION_MASTER_KEY", "CLAMAV_HOST", "CLAMAV_PORT", "MAX_UPLOAD_SIZE_MB")}
    settings.NAS_STORAGE_MOUNT_PATH = str(store)
    settings.FILE_ENCRYPTION_MASTER_KEY = "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVowMTIzNDU="
    settings.CLAMAV_HOST = "127.0.0.1"
    settings.CLAMAV_PORT = srv.server_address[1]
    settings.MAX_UPLOAD_SIZE_MB = 50
    yield {"store": store, "port": srv.server_address[1]}
    srv.shutdown()
    for k, v in saved.items():
        setattr(settings, k, v)


# ---------------------------------------------------------------- dữ liệu

_W: dict = {}


def world():
    if _W:
        return _W
    tag = uuid.uuid4().hex[:6]
    with db_conn() as conn:
        d = create_test_department(conn, name=f"Phòng tài liệu {tag}")
        mt = create_test_matter_type(conn, d["id"], name=f"Nhãn hiệu TL {tag}")
        cl = create_test_client(conn)
        exe = create_test_user(conn, "MANAGER", is_executive=True, full_name=f"Giám đốc TL {tag}")
        mgr = create_test_user(conn, "MANAGER", full_name=f"Trưởng phòng TL {tag}")
        a1 = create_test_user(conn, "ATTORNEY", full_name=f"LS được giao TL {tag}")
        a2 = create_test_user(conn, "ATTORNEY", full_name=f"LS ngoài vụ TL {tag}")
        acct = create_test_user(conn, "ACCOUNTANT", full_name=f"Kế toán TL {tag}")
        admin = create_test_user(conn, "ADMIN", full_name=f"Quản trị TL {tag}")
        c = create_test_case(conn, cl["id"], mt["id"], d["id"], created_by=exe["id"])
        c_other = create_test_case(conn, cl["id"], mt["id"], d["id"], created_by=exe["id"])
        c_legacy = create_test_case(conn, cl["id"], mt["id"], d["id"], created_by=exe["id"], is_legacy=True)
        stage_id = str(uuid.uuid4())
        conn.execute("""INSERT INTO case_stages (id, case_id, order_index, name, status)
                        VALUES (%s, %s, 1, 'Soạn hồ sơ', 'ACTIVE')""", (stage_id, c_other["id"]))
        other_task = str(uuid.uuid4())
        conn.execute("""INSERT INTO case_tasks (id, case_id, stage_id, title, status)
                        VALUES (%s, %s, %s, 'Task vụ khác', 'TODO')""", (other_task, c_other["id"], stage_id))
    _W.update(dict(d=d, exe=exe, mgr=mgr, a1=a1, a2=a2, acct=acct, admin=admin, c=c, c_legacy=c_legacy,
                   other_task=other_task))
    return _W


async def graph():
    W = world()
    if W.get("_g"):
        return W
    await sync_neo4j_graph(
        users=[W[k] for k in ("exe", "mgr", "a1", "a2", "acct", "admin")],
        departments=[W["d"]],
        cases=[W["c"], W["c_legacy"]],
        leads=[(W["mgr"]["id"], W["d"]["id"])],
        assignments=[(W["a1"]["id"], W["c"]["id"], "EXECUTOR"), (W["a1"]["id"], W["c_legacy"]["id"], "EXECUTOR")],
    )
    W["_g"] = True
    return W


# ---------------------------------------------------------------- tệp mẫu

def pdf(marker: bytes = b"") -> bytes:
    return b"%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n" + marker + b"\n%%EOF\n"


def png() -> bytes:
    return b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + os.urandom(64)


def jpg() -> bytes:
    return b"\xff\xd8\xff\xe0\x00\x10JFIF\x00" + os.urandom(64) + b"\xff\xd9"


def office(kind: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("[Content_Types].xml", '<?xml version="1.0"?><Types/>')
        if kind == "docx":
            z.writestr("word/document.xml", "<w:document/>")
        elif kind == "xlsx":
            z.writestr("xl/workbook.xml", "<workbook/>")
        else:
            z.writestr("readme.txt", "zip thường")
    return buf.getvalue()


# ---------------------------------------------------------------- tiện ích gọi API

async def upload(user, case_id, content: bytes, *, filename="tai-lieu.pdf", folder="INTERNAL_DRAFTS",
                 title="Bản thảo", task_id=None, mime="application/pdf"):
    data = {"folder": folder, "title": title}
    if task_id:
        data["task_id"] = task_id
    async with make_auth_client(user["id"]) as c:
        return await c.post(f"/api/v1/cases/{case_id}/documents", data=data,
                            files={"file": (filename, content, mime)})


async def add_version(user, doc_id, content: bytes, filename="ban-moi.pdf"):
    async with make_auth_client(user["id"]) as c:
        return await c.post(f"/api/v1/documents/{doc_id}/versions", files={"file": (filename, content, "application/pdf")})


async def list_docs(user, case_id, folder="INTERNAL_DRAFTS", include_archived=False):
    async with make_auth_client(user["id"]) as c:
        return await c.get(f"/api/v1/cases/{case_id}/documents",
                           params={"folder": folder, "include_archived": str(include_archived).lower()})


async def versions(user, doc_id):
    async with make_auth_client(user["id"]) as c:
        return await c.get(f"/api/v1/documents/{doc_id}/versions")


async def download(user, doc_id, vid):
    async with make_auth_client(user["id"]) as c:
        return await c.get(f"/api/v1/documents/{doc_id}/versions/{vid}/download")


async def archive(user, doc_id, reason):
    async with make_auth_client(user["id"]) as c:
        return await c.post(f"/api/v1/documents/{doc_id}/archive", json={} if reason is None else {"reason": reason})


async def wait_scan(user, doc_id, timeout=20.0) -> dict:
    """Chờ bản mới nhất quét xong; trả phần tử version mới nhất."""
    end = time.monotonic() + timeout
    while True:
        r = await versions(user, doc_id)
        assert r.status_code == 200, r.text
        v = r.json()["data"][0]
        if v["scan_status"] != "PENDING" or time.monotonic() > end:
            return v
        await asyncio.sleep(0.3)


def err(r) -> str:
    return r.json()["error"]["code"]


def audit_count(action, doc_id) -> int:
    with db_conn() as conn:
        return conn.execute("SELECT count(*) FROM audit_logs WHERE action = %s AND entity_name = 'documents' AND entity_id = %s",
                            (action, str(doc_id))).fetchone()[0]


def doc_count(case_id) -> int:
    with db_conn() as conn:
        return conn.execute("SELECT count(*) FROM documents WHERE case_id = %s", (case_id,)).fetchone()[0]


def created(r) -> dict:
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["success"] is True
    return b["data"]


# ---------------------------------------------------------------- test


@pytest.mark.asyncio
async def test_tai_len_lan_dau_pending_roi_quet_sach_va_hien_trong_danh_sach():
    W = await graph()
    d = created(await upload(W["a1"], W["c"]["id"], pdf(b"noi dung 1"), title="Bản thảo đơn khởi kiện"))
    assert d["folder"] == "INTERNAL_DRAFTS" and d["title"] == "Bản thảo đơn khởi kiện" and d["is_archived"] is False
    cv = d["current_version"]
    assert cv["version_no"] == 1 and cv["scan_status"] == "PENDING"
    assert cv["original_filename"] == "tai-lieu.pdf" and cv["mime_type"] == "application/pdf"
    assert cv["size_bytes"] == len(pdf(b"noi dung 1"))
    assert cv["uploaded_by"]["id"] == W["a1"]["id"]
    v = await wait_scan(W["a1"], d["id"])
    assert v["scan_status"] == "CLEAN"
    r = await list_docs(W["a1"], W["c"]["id"])
    assert r.status_code == 200, r.text
    b = r.json()
    assert isinstance(b["data"], list) and any(x["id"] == d["id"] for x in b["data"])
    assert all(x["folder"] == "INTERNAL_DRAFTS" for x in b["data"])
    assert b["meta"]["allowed_folders"] == FOLDERS and b["meta"]["can_upload"] is True
    assert audit_count("DOCUMENT_UPLOADED", d["id"]) == 1


@pytest.mark.asyncio
async def test_tc_doc_01_danh_sach_trang_theo_noi_dung_khong_theo_duoi():
    W = await graph()
    cid = W["c"]["id"]
    before = doc_count(cid)
    bad = [
        (b"MZ\x90\x00" + os.urandom(200), "virus.pdf", "application/pdf"),       # .exe đổi đuôi
        (b"Chi la van ban thuong", "ghi-chu.pdf", "application/pdf"),
        (office("zip"), "nen.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        (b"<html><script>alert(1)</script></html>", "trang.png", "image/png"),
    ]
    for content, name, mime in bad:
        r = await upload(W["a1"], cid, content, filename=name, mime=mime)
        assert r.status_code == 415 and err(r) == "FILE_TYPE_NOT_ALLOWED", (name, r.text)
    assert doc_count(cid) == before, "tệp bị từ chối không được tạo bản ghi"
    good = [
        (pdf(), "a.pdf", "application/pdf", "application/pdf"),
        (office("docx"), "b.docx", "application/octet-stream",
         "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        (office("xlsx"), "c.xlsx", "application/octet-stream",
         "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        (png(), "d.png", "application/octet-stream", "image/png"),
        (jpg(), "e.bin", "application/octet-stream", "image/jpeg"),   # đuôi lạ nhưng nội dung JPG
    ]
    for content, name, sent_mime, expect_mime in good:
        d = created(await upload(W["a1"], cid, content, filename=name, mime=sent_mime))
        assert d["current_version"]["mime_type"] == expect_mime, name
    assert doc_count(cid) == before + len(good)


@pytest.mark.asyncio
async def test_tc_doc_01_qua_50mb_bi_tu_choi():
    W = await graph()
    cid = W["c"]["id"]
    before = doc_count(cid)
    big = pdf() + b"0" * (51 * 1024 * 1024)
    r = await upload(W["a1"], cid, big, filename="lon.pdf")
    assert r.status_code == 413 and err(r) == "FILE_TOO_LARGE", r.text[:300]
    assert doc_count(cid) == before


@pytest.mark.asyncio
async def test_tc_doc_02_tep_nhiem_virus_khong_tai_xuong_duoc():
    W = await graph()
    seen = len(_CLAMD_SEEN)
    d = created(await upload(W["a1"], W["c"]["id"], pdf(EICAR), filename="nhiem.pdf"))
    v = await wait_scan(W["a1"], d["id"])
    assert v["scan_status"] == "INFECTED"
    assert len(_CLAMD_SEEN) > seen, "phải thực sự gửi tệp tới ClamAV"
    assert _CLAMD_SEEN[-1] == len(pdf(EICAR)), "gửi bản rõ đầy đủ cho ClamAV"
    r = await download(W["a1"], d["id"], v["id"])
    assert r.status_code == 409 and err(r) == "FILE_NOT_AVAILABLE"


@pytest.mark.asyncio
async def test_clamav_khong_ket_noi_duoc_thi_giu_pending_khong_coi_la_sach(doc_env):
    W = await graph()
    settings.CLAMAV_PORT = _closed_port()
    try:
        d = created(await upload(W["a1"], W["c"]["id"], pdf(b"cho quet"), filename="cho.pdf"))
        await asyncio.sleep(3)
        v = (await versions(W["a1"], d["id"])).json()["data"][0]
        assert v["scan_status"] == "PENDING"
        r = await download(W["a1"], d["id"], v["id"])
        assert r.status_code == 409 and err(r) == "FILE_NOT_AVAILABLE"
    finally:
        settings.CLAMAV_PORT = doc_env["port"]


@pytest.mark.asyncio
async def test_tc_doc_04_phien_ban_ma_hoa_va_audit_moi_luot_tai(doc_env):
    W = await graph()
    m1 = ("BANRO-V1-" + uuid.uuid4().hex).encode()
    m2 = ("BANRO-V2-" + uuid.uuid4().hex).encode()
    c1, c2 = pdf(m1), pdf(m2)
    d = created(await upload(W["a1"], W["c"]["id"], c1, filename="hợp đồng gốc.pdf", folder="LEGAL_CONTRACTS",
                             title="Hợp đồng dịch vụ"))
    await wait_scan(W["a1"], d["id"])
    r2 = await add_version(W["a1"], d["id"], c2, filename="hợp đồng sửa.pdf")
    assert r2.status_code == 201, r2.text
    assert r2.json()["data"]["current_version"]["version_no"] == 2
    assert audit_count("DOCUMENT_VERSION_UPLOADED", d["id"]) == 1
    await wait_scan(W["a1"], d["id"])
    vs = (await versions(W["a1"], d["id"])).json()["data"]
    assert [v["version_no"] for v in vs] == [2, 1], "mới nhất trước"
    v2, v1 = vs
    assert all(v["scan_status"] == "CLEAN" for v in vs)

    r = await download(W["a1"], d["id"], v1["id"])
    assert r.status_code == 200 and r.content == c1, "bản 1 còn nguyên"
    cd = r.headers["content-disposition"]
    assert cd.startswith("attachment") and ("filename*=UTF-8''" + quote("hợp đồng gốc.pdf")) in cd
    r = await download(W["mgr"], d["id"], v2["id"])
    assert r.status_code == 200 and r.content == c2
    assert audit_count("DOCUMENT_DOWNLOADED", d["id"]) == 2

    files = [p for p in doc_env["store"].rglob("*") if p.is_file()]
    assert len(files) >= 2, "tệp phải nằm dưới NAS_STORAGE_MOUNT_PATH"
    for p in files:
        raw = p.read_bytes()
        assert m1 not in raw and m2 not in raw and b"%PDF" not in raw, f"tệp thô {p} chứa bản rõ"
    with db_conn() as conn:
        rows = conn.execute("SELECT version_no, sha256, storage_path, size_bytes FROM document_versions "
                            "WHERE document_id = %s ORDER BY version_no", (d["id"],)).fetchall()
    assert [x[1] for x in rows] == [hashlib.sha256(c1).hexdigest(), hashlib.sha256(c2).hexdigest()]
    assert rows[0][2] != rows[1][2], "mỗi phiên bản một tệp riêng"
    assert [x[3] for x in rows] == [len(c1), len(c2)]


@pytest.mark.asyncio
async def test_tc_doc_03_pham_vi_ke_toan_chi_thu_muc_hop_dong():
    W = await graph()
    cid = W["c"]["id"]
    hd = created(await upload(W["a1"], cid, pdf(b"hd"), folder="LEGAL_CONTRACTS", title="HĐ"))
    nb = created(await upload(W["a1"], cid, pdf(b"nb"), folder="INTERNAL_DRAFTS", title="Nháp"))
    vhd = await wait_scan(W["a1"], hd["id"])
    vnb = await wait_scan(W["a1"], nb["id"])

    r = await list_docs(W["acct"], cid, folder="LEGAL_CONTRACTS")
    assert r.status_code == 200, r.text
    assert r.json()["meta"] == {"allowed_folders": ["LEGAL_CONTRACTS"], "can_upload": False}
    assert any(x["id"] == hd["id"] for x in r.json()["data"])
    r = await download(W["acct"], hd["id"], vhd["id"])
    assert r.status_code == 200 and r.content == pdf(b"hd")

    for folder in ("INTERNAL_DRAFTS", "CLIENT_SUBMISSIONS", "OFFICIAL_FILINGS"):
        r = await list_docs(W["acct"], cid, folder=folder)
        assert r.status_code == 403 and err(r) == "FOLDER_NOT_ALLOWED", folder
    r = await download(W["acct"], nb["id"], vnb["id"])
    assert r.status_code == 403 and err(r) == "FOLDER_NOT_ALLOWED"
    r = await versions(W["acct"], nb["id"])
    assert r.status_code == 403 and err(r) == "FOLDER_NOT_ALLOWED"
    r = await upload(W["acct"], cid, pdf(), folder="LEGAL_CONTRACTS")
    assert r.status_code == 403 and err(r) == "FOLDER_NOT_ALLOWED"
    r = await add_version(W["acct"], hd["id"], pdf())
    assert r.status_code == 403 and err(r) == "FOLDER_NOT_ALLOWED"
    r = await archive(W["acct"], hd["id"], "kế toán thử lưu trữ")
    assert r.status_code == 403 and err(r) == "FOLDER_NOT_ALLOWED"


@pytest.mark.asyncio
async def test_need_to_know_nguoi_ngoai_vu_va_quan_tri_vien_bi_chan():
    W = await graph()
    cid = W["c"]["id"]
    d = created(await upload(W["a1"], cid, pdf(b"bi mat"), folder="LEGAL_CONTRACTS"))
    v = await wait_scan(W["a1"], d["id"])
    for who in ("a2", "admin"):
        u = W[who]
        for r in (await list_docs(u, cid, folder="LEGAL_CONTRACTS"),
                  await upload(u, cid, pdf()),
                  await versions(u, d["id"]),
                  await download(u, d["id"], v["id"]),
                  await archive(u, d["id"], "thử")):
            assert r.status_code == 403 and err(r) == "NEED_TO_KNOW_DENIED", (who, r.request.url, r.text)
    for who in ("mgr", "exe"):
        r = await list_docs(W[who], cid, folder="LEGAL_CONTRACTS")
        assert r.status_code == 200 and r.json()["meta"]["can_upload"] is True, who
    async with make_auth_client(W["a1"]["id"]) as c:
        c.headers.pop("Authorization", None)
        c.cookies.clear()
        r = await c.get(f"/api/v1/cases/{cid}/documents", params={"folder": "LEGAL_CONTRACTS"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_luu_tru_khong_xoa_an_khoi_danh_sach_va_chan_phien_ban_moi():
    W = await graph()
    cid = W["c"]["id"]
    d = created(await upload(W["a1"], cid, pdf(b"luu tru"), folder="OFFICIAL_FILINGS", title="Đơn nộp"))
    v = await wait_scan(W["a1"], d["id"])
    for reason in (None, "", "x" * 501):
        r = await archive(W["a1"], d["id"], reason)
        assert r.status_code == 422 and err(r) == "VALIDATION_ERROR", repr(reason)
    r = await archive(W["a1"], d["id"], "Đã thay bằng hồ sơ nộp chính thức")
    assert r.status_code == 200, r.text
    assert audit_count("DOCUMENT_ARCHIVED", d["id"]) == 1
    r = await list_docs(W["a1"], cid, folder="OFFICIAL_FILINGS")
    assert all(x["id"] != d["id"] for x in r.json()["data"])
    r = await list_docs(W["a1"], cid, folder="OFFICIAL_FILINGS", include_archived=True)
    row = next(x for x in r.json()["data"] if x["id"] == d["id"])
    assert row["is_archived"] is True
    r = await add_version(W["a1"], d["id"], pdf(b"moi"))
    assert r.status_code == 409 and err(r) == "DOCUMENT_ARCHIVED"
    r = await download(W["a1"], d["id"], v["id"])
    assert r.status_code == 200 and r.content == pdf(b"luu tru")
    with db_conn() as conn:
        assert conn.execute("SELECT count(*) FROM document_versions WHERE document_id = %s", (d["id"],)).fetchone()[0] == 1


@pytest.mark.asyncio
async def test_kiem_tra_dau_vao_va_vu_viec_lich_su():
    W = await graph()
    cid = W["c"]["id"]
    before = doc_count(cid)
    r = await upload(W["a1"], cid, pdf(), title="")
    assert r.status_code == 422 and err(r) == "VALIDATION_ERROR"
    r = await upload(W["a1"], cid, pdf(), title="x" * 256)
    assert r.status_code == 422 and err(r) == "VALIDATION_ERROR"
    r = await upload(W["a1"], cid, pdf(), folder="BI_MAT")
    assert r.status_code == 422 and err(r) == "VALIDATION_ERROR"
    r = await upload(W["a1"], cid, pdf(), task_id=W["other_task"])
    assert r.status_code == 422 and err(r) == "VALIDATION_ERROR", "task phải thuộc vụ việc"
    assert doc_count(cid) == before
    r = await upload(W["a1"], W["c_legacy"]["id"], pdf())
    assert r.status_code == 409 and err(r) == "LEGACY_CASE_READ_ONLY"
    r = await versions(W["a1"], str(uuid.uuid4()))
    assert r.status_code == 404
