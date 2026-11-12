"""Dựng dữ liệu DEMO cho môi trường cục bộ (docker-compose.demo.yml).

Chạy:  scripts/demo.sh up   (hoặc reset để dựng lại từ đầu)

- Chỉ chạy khi DATABASE_SYNC_URL và NEO4J_URI trỏ vào máy cục bộ (127.0.0.1 / localhost),
  để không bao giờ ghi dữ liệu demo vào DB dùng chung hay production.
- Dữ liệu nền (phòng ban, nhân sự, loại vụ việc, quy trình, khách hàng, cơ hội) ghi thẳng SQL;
  nghiệp vụ (chuyển cơ hội → vụ việc, phân công, chạy task, xác nhận thu tiền) đi qua API thật
  để hoa hồng, nhật ký kiểm toán và đồ thị Neo4j nhất quán như khi dùng thật.
- Mọi tài khoản dùng mật khẩu DEMO_PASSWORD; Quản trị viên / Quản lý / Kế toán dùng chung
  khoá TOTP DEMO_TOTP_SECRET (lấy mã bằng `scripts/demo.sh otp`).
"""
from __future__ import annotations

import asyncio
import os
import sys
import time
import uuid
from decimal import Decimal
from urllib.parse import urlparse

import httpx
import jwt
import psycopg

from backend.app.core.config import settings
from backend.app.core.crypto import encrypt_aes_gcm
from backend.app.services.passwords import hash_password

DEMO_PASSWORD = "Demo@2026"
DEMO_TOTP_SECRET = "ASLLAWDEMOTOTPKEYASLLAWDEMO23456"
EMAIL_DOMAIN = "asllaw.vn"

LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}


def _guard() -> None:
    pg_host = urlparse(settings.DATABASE_SYNC_URL).hostname
    neo_host = urlparse(settings.NEO4J_URI).hostname
    if pg_host not in LOCAL_HOSTS or neo_host not in LOCAL_HOSTS:
        sys.exit(f"Từ chối seed demo: DB phải ở máy cục bộ (Postgres={pg_host}, Neo4j={neo_host}).")


# --------------------------------------------------------------------------- dữ liệu nền
DEPARTMENTS = [
    ("DEPT_IP", "Ban Sở hữu Trí tuệ"),
    ("DEPT_CORP", "Ban Doanh nghiệp & Đầu tư"),
    ("DEPT_CIVIL", "Ban Tranh tụng & Dân sự"),
]

# key, họ tên, chức danh, vai trò, giám đốc?, phòng, trưởng phòng của
USERS = [
    ("admin", "Phạm Quốc Bảo", "Quản trị hệ thống", "ADMIN", False, None, None),
    ("giamdoc", "LS. Trần Hoài Nam", "Giám đốc điều hành", "MANAGER", True, None, None),
    ("tb.shtt", "LS. Nguyễn Minh Anh", "Trưởng ban Sở hữu Trí tuệ", "MANAGER", False, "DEPT_IP", "DEPT_IP"),
    ("tb.dn", "LS. Lê Thu Hằng", "Trưởng ban Doanh nghiệp", "MANAGER", False, "DEPT_CORP", "DEPT_CORP"),
    ("tb.tt", "LS. Đỗ Văn Khải", "Trưởng ban Tranh tụng", "MANAGER", False, "DEPT_CIVIL", "DEPT_CIVIL"),
    ("ketoan", "Trần Thị Thu Trang", "Kế toán trưởng", "ACCOUNTANT", False, None, None),
    ("ls.huy", "LS. Hoàng Gia Huy", "Luật sư cấp cao", "ATTORNEY", False, "DEPT_IP", None),
    ("ls.linh", "Vũ Khánh Linh", "Chuyên viên pháp lý", "ATTORNEY", False, "DEPT_IP", None),
    ("ls.minh", "LS. Phan Đức Minh", "Luật sư", "ATTORNEY", False, "DEPT_CORP", None),
    ("ls.ha", "LS. Bùi Thanh Hà", "Luật sư", "ATTORNEY", False, "DEPT_CIVIL", None),
]

