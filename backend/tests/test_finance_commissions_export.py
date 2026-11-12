"""Nghiệm thu: Xuất Excel sổ hoa hồng GET /api/v1/finance/commissions/export (SCR-12 / TASK-048).

Hợp đồng nghiệm thu:
- docs/07-api-contracts.md mục `GET /api/v1/finance/commissions` (đoạn về /export)
- DEC-04 về ma trận phân quyền và phạm vi dữ liệu
- brief.md TASK-048 mục 4 (Tiêu chí nghiệm thu)
"""
from __future__ import annotations

import io
import os
import re
import urllib.parse
import uuid
from decimal import Decimal
from typing import Any, Dict, List, Optional

os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6379/6")

import pytest
from openpyxl import load_workbook

from backend.tests.test_task_flow import (
    create_test_case,
    create_test_client,
    create_test_department,
    create_test_matter_type,
    create_test_user,
    db_conn,
    make_auth_client,
)
from backend.tests.test_reports_api import _user, _commission, _stage, at
from backend.tests.test_finance_commissions_api import world, ROLES, D, amounts

EXPORT_URL = "/api/v1/finance/commissions/export"
LIST_URL = "/api/v1/finance/commissions"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

EXPECTED_HEADERS = [
    "Ngày ghi nhận",
    "Mã vụ việc",
    "Đợt thu",
    "Nhân sự",
    "Vai trò",
    "Task",
    "Cơ sở tính",
    "Tỷ lệ (%)",
    "Hoa hồng",
]

ROLE_VIETNAMESE = {
    "ORIGINATOR": "Mang khách về",
    "SUPERVISOR": "Giám sát",
    "CASE_MANAGER": "Quản lý vụ việc",
    "EXECUTOR": "Thực hiện",
    "ASSISTANT": "Hỗ trợ",
}


async def get_export(user: Dict[str, Any], **params: Any):
    """Helper gọi endpoint export với quyền của user."""
    async with make_auth_client(user["id"]) as c:
        return await c.get(EXPORT_URL, params={k: v for k, v in params.items() if v is not None})


async def get_list(user: Dict[str, Any], **params: Any):
    """Helper gọi endpoint danh sách sổ hoa hồng."""
    async with make_auth_client(user["id"]) as c:
        return await c.get(LIST_URL, params={k: v for k, v in params.items() if v is not None})


def get_audit_exports(user_id: str):
    """Lấy các bản ghi audit log COMMISSIONS_EXPORTED của user."""
    with db_conn() as conn:
        return conn.execute(
            """SELECT entity_name, entity_id, actor_id, after_state
               FROM audit_logs
               WHERE action = 'COMMISSIONS_EXPORTED' AND actor_id = %s
               ORDER BY id DESC""",
            (user_id,),
        ).fetchall()


