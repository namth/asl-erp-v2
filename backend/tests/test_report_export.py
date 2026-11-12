"""TSK-15 (phần xuất Excel) — dựng tệp .xlsx cho 3 báo cáo SCR-18 từ dữ liệu đúng hợp đồng docs/07 §3.9.

Hàm thuần (không DB): `backend.app.services.report_export`.
"""
from __future__ import annotations

import io
import re
from decimal import Decimal
from pathlib import Path

import pytest
from openpyxl import load_workbook

from backend.app.services.report_export import build_report_xlsx, content_disposition, export_filename

SRC = Path(__file__).resolve().parents[1] / "app" / "services" / "report_export.py"

META_DEPT = {"scope": "DEPARTMENT", "departments": [{"id": "d1", "name": "Phòng Sở Hữu Trí Tuệ"}],
             "from": "2026-10-01", "to": "2026-11-11"}
META_FIRM = {"scope": "FIRM", "departments": [], "from": "2026-10-01", "to": "2026-11-11"}

REVENUE = {
    "summary": {"received_total": "5280000000", "contract_value_total": "7400000000",
                "collection_rate_pct": "71.35", "payment_count": 46},
    "by_period": [{"period": "2026-10", "received_total": "1840000000"},
                  {"period": "2026-11", "received_total": "0"}],
    "by_department": [{"department": {"id": "d1", "name": "Phòng Sở Hữu Trí Tuệ"}, "received_total": "790000000"}],
    "by_matter_type": [{"matter_type": {"code": "TM", "name": "Nhãn hiệu"}, "received_total": "420000000",
                        "contract_value_total": "610000000"}],
}

COMMISSIONS = {  # docs/07 §3.9 — thống kê theo tháng (DEC-09)
    "summary": {"total_amount": "43500001", "transaction_count": 7,
                "by_role": {"ORIGINATOR": "1500001", "SUPERVISOR": "6000000", "CASE_MANAGER": "21000000",
                            "EXECUTOR": "15000000", "ASSISTANT": "0"}},
    "periods": ["2026-10", "2026-11"],
    "by_period": [{"period": "2026-10", "total_amount": "12000000"}, {"period": "2026-11", "total_amount": "31500001"}],
    "by_user": [
        {"user": {"id": "u2", "full_name": "LS. Mai Linh", "department_name": "Phòng Sở Hữu Trí Tuệ"},
         "total_amount": "42000000",
         "by_role": {"ORIGINATOR": "0", "SUPERVISOR": "6000000", "CASE_MANAGER": "21000000",
                     "EXECUTOR": "15000000", "ASSISTANT": "0"},
         "by_period": [{"period": "2026-10", "total_amount": "12000000"}, {"period": "2026-11", "total_amount": "30000000"}]},
        {"user": {"id": "u3", "full_name": "LS. Trần Hà", "department_name": None},
         "total_amount": "1500001",
         "by_role": {"ORIGINATOR": "1500001", "SUPERVISOR": "0", "CASE_MANAGER": "0",
                     "EXECUTOR": "0", "ASSISTANT": "0"},
         "by_period": [{"period": "2026-10", "total_amount": "0"}, {"period": "2026-11", "total_amount": "1500001"}]},
    ],
}

OPERATIONS = {
    "cases_by_status": {"INITIALIZING": 3, "ACTIVE": 42, "PAUSED": 2, "CLOSED": 17, "TERMINATED": 1},
    "overdue_tasks": {"count": 5, "items": [
        {"task_id": "t9", "title": "Nộp tờ khai", "case": {"id": "c1", "case_code": "ASL-2026-TM-0012"},
         "assignee": {"full_name": "Trần Thu Hà"}, "due_date": "2026-11-05", "days_overdue": 6},
        {"task_id": "t10", "title": "Chưa giao", "case": {"id": "c2", "case_code": "ASL-2026-TM-0013"},
         "assignee": None, "due_date": "2026-11-09", "days_overdue": 2}]},
    "stage_durations": [{"stage_name": "Thẩm định hình thức", "completed_count": 12, "avg_days": "8.5"}],
    "opportunity_conversion": {"created_count": 30, "won_count": 9, "converted_count": 8, "conversion_rate_pct": "26.67"},
}


def wb_of(name, data, meta):
    raw = build_report_xlsx(name, data, meta)
    assert isinstance(raw, (bytes, bytearray)) and raw[:2] == b"PK"  # tệp zip OOXML
    return load_workbook(io.BytesIO(raw))


def kv(ws) -> dict:
    """Cặp nhãn (cột A) → giá trị (cột B) của sheet tổng quan."""
    return {r[0]: r[1] for r in ws.iter_rows(min_row=1, max_col=2, values_only=True) if r[0] is not None}


def rows(ws):
    return [list(r) for r in ws.iter_rows(min_row=2, values_only=True) if any(v is not None for v in r)]