# mã, phòng, tên, tỷ lệ (mang khách, quản lý, % giám sát, thực hiện), chế độ, stage [(tên, [(task, trọng số, cần duyệt, kích hoạt đợt thu)])]
MATTER_TYPES = [
    ("TM", "DEPT_IP", "Đăng ký Nhãn hiệu", ("5.00", "7.00", "40.00", "8.00"), "STRICT", [
        ("Tiếp nhận & tra cứu", [("Tra cứu khả năng bảo hộ", 2, False, None), ("Soạn tờ khai & danh mục", 2, True, None)]),
        ("Nộp đơn & theo dõi", [("Nộp đơn tại Cục SHTT", 3, False, 2), ("Trả lời thông báo thẩm định", 2, True, None)]),
        ("Cấp văn bằng", [("Nhận & bàn giao văn bằng", 1, False, 3)]),
    ]),
    ("PT", "DEPT_IP", "Đăng ký Sáng chế", ("5.00", "8.00", "40.00", "10.00"), "STRICT", [
        ("Đánh giá tính mới", [("Tra cứu tình trạng kỹ thuật", 3, False, None), ("Soạn bản mô tả sáng chế", 4, True, None)]),
        ("Nộp đơn & thẩm định", [("Nộp đơn sáng chế", 2, False, 2), ("Trả lời thẩm định nội dung", 3, True, None)]),
    ]),
    ("MA", "DEPT_CORP", "Tư vấn M&A & Hợp đồng", ("6.00", "8.00", "50.00", "10.00"), "FLEXIBLE", [
        ("Thẩm định pháp lý", [("Lập danh mục hồ sơ", 1, False, None), ("Báo cáo thẩm định pháp lý", 4, True, None)]),
        ("Đàm phán & ký kết", [("Soạn dự thảo hợp đồng", 3, False, 2), ("Hỗ trợ ký kết", 2, False, None)]),
    ]),
    ("LIT", "DEPT_CIVIL", "Tranh chấp Hợp đồng", ("5.00", "7.00", "40.00", "12.00"), "FLEXIBLE", [
        ("Chuẩn bị khởi kiện", [("Nghiên cứu hồ sơ vụ việc", 2, False, None), ("Soạn đơn khởi kiện", 3, True, None)]),
        ("Tố tụng", [("Nộp đơn & tạm ứng án phí", 1, False, 2), ("Tham gia phiên hoà giải", 3, False, None)]),
    ]),
]

CLIENTS = [
    ("cl1", "Công ty CP Thực phẩm Sao Mai", "0108123456", "VIP"),
    ("cl2", "Công ty TNHH Công nghệ Lạc Hồng", "0312456789", "STRATEGIC"),
    ("cl3", "Công ty CP Dược phẩm An Khang", "0105987321", "RETURNING"),
    ("cl4", "Tập đoàn Đầu tư Minh Phát", "0101234987", "VIP"),
    ("cl5", "Công ty TNHH Thời trang Mộc Lan", "0316789012", "NEW"),
    ("cl6", "Công ty CP Logistics Hải Đăng", "0201654321", "POTENTIAL"),
    ("cl7", "Công ty TNHH Giáo dục Tri Thức Việt", "0109876543", "NEW"),
    ("cl8", "Công ty CP Năng lượng Xanh Miền Trung", "0401122334", "STRATEGIC"),
]

# Cơ hội chưa chốt (hiện ở pipeline CRM): khách, tên, nguồn, giá trị, xác suất, giai đoạn, người mang về
OPEN_OPPS = [
    ("cl5", "Đăng ký nhãn hiệu MỘC LAN tại 5 nước ASEAN", "WEBSITE", "180000000", 30, "NEW_LEAD", "ls.huy"),
    ("cl6", "Tư vấn tái cấu trúc vốn điều lệ", "REFERRAL", "350000000", 50, "PROPOSAL_SENT", "ls.minh"),
    ("cl7", "Bảo hộ quyền tác giả giáo trình số", "FACEBOOK", "60000000", 60, "NEGOTIATION", "ls.linh"),
    ("cl8", "Tranh chấp hợp đồng EPC điện mặt trời", "PARTNER", "900000000", 40, "NEGOTIATION", "tb.tt"),
    ("cl2", "Đăng ký sáng chế module IoT thế hệ 2", "HOTLINE", "220000000", 20, "NEW_LEAD", "ls.huy"),
    ("cl3", "Gia hạn nhãn hiệu dược phẩm", "REFERRAL", "40000000", 0, "LOST", "ls.linh"),
]