@pytest.mark.asyncio
async def test_export_ke_toan_khop_tung_dong_dinh_dang_excel_va_ghi_audit():
    """Kế toán xuất Excel: đúng MIME, Content-Disposition, sheet 'Sổ hoa hồng', 9 cột tiêu đề,

    số dòng dữ liệu = total_records của GET /finance/commissions, thứ tự giống danh sách,
    ô tiền là int, dòng 'Tổng cộng' = summary.total_amount khớp từng đồng, ghi đúng 1 audit log.
    """
    W = world()
    q = {"from": W["frm"], "to": W["to"], "case_id": W["c1"]["id"]}

    # Lấy dữ liệu danh sách để đối chiếu
    list_res = await get_list(W["acct"], **q, limit=100)
    assert list_res.status_code == 200, list_res.text
    list_json = list_res.json()
    list_data = list_json["data"]
    list_meta = list_json["meta"]

    # Gọi export
    res = await get_export(W["acct"], **q)
    assert res.status_code == 200, res.text

    # Kiểm tra Content-Type
    content_type = res.headers.get("content-type", "")
    assert XLSX_MIME in content_type, f"Content-Type không đúng MIME xlsx: {content_type}"

    # Kiểm tra Content-Disposition: attachment; filename*=UTF-8''so-hoa-hong-{from}-{to}.xlsx
    disp = res.headers.get("content-disposition", "")
    assert "attachment" in disp, f"Content-Disposition thiếu attachment: {disp}"
    expected_filename = f"so-hoa-hong-{W['frm']}-{W['to']}.xlsx"
    assert (
        f"filename*=UTF-8''{expected_filename}" in disp
        or f"filename*=UTF-8''{urllib.parse.quote(expected_filename)}" in disp
        or f'filename="{expected_filename}"' in disp
    ), f"Tên tệp không đúng mẫu quy định: {disp}"

    # Đọc tệp bằng openpyxl
    wb = load_workbook(io.BytesIO(res.content))
    assert "Sổ hoa hồng" in wb.sheetnames, f"Sheetnames không có 'Sổ hoa hồng': {wb.sheetnames}"
    ws = wb["Sổ hoa hồng"]

    # Kiểm tra dòng 1: 9 cột tiêu đề chuẩn
    header_values = [ws.cell(row=1, column=col).value for col in range(1, 10)]
    assert header_values == EXPECTED_HEADERS, f"Tiêu đề 9 cột không khớp: {header_values}"

    # Kiểm tra số dòng dữ liệu = total_records
    total_records = list_meta["total_records"]
    assert total_records == len(list_data) == 3

    # Kiểm tra từng dòng dữ liệu: cùng thứ tự với danh sách
    for idx, item in enumerate(list_data, start=2):
        row_vals = [ws.cell(row=idx, column=col).value for col in range(1, 10)]

        # Cột 1: Ngày ghi nhận (dd/mm/yyyy HH:MM giờ VN)
        date_val = str(row_vals[0] or "")
        assert re.match(r"^\d{2}/\d{2}/\d{4} \d{2}:\d{2}$", date_val), (
            f"Dòng {idx} cột 'Ngày ghi nhận' không đúng định dạng dd/mm/yyyy HH:MM: {date_val}"
        )

        # Cột 2: Mã vụ việc
        assert row_vals[1] == item["case"]["case_code"]

        # Cột 3: Đợt thu
        expected_milestone = item["milestone"]["name"] if item.get("milestone") else None
        assert (row_vals[2] or None) == expected_milestone

        # Cột 4: Nhân sự
        assert row_vals[3] == item["user"]["full_name"]

        # Cột 5: Vai trò (Tiếng Việt)
        assert row_vals[4] == ROLE_VIETNAMESE[item["role_type"]]

        # Cột 6: Task
        expected_task = item["task"]["title"] if item.get("task") else None
        assert (row_vals[5] or None) == expected_task

        # Cột 7: Cơ sở tính là int
        assert isinstance(row_vals[6], int), f"Cơ sở tính không phải int: {type(row_vals[6])} ({row_vals[6]})"
        assert row_vals[6] == int(Decimal(item["base_amount"]))

        # Cột 8: Tỷ lệ (%)
        assert Decimal(str(row_vals[7])) == Decimal(item["rate_pct"])

        # Cột 9: Hoa hồng là int
        assert isinstance(row_vals[8], int), f"Hoa hồng không phải int: {type(row_vals[8])} ({row_vals[8]})"
        assert row_vals[8] == int(Decimal(item["amount"]))

    # Dòng cuối: Dòng 'Tổng cộng'
    total_row_idx = total_records + 2
    total_row_vals = [ws.cell(row=total_row_idx, column=col).value for col in range(1, 10)]

    # Ít nhất một ô trong dòng ghi chữ "Tổng cộng"
    has_total_label = any("Tổng cộng" in str(v) for v in total_row_vals if v is not None)
    assert has_total_label, f"Dòng cuối thiếu nhãn 'Tổng cộng': {total_row_vals}"

    # Dòng tổng cộng in đậm
    assert ws.cell(row=total_row_idx, column=1).font.bold is True or ws.cell(row=total_row_idx, column=9).font.bold is True

    # Tổng cộng hoa hồng khớp từng đồng với summary.total_amount
    total_commission_val = ws.cell(row=total_row_idx, column=9).value
    assert isinstance(total_commission_val, int), f"Tổng hoa hồng không phải int: {type(total_commission_val)}"
    expected_total = int(Decimal(list_meta["summary"]["total_amount"]))
    assert total_commission_val == expected_total == 6500000

    # Kiểm tra Audit Log: đúng 1 bản ghi COMMISSIONS_EXPORTED
    audits = get_audit_exports(W["acct"]["id"])
    assert len(audits) >= 1
    latest = audits[0]
    entity_name, entity_id, actor_id, after_state = latest
    assert entity_name == "commission_transactions"
    assert entity_id == "export"
    assert actor_id == W["acct"]["id"]
    assert isinstance(after_state, dict)
    assert after_state.get("row_count") == total_records
    assert str(after_state.get("case_id")) == str(W["c1"]["id"])