def header(ws):
    return [c.value for c in ws[1] if c.value is not None]


# ------------------------------------------------------------------ doanh thu
def test_revenue_cac_sheet_va_so_lieu():
    wb = wb_of("revenue", REVENUE, META_DEPT)
    assert wb.sheetnames == ["Tổng quan", "Theo kỳ", "Theo phòng ban", "Theo loại vụ việc"]
    s = kv(wb["Tổng quan"])
    assert s["Báo cáo"] == "Doanh thu thực thu"
    assert s["Kỳ"] == "01/10/2026 – 11/11/2026"
    assert s["Phạm vi"] == "Phòng ban: Phòng Sở Hữu Trí Tuệ"
    assert s["Tổng thực thu"] == 5280000000
    assert s["Tổng giá trị hợp đồng"] == 7400000000
    assert Decimal(str(s["Tỷ lệ thu (%)"])) == Decimal("71.35")
    assert s["Số lần thu"] == 46

    assert header(wb["Theo kỳ"]) == ["Kỳ", "Thực thu"]
    assert rows(wb["Theo kỳ"]) == [["2026-10", 1840000000], ["2026-11", 0]]
    assert header(wb["Theo phòng ban"]) == ["Phòng ban", "Thực thu"]
    assert rows(wb["Theo phòng ban"]) == [["Phòng Sở Hữu Trí Tuệ", 790000000]]
    assert header(wb["Theo loại vụ việc"]) == ["Mã", "Loại vụ việc", "Thực thu", "Giá trị hợp đồng"]
    assert rows(wb["Theo loại vụ việc"]) == [["TM", "Nhãn hiệu", 420000000, 610000000]]


def test_o_tien_la_so_co_dinh_dang_hang_nghin():
    wb = wb_of("revenue", REVENUE, META_FIRM)
    cell = wb["Theo kỳ"]["B2"]
    assert isinstance(cell.value, int)
    assert cell.number_format == "#,##0"
    assert wb["Theo kỳ"]["A1"].font.b is True  # dòng tiêu đề in đậm
    assert kv(wb["Tổng quan"])["Phạm vi"] == "Toàn hãng"


def test_pham_vi_ca_nhan():
    wb = wb_of("revenue", REVENUE, dict(META_FIRM, scope="SELF"))
    assert kv(wb["Tổng quan"])["Phạm vi"] == "Cá nhân"


def test_nhieu_phong_ban_noi_bang_dau_phay():
    meta = dict(META_DEPT, departments=[{"id": "d1", "name": "Phòng A"}, {"id": "d2", "name": "Phòng B"}])
    assert kv(wb_of("revenue", REVENUE, meta)["Tổng quan"])["Phạm vi"] == "Phòng ban: Phòng A, Phòng B"


def test_du_lieu_rong_van_co_dong_tieu_de():
    empty = {"summary": {"received_total": "0", "contract_value_total": "0", "collection_rate_pct": "0.00",
                         "payment_count": 0}, "by_period": [], "by_department": [], "by_matter_type": []}
    wb = wb_of("revenue", empty, META_FIRM)
    assert header(wb["Theo phòng ban"]) == ["Phòng ban", "Thực thu"]
    assert rows(wb["Theo phòng ban"]) == []
    assert kv(wb["Tổng quan"])["Tổng thực thu"] == 0


# ------------------------------------------------------------------ hoa hồng
def test_commissions_theo_thang_va_nhan_su():
    wb = wb_of("commissions", COMMISSIONS, META_FIRM)
    assert wb.sheetnames == ["Tổng quan", "Theo tháng", "Theo nhân sự"]
    s = kv(wb["Tổng quan"])
    assert s["Báo cáo"] == "Hoa hồng"
    assert (s["Tổng hoa hồng"], s["Số bút toán"]) == (43500001, 7)
    assert "Tích luỹ" not in s and "Đã chi" not in s  # DEC-09: không có trạng thái chi trả

    ws = wb["Theo tháng"]
    assert header(ws) == ["Nhân sự", "Phòng ban", "10/2026", "11/2026", "Tổng"]
    data_rows = rows(ws)
    assert data_rows[:-1] == [
        ["LS. Mai Linh", "Phòng Sở Hữu Trí Tuệ", 12000000, 30000000, 42000000],
        ["LS. Trần Hà", None, 0, 1500001, 1500001],
    ]
    assert data_rows[-1] == ["Tổng cộng", None, 12000000, 31500001, 43500001]
    assert ws.cell(row=ws.max_row, column=1).font.b is True

    ws = wb["Theo nhân sự"]
    assert header(ws) == ["Nhân sự", "Phòng ban", "Tổng hoa hồng", "Mang khách về",
                          "Giám sát", "Quản lý vụ việc", "Thực hiện", "Hỗ trợ"]
    data_rows = rows(ws)
    assert data_rows[:-1] == [
        ["LS. Mai Linh", "Phòng Sở Hữu Trí Tuệ", 42000000, 0, 6000000, 21000000, 15000000, 0],
        ["LS. Trần Hà", None, 1500001, 1500001, 0, 0, 0, 0],
    ]
    assert data_rows[-1] == ["Tổng cộng", None, 43500001, 1500001, 6000000, 21000000, 15000000, 0]
    assert ws.cell(row=ws.max_row, column=1).font.b is True