# Vụ việc tạo qua chuyển đổi cơ hội WON: khách, loại, tiêu đề, giá trị HĐ, các đợt thu, người mang về,
# phân công [(user, vai trò)], số task hoàn thành ở đầu quy trình, các khoản thu [(đợt, số tiền)]
CASES = [
    ("cl1", "TM", "Đăng ký nhãn hiệu SAO MAI FOODS nhóm 29, 30", "120000000",
     [("Tạm ứng khi ký hợp đồng", "40000000"), ("Khi nộp đơn hợp lệ", "50000000"), ("Khi cấp văn bằng", "30000000")],
     "ls.huy", [("tb.shtt", "SUPERVISOR"), ("ls.huy", "CASE_MANAGER"), ("ls.linh", "EXECUTOR")], 3,
     [(1, "40000000"), (2, "30000000")]),
    ("cl2", "PT", "Đăng ký sáng chế cảm biến độ ẩm đất LH-01", "250000000",
     [("Tạm ứng", "100000000"), ("Khi nộp đơn sáng chế", "150000000")],
     "tb.shtt", [("tb.shtt", "SUPERVISOR"), ("ls.huy", "CASE_MANAGER"), ("ls.linh", "EXECUTOR")], 1,
     [(1, "100000000")]),
    ("cl3", "TM", "Đăng ký nhãn hiệu AN KHANG PHARMA", "80000000",
     [("Tạm ứng", "30000000"), ("Khi nộp đơn", "30000000"), ("Khi cấp văn bằng", "20000000")],
     "ls.linh", [("ls.huy", "CASE_MANAGER"), ("ls.linh", "EXECUTOR")], 0, []),
    ("cl4", "MA", "Thẩm định pháp lý thương vụ mua 60% cổ phần Minh Phát Land", "600000000",
     [("Tạm ứng 50%", "300000000"), ("Khi ký hợp đồng chuyển nhượng", "300000000")],
     "giamdoc", [("tb.dn", "CASE_MANAGER"), ("ls.minh", "EXECUTOR")], 1,
     [(1, "200000000")]),
    ("cl8", "LIT", "Khởi kiện đòi nợ hợp đồng cung cấp thiết bị", "150000000",
     [("Tạm ứng", "50000000"), ("Khi nộp đơn khởi kiện", "100000000")],
     "tb.tt", [("tb.tt", "CASE_MANAGER"), ("ls.ha", "EXECUTOR")], 1,
     [(1, "50000000")]),
]

# Trưởng ban phụ trách theo loại vụ việc: phân công và duyệt thay mặt phòng.
LEADER_OF = {"TM": "tb.shtt", "PT": "tb.shtt", "MA": "tb.dn", "LIT": "tb.tt"}

NOTIFICATIONS = [
    ("ls.huy", "TASK_ASSIGNED", "Bạn được giao tác vụ mới", "Trả lời thông báo thẩm định — vụ nhãn hiệu SAO MAI FOODS", "/cases"),
    ("ls.huy", "DEADLINE", "Tác vụ sắp đến hạn", "Soạn bản mô tả sáng chế đến hạn trong 2 ngày", "/me"),
    ("ketoan", "PAYMENT_REQUEST", "Có đợt thu chờ xác nhận", "Đợt 2 vụ sáng chế LH-01 đang chờ xác nhận thu tiền", "/accounting"),
    ("tb.shtt", "APPROVAL", "Có yêu cầu chờ phê duyệt", "Tờ khai nhãn hiệu AN KHANG PHARMA chờ duyệt", "/approvals"),
    ("giamdoc", "REPORT", "Báo cáo doanh thu quý đã sẵn sàng", "Xem báo cáo doanh thu theo phòng ban", "/reports"),
]


def email(key: str) -> str:
    return f"{key}@{EMAIL_DOMAIN}"