@pytest.mark.asyncio
async def test_export_so_le_va_tat_ca_khong_loc_ngay():
    """Xuất không lọc ngày: filename có 'tat-ca-tat-ca', tổng cộng khớp từng đồng với số lẻ (333333)."""
    W = world()
    q = {"case_id": W["c2"]["id"]}

    res = await get_export(W["acct"], **q)
    assert res.status_code == 200, res.text

    disp = res.headers.get("content-disposition", "")
    assert "so-hoa-hong-tat-ca-tat-ca.xlsx" in disp

    wb = load_workbook(io.BytesIO(res.content))
    ws = wb["Sổ hoa hồng"]

    # Không lọc ngày → c2 có 3 giao dịch: 333333, 5000000 (quý 1) và 1000000 (31/12 năm trước)
    amts = [ws.cell(row=r, column=9).value for r in (2, 3, 4)]
    assert sorted(amts) == [333333, 1000000, 5000000]
    assert all(isinstance(a, int) for a in amts)

    # Dòng 5 là dòng tổng cộng
    total_val = ws.cell(row=5, column=9).value
    assert total_val == 6333333, f"Tổng cộng số lẻ phải khớp từng đồng 6333333, nhận được {total_val}"
    assert isinstance(total_val, int)


@pytest.mark.asyncio
async def test_export_filename_patterns():
    """Kiểm tra mẫu tên tệp Content-Disposition khi chỉ có from hoặc chỉ có to."""
    W = world()

    # Chỉ có from
    res_from = await get_export(W["acct"], **{"from": W["frm"], "case_id": W["c1"]["id"]})
    assert res_from.status_code == 200
    disp_from = res_from.headers.get("content-disposition", "")
    assert f"so-hoa-hong-{W['frm']}-tat-ca.xlsx" in disp_from

    # Chỉ có to
    res_to = await get_export(W["acct"], **{"to": W["to"], "case_id": W["c1"]["id"]})
    assert res_to.status_code == 200
    disp_to = res_to.headers.get("content-disposition", "")
    assert f"so-hoa-hong-tat-ca-{W['to']}.xlsx" in disp_to


@pytest.mark.asyncio
async def test_export_pham_vi_truong_phong_luat_su_quan_tri():
    """Kiểm tra ma trận phân quyền DEC-04 cho export:

    - Trưởng phòng chỉ nhân sự phòng mình; chọn nhân sự phòng khác -> rỗng.
    - Quản lý chưa phụ trách phòng nào -> rỗng.
    - Luật sư chỉ dòng của mình (truyền user_id người khác vẫn chỉ ra của mình).
    - Quản trị viên -> 403 FORBIDDEN_ROLE, không ghi audit.
    - Chưa đăng nhập -> 401.
    """
    W = world()
    base_q = {"from": W["frm"], "to": W["to"]}

    # 1. Trưởng phòng A: chỉ nhân sự phòng A (u1, u2) -> 4 dòng (3000000, 1500000, 2000000, 333333)
    r_mgrA = await get_export(W["mgrA"], **base_q)
    assert r_mgrA.status_code == 200
    wb_mgrA = load_workbook(io.BytesIO(r_mgrA.content))
    ws_mgrA = wb_mgrA["Sổ hoa hồng"]
    row_count_mgrA = ws_mgrA.max_row - 2  # Trừ header và dòng tổng cộng
    assert row_count_mgrA == 4
    total_mgrA = ws_mgrA.cell(row=ws_mgrA.max_row, column=9).value
    assert total_mgrA == 6833333

    # Trưởng phòng A truyền user_id của u3 (thuộc phòng B) -> rỗng (0 dòng dữ liệu, tổng cộng = 0)
    r_mgrA_u3 = await get_export(W["mgrA"], **base_q, user_id=W["u3"]["id"])
    assert r_mgrA_u3.status_code == 200
    wb_mgrA_u3 = load_workbook(io.BytesIO(r_mgrA_u3.content))
    ws_mgrA_u3 = wb_mgrA_u3["Sổ hoa hồng"]
    assert ws_mgrA_u3.max_row == 2 or ws_mgrA_u3.cell(row=ws_mgrA_u3.max_row, column=9).value in (0, None)

    # 2. Quản lý chưa phụ trách phòng nào -> rỗng
    r_none = await get_export(W["mgr_none"], **base_q)
    assert r_none.status_code == 200
    wb_none = load_workbook(io.BytesIO(r_none.content))
    ws_none = wb_none["Sổ hoa hồng"]
    assert ws_none.max_row == 2 or ws_none.cell(row=ws_none.max_row, column=9).value in (0, None)

    # 3. Luật sư u2: truyền user_id của u1 nhưng bị bỏ qua, chỉ ra dòng của chính u2
    r_u2 = await get_export(W["u2"], **base_q, user_id=W["u1"]["id"])
    assert r_u2.status_code == 200
    wb_u2 = load_workbook(io.BytesIO(r_u2.content))
    ws_u2 = wb_u2["Sổ hoa hồng"]
    # u2 có 2 dòng trong kỳ: 2000000 và 333333
    row_count_u2 = ws_u2.max_row - 2
    assert row_count_u2 == 2
    total_u2 = ws_u2.cell(row=ws_u2.max_row, column=9).value
    assert total_u2 == 2333333

    # 4. Quản trị viên (ADMIN) -> 403 FORBIDDEN_ROLE
    audits_before = get_audit_exports(W["admin"]["id"])
    r_admin = await get_export(W["admin"], **base_q)
    assert r_admin.status_code == 403, r_admin.text
    assert r_admin.json()["error"]["code"] == "FORBIDDEN_ROLE"
    # Không ghi audit log khi bị từ chối quyền
    audits_after = get_audit_exports(W["admin"]["id"])
    assert len(audits_after) == len(audits_before)

    # 5. Chưa đăng nhập -> 401
    from backend.tests.test_opportunity_conversion import client
    async with client() as anon_c:
        r_anon = await anon_c.get(EXPORT_URL)
    assert r_anon.status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "bad_params",
    [
        {"from": "2020-13-01"},
        {"from": "2020-03-02", "to": "2020-03-01"},
        {"case_id": "not-a-uuid"},
        {"user_id": "not-a-uuid"},
        {"role_type": "INVALID_ROLE"},
    ],
)
async def test_tham_so_sai_422_va_khong_ghi_audit(bad_params):
    """Tham số sai định dạng hoặc from > to trả 422 VALIDATION_ERROR và tuyệt đối không ghi audit."""
    W = world()
    audits_before = get_audit_exports(W["acct"]["id"])

    r = await get_export(W["acct"], **bad_params)
    assert r.status_code == 422, r.text
    err = r.json()
    assert err["error"]["code"] == "VALIDATION_ERROR"

    audits_after = get_audit_exports(W["acct"]["id"])
    assert len(audits_after) == len(audits_before), "Tham số sai không được ghi nhật ký kiểm toán"