def test_tien_rat_lon_khong_mat_dong():
    # Excel lưu số dạng double: mọi số nguyên < 2^53 phải giữ chính xác (vd 123 nghìn tỷ đồng lẻ 1 đồng)
    big = dict(COMMISSIONS, summary=dict(COMMISSIONS["summary"], total_amount="123456789012345"))
    s = kv(wb_of("commissions", big, META_FIRM)["Tổng quan"])
    assert s["Tổng hoa hồng"] == 123456789012345


# ------------------------------------------------------------------ vận hành
def test_operations_cac_sheet():
    wb = wb_of("operations", OPERATIONS, META_DEPT)
    assert wb.sheetnames == ["Vụ việc theo trạng thái", "Task quá hạn", "Thời gian giai đoạn", "Chuyển đổi cơ hội"]
    assert header(wb["Vụ việc theo trạng thái"]) == ["Trạng thái", "Số vụ việc"]
    assert rows(wb["Vụ việc theo trạng thái"]) == [["Khởi tạo", 3], ["Đang thụ lý", 42], ["Tạm dừng", 2],
                                                     ["Đã đóng", 17], ["Đã huỷ", 1]]
    assert header(wb["Task quá hạn"]) == ["Task", "Mã vụ việc", "Người thực hiện", "Hạn", "Số ngày quá hạn"]
    assert rows(wb["Task quá hạn"]) == [["Nộp tờ khai", "ASL-2026-TM-0012", "Trần Thu Hà", "05/11/2026", 6],
                                        ["Chưa giao", "ASL-2026-TM-0013", None, "09/11/2026", 2]]
    assert header(wb["Thời gian giai đoạn"]) == ["Giai đoạn", "Số lần hoàn thành", "Số ngày trung bình"]
    r = rows(wb["Thời gian giai đoạn"])[0]
    assert r[:2] == ["Thẩm định hình thức", 12] and Decimal(str(r[2])) == Decimal("8.5")
    c = kv(wb["Chuyển đổi cơ hội"])
    assert (c["Cơ hội tạo mới"], c["Thắng"], c["Đã chuyển vụ việc"]) == (30, 9, 8)
    assert Decimal(str(c["Tỷ lệ chuyển đổi (%)"])) == Decimal("26.67")


# ------------------------------------------------------------------ tên tệp & header
def test_ten_tep_va_content_disposition():
    assert export_filename("revenue", "2026-10-01", "2026-11-11") == "bao-cao-revenue-2026-10-01-2026-11-11.xlsx"
    cd = content_disposition("bao-cao-revenue-2026-10-01-2026-11-11.xlsx")
    assert cd == "attachment; filename*=UTF-8''bao-cao-revenue-2026-10-01-2026-11-11.xlsx"
    assert content_disposition("báo cáo.xlsx") == "attachment; filename*=UTF-8''b%C3%A1o%20c%C3%A1o.xlsx"


@pytest.mark.parametrize("bad", ["", "users", "../revenue", "REVENUE"])
def test_ten_bao_cao_la_bi_tu_choi(bad):
    with pytest.raises(ValueError):
        build_report_xlsx(bad, REVENUE, META_FIRM)
    with pytest.raises(ValueError):
        export_filename(bad, "2026-10-01", "2026-11-11")


def test_chong_chen_cong_thuc_excel():
    """Chuỗi do người dùng nhập bắt đầu bằng = + - @ không được thành công thức (CSV/Formula injection)."""
    data = dict(OPERATIONS, overdue_tasks={"count": 1, "items": [
        {"task_id": "t1", "title": "=HYPERLINK(\"http://x\",\"bấm\")", "case": {"id": "c", "case_code": "+1"},
         "assignee": {"full_name": "@ai"}, "due_date": "2026-11-05", "days_overdue": 1}]})
    ws = wb_of("operations", data, META_FIRM)["Task quá hạn"]
    title, code, who = ws["A2"].value, ws["B2"].value, ws["C2"].value
    assert ws["A2"].data_type == "s" and title == "'=HYPERLINK(\"http://x\",\"bấm\")"
    assert code == "'+1" and who == "'@ai"


def test_ham_thuan_khong_phu_thuoc_db():
    src = SRC.read_text(encoding="utf-8")
    assert not re.search(r"^\s*(import|from)\s+(psycopg|sqlalchemy|fastapi|redis|neo4j|backend\.app\.(db|api))",
                         src, re.M)