def seed_reference(conn) -> dict:
    ids: dict = {"dept": {}, "user": {}, "mt": {}, "client": {}}
    for code, name in DEPARTMENTS:
        ids["dept"][code] = str(conn.execute(
            """INSERT INTO departments (name, code) VALUES (%s, %s)
               ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id""", (name, code)).fetchone()[0])

    pw_hash = hash_password(DEMO_PASSWORD)
    totp_enc = encrypt_aes_gcm(DEMO_TOTP_SECRET)
    for key, name, title, role, is_exec, dept, _ in USERS:
        need_totp = role in settings.TOTP_REQUIRED_ROLES
        ids["user"][key] = str(conn.execute(
            """INSERT INTO users (email, password_hash, full_name, title, system_role, is_executive,
                                  department_id, totp_secret_enc, totp_enabled, is_active,
                                  tokens_valid_after)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, true, now() - interval '1 day')
               ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash,
                   full_name = EXCLUDED.full_name, title = EXCLUDED.title,
                   system_role = EXCLUDED.system_role, is_executive = EXCLUDED.is_executive,
                   department_id = EXCLUDED.department_id, totp_secret_enc = EXCLUDED.totp_secret_enc,
                   totp_enabled = EXCLUDED.totp_enabled
               RETURNING id""",
            (email(key), pw_hash, name, title, role, is_exec, ids["dept"].get(dept),
             totp_enc if need_totp else None, need_totp)).fetchone()[0])
    for key, *_rest, leads in USERS:
        if leads:
            conn.execute("""INSERT INTO department_leaders (user_id, department_id) VALUES (%s, %s)
                            ON CONFLICT DO NOTHING""", (ids["user"][key], ids["dept"][leads]))

    for code, dept, name, rates, mode, stages in MATTER_TYPES:
        mt_id = str(conn.execute(
            """INSERT INTO matter_types (department_id, name, code, default_originator_rate,
                   default_management_rate, default_supervisor_share_pct, default_execution_rate)
               VALUES (%s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id""",
            (ids["dept"][dept], name, code, *rates)).fetchone()[0])
        ids["mt"][code] = mt_id
        if conn.execute("SELECT 1 FROM workflow_templates WHERE matter_type_id = %s", (mt_id,)).fetchone():
            continue
        tpl = conn.execute("""INSERT INTO workflow_templates (matter_type_id, name, mode, is_active)
                              VALUES (%s, %s, %s, true) RETURNING id""",
                           (mt_id, f"Quy trình {name}", mode)).fetchone()[0]
        ver = conn.execute("""INSERT INTO workflow_template_versions (template_id, version_no, status, published_at)
                              VALUES (%s, 1, 'PUBLISHED', now()) RETURNING id""", (tpl,)).fetchone()[0]
        prev_task = None
        for si, (sname, tasks) in enumerate(stages, start=1):
            st = conn.execute("""INSERT INTO template_stages (template_version_id, name, order_index, requires_approval)
                                 VALUES (%s, %s, %s, false) RETURNING id""", (ver, sname, si)).fetchone()[0]
            for ti, (tname, weight, approval, trig) in enumerate(tasks, start=1):
                tt = conn.execute(
                    """INSERT INTO template_tasks (template_stage_id, title, complexity_weight, requires_approval,
                                                   triggers_milestone_order, sla_business_days, order_index)
                       VALUES (%s, %s, %s, %s, %s, 5, %s) RETURNING id""",
                    (st, tname, weight, approval, trig, ti)).fetchone()[0]
                if prev_task:
                    conn.execute("""INSERT INTO template_task_dependencies (template_task_id, depends_on_template_task_id)
                                    VALUES (%s, %s)""", (tt, prev_task))
                prev_task = tt

    for key, name, tax, group in CLIENTS:
        row = conn.execute("SELECT id FROM clients WHERE tax_code = %s", (tax,)).fetchone()
        if not row:
            row = conn.execute(
                """INSERT INTO clients (client_type, name, normalized_name, tax_code, phone, email, address,
                                        category_group, created_by)
                   VALUES ('ENTERPRISE', %s, %s, %s, '0243 555 0199', %s, 'Hà Nội', %s, %s) RETURNING id""",
                (name, name.lower(), tax, f"lienhe.{tax}@example.com", group, ids["user"]["giamdoc"])).fetchone()
        ids["client"][key] = str(row[0])
    return ids