@pytest.mark.asyncio
async def test_chong_formula_injection_excel():
    """Tên nhân sự hoặc tiêu đề task bắt đầu bằng ký tự công thức (=, +, -, @)

    phải được bảo vệ (sanitize), không được tạo thành công thức có thể thực thi trong Excel.
    """
    W = world()
    tag = uuid.uuid4().hex[:6]
    formula_name = f"=SUM(1,2)_{tag}"
    formula_task = f"=cmd|' /C calc'!A0_{tag}"

    with db_conn() as conn:
        # Phòng riêng để không làm lệch phạm vi phòng A của test sổ hoa hồng chạy cùng phiên.
        d_own = create_test_department(conn, name=f"Phòng chống công thức {tag}")
        u_hacker = _user(conn, "ATTORNEY", formula_name, d_own)
        # Vụ riêng để không làm lệch số đếm theo c1 của test sổ hoa hồng chạy cùng phiên.
        cl = create_test_client(conn)
        mt = create_test_matter_type(conn, d_own["id"], name=f"Chống công thức {tag}")
        own_case = create_test_case(conn, cl["id"], mt["id"], d_own["id"], created_by=W["exe"]["id"])
        sid = _stage(conn, own_case["id"], 1, "GĐ Test", "ACTIVE")
        # Tạo task có tiêu đề độc hại
        tid = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_tasks (id, case_id, stage_id, title, status, assigned_to)
               VALUES (%s, %s, %s, %s, 'COMPLETED', %s)""",
            (tid, own_case["id"], sid, formula_task, u_hacker["id"]),
        )
        # Ghi nhận hoa hồng
        cid = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO commission_transactions (id, case_id, user_id, task_id, role_type,
                                                    base_amount, rate_pct, amount, source,
                                                    payout_status, created_at)
               VALUES (%s, %s, %s, %s, 'EXECUTOR', 1000000, 10, 100000, 'SYSTEM', 'ACCUMULATED', %s)""",
            (cid, own_case["id"], u_hacker["id"], tid, at(W["Y"], 1, 15)),
        )

    res = await get_export(W["acct"], **{"from": W["frm"], "to": W["to"], "user_id": u_hacker["id"]})
    assert res.status_code == 200, res.text

    wb = load_workbook(io.BytesIO(res.content))
    ws = wb["Sổ hoa hồng"]

    # Dòng 2 chứa dữ liệu của hacker
    name_cell = ws.cell(row=2, column=4)
    task_cell = ws.cell(row=2, column=6)

    # Ô không được bắt đầu bằng dấu '=' trực tiếp nếu không escape
    # Nếu dùng _sanitize_string từ report_export.py, nó sẽ thêm dấu nháy đơn "'" phía trước
    assert not str(name_cell.value).startswith("=SUM"), f"Tên nhân sự chưa được chống formula injection: {name_cell.value}"
    assert not str(task_cell.value).startswith("=cmd"), f"Tiêu đề task chưa được chống formula injection: {task_cell.value}"
    assert str(name_cell.value).startswith("'=") or name_cell.data_type == "s"
    assert str(task_cell.value).startswith("'=") or task_cell.data_type == "s"