# --------------------------------------------------------------------------- gọi API thật
def _client(app, user_id: str) -> httpx.AsyncClient:
    now = int(time.time())
    token = jwt.encode({"sub": user_id, "jti": str(uuid.uuid4()), "iat": now, "exp": now + 1800, "typ": "access"},
                       settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    c = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://demo.local")
    c.cookies.set("access_token", token)
    c.cookies.set("csrf_token", "demo-seed")
    c.headers["X-CSRF-Token"] = "demo-seed"
    return c


def _ok(resp: httpx.Response, what: str) -> dict:
    if resp.status_code >= 300:
        raise RuntimeError(f"{what}: HTTP {resp.status_code} {resp.text[:400]}")
    return resp.json().get("data") or {}


async def seed_flows(conn, ids: dict) -> dict:
    from backend.app.main import app
    from backend.app.services.notifications import create_notification
    from backend.app.scripts.rebuild_graph import rebuild_graph

    U = ids["user"]
    stats = {"cases": 0, "payments": 0, "opportunities": 0}
    if conn.execute("SELECT 1 FROM cases LIMIT 1").fetchone():
        print("Đã có vụ việc — bỏ qua phần nghiệp vụ (chạy scripts/demo.sh reset để dựng lại từ đầu).")
        return stats

    for ck, title, src, val, prob, stage, orig in OPEN_OPPS:
        conn.execute("""INSERT INTO opportunities (client_id, title, lead_source, expected_value, probability_pct,
                                                   stage, lost_reason, originator_id)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                     (ids["client"][ck], title, src, val, prob, stage,
                      "Khách chọn đơn vị khác" if stage == "LOST" else None, U[orig]))
        stats["opportunities"] += 1

    acct = _client(app, U["ketoan"])
    for i, (ck, mt, title, value, milestones, orig, assigns, done_tasks, pays) in enumerate(CASES, start=1):
        opp_id = conn.execute(
            """INSERT INTO opportunities (client_id, title, lead_source, expected_value, probability_pct, stage, originator_id)
               VALUES (%s, %s, 'REFERRAL', %s, 100, 'WON', %s) RETURNING id""",
            (ids["client"][ck], title, value, U[orig])).fetchone()[0]
        stats["opportunities"] += 1
        async with _client(app, U[orig]) as c:
            case = _ok(await c.post(f"/api/v1/crm/opportunities/{opp_id}/convert",
                                    headers={"Idempotency-Key": str(uuid.uuid4())},
                                    json={"matter_type_id": ids["mt"][mt], "title": title, "contract_value": value,
                                          "milestones": [{"name": n, "amount": a} for n, a in milestones]}),
                       f"chuyển đổi {title}")
        case_id = case["case_id"]
        stats["cases"] += 1
        # Chuyển đổi chưa tự tạo nút Case trong Neo4j → dựng lại đồ thị từ PG trước khi phân công.
        rebuild_graph()

        leader = LEADER_OF[mt]
        async with _client(app, U[leader]) as mgr:
            _ok(await mgr.put(f"/api/v1/cases/{case_id}/assignments",
                              json={"assignments": [{"user_id": U[u], "role_in_case": r} for u, r in assigns]}),
                f"phân công {title}")
            if i != 3:  # vụ thứ 3 giữ "Khởi tạo" để demo đủ trạng thái
                r = await mgr.post(f"/api/v1/cases/{case_id}/status", json={"status": "ACTIVE"})
                if r.status_code >= 300:
                    print(f"  (chưa kích hoạt được {title}: {r.text[:200]})")

        # Chạy các task đầu quy trình: giao cho người thực hiện rồi hoàn thành theo đúng luồng.
        worker = next((u for u, r in assigns if r == "EXECUTOR"), assigns[0][0])
        tasks = conn.execute(
            """SELECT t.id, t.requires_approval FROM case_tasks t JOIN case_stages s ON s.id = t.stage_id
               WHERE t.case_id = %s ORDER BY s.order_index, t.order_index NULLS LAST, t.created_at""",
            (case_id,)).fetchall()
        conn.execute("UPDATE case_tasks SET assigned_to = %s, due_at = now() + interval '7 days' WHERE case_id = %s",
                     (U[worker], case_id))
        async with _client(app, U[worker]) as w:
            for task_id, needs_approval in tasks[:done_tasks]:
                base = f"/api/v1/cases/{case_id}/tasks/{task_id}/status"
                r = await w.patch(base, json={"status": "IN_PROGRESS"})
                if r.status_code >= 300:
                    print(f"  (dừng chạy task {title}: {r.json().get('error', {}).get('message')})")
                    break
                target = "WAITING_APPROVAL" if needs_approval else "COMPLETED"
                r = await w.patch(base, json={"status": target})
                if r.status_code >= 300:
                    print(f"  (task {title} dừng ở IN_PROGRESS: {r.json().get('error', {}).get('message')})")
                    break
                if needs_approval:
                    appr = conn.execute(
                        "SELECT id FROM approval_requests WHERE subject_id = %s AND status = 'PENDING'",
                        (task_id,)).fetchone()
                    if appr:
                        async with _client(app, U[leader]) as mgr:
                            r = await mgr.post(f"/api/v1/approvals/{appr[0]}/decide",
                                               json={"action": "APPROVE", "comment": "Đồng ý"})
                            if r.status_code >= 300:
                                print(f"  (chưa duyệt được task {title}: {r.text[:200]})")
                                break
        # Một task quá hạn để báo cáo vận hành có dữ liệu.
        if i == 2:
            conn.execute("""UPDATE case_tasks SET due_at = now() - interval '4 days'
                            WHERE case_id = %s AND status <> 'COMPLETED'""", (case_id,))

        # Kế toán xác nhận các khoản thu đã về (đợt đầu tạm ứng được mở chờ thu khi ký hợp đồng).
        for order, amount in pays:
            ms = conn.execute("SELECT id, status FROM billing_milestones WHERE case_id = %s AND order_index = %s",
                              (case_id, order)).fetchone()
            if ms[1] == "PENDING":
                conn.execute("UPDATE billing_milestones SET status = 'AWAITING_PAYMENT', requested_at = now() WHERE id = %s",
                             (ms[0],))
            _ok(await acct.post("/api/v1/accounting/confirm-payment",
                                headers={"Idempotency-Key": str(uuid.uuid4())},
                                json={"milestone_id": str(ms[0]), "misa_invoice_no": f"HD{2026}{i:02d}{order:02d}",
                                      "bank_ref_code": f"FT26{i:03d}{order:03d}", "received_amount": amount,
                                      "notes": "Đã đối chiếu sao kê ngân hàng"}),
                f"xác nhận thu {title} đợt {order}")
            stats["payments"] += 1
        # Mở chờ thu đợt kế tiếp ở vụ sáng chế để hòm thư Kế toán có việc.
        if i == 2:
            conn.execute("""UPDATE billing_milestones SET status = 'AWAITING_PAYMENT', requested_at = now()
                            WHERE case_id = %s AND order_index = 2 AND status = 'PENDING'""", (case_id,))
    await acct.aclose()

    for key, kind, title, body, link in NOTIFICATIONS:
        try:
            await create_notification(U[key], kind=kind, title=title, body=body, link=link)
        except Exception as exc:  # thông báo chỉ là phần tô điểm, không chặn seed
            print(f"  (bỏ qua thông báo '{title}': {exc})")
    return stats


def main() -> None:
    _guard()
    with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True) as conn:
        ids = seed_reference(conn)
        from backend.app.scripts.rebuild_graph import rebuild_graph
        rebuild_graph()
        stats = asyncio.run(seed_flows(conn, ids))
    print("Seed demo xong:", stats)
    print(f"Đăng nhập: <tài khoản>@{EMAIL_DOMAIN} / {DEMO_PASSWORD}; mã 2FA: scripts/demo.sh otp")


if __name__ == "__main__":
    main()
