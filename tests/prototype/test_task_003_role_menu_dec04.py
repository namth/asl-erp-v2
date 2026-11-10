"""Nghiệm thu TASK-003: Phân quyền menu theo DEC-04 và ẩn hành động chuyên môn với Kế toán.

Chạy: python3 -m unittest tests/prototype/test_task_003_role_menu_dec04.py -v
"""
import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LAYOUT_FILE = ROOT / "prototype" / "assets" / "layout.js"
CASES_INDEX_FILE = ROOT / "prototype" / "cases" / "index.html"
CASES_DETAIL_FILE = ROOT / "prototype" / "cases" / "detail.html"


class TestRoleMenuDEC04(unittest.TestCase):
    def setUp(self):
        self.assertTrue(LAYOUT_FILE.exists(), f"Không tìm thấy layout.js: {LAYOUT_FILE}")
        self.assertTrue(CASES_INDEX_FILE.exists(), f"Không tìm thấy cases/index.html: {CASES_INDEX_FILE}")
        self.assertTrue(CASES_DETAIL_FILE.exists(), f"Không tìm thấy cases/detail.html: {CASES_DETAIL_FILE}")
        self.layout_content = LAYOUT_FILE.read_text(encoding="utf-8")
        self.cases_index_content = CASES_INDEX_FILE.read_text(encoding="utf-8")
        self.cases_detail_content = CASES_DETAIL_FILE.read_text(encoding="utf-8")

    def test_dec04_no_client_portal_in_menu(self):
        """DEC-04: Cổng khách hàng (Client Portal) thuộc Phase 2, phải ẩn khỏi menu sidebar của mọi vai trò."""
        # Kiểm tra getMenuSections không được nạp itemPortal vào danh sách menu của Admin
        admin_finance_section = re.search(
            r"Tài Chính & Kế Toán[^\}]+items:\s*\[([^\]]+)\]",
            self.layout_content,
            re.DOTALL
        )
        if admin_finance_section:
            items_str = admin_finance_section.group(1)
            self.assertNotIn("itemPortal", items_str, "Vẫn còn itemPortal trong menu Tài Chính & Kế Toán của Admin")
            self.assertNotIn("client-portal", items_str, "Vẫn còn client-portal trong menu của Admin")

    def test_dec04_no_timesheet_in_menu(self):
        """DEC-04: Chấm công (Timesheet) thuộc Phase 2, không được xuất hiện trong bất kỳ menu nào."""
        # Trích xuất toàn bộ khối hàm getMenuSections
        menu_func_match = re.search(
            r"function getMenuSections\([^\)]*\)\s*\{([\s\S]+?)\n  \}\n\n  // 4\. Hàm render Sidebar",
            self.layout_content
        )
        self.assertTrue(menu_func_match, "Không tìm thấy hàm getMenuSections trong layout.js")
        menu_func_body = menu_func_match.group(1)
        self.assertNotIn("itemTimesheet", menu_func_body, "Vẫn còn itemTimesheet trong getMenuSections")
        self.assertNotIn("timesheet/index.html", menu_func_body, "Vẫn còn đường dẫn timesheet trong getMenuSections")

    def test_accountant_no_create_case_in_cases_index(self):
        """DEC-01 & Bất biến #2: Kế toán chỉ quản lý đợt thu/tài chính, không được tạo vụ việc mới."""
        # Kiểm tra trang cases/index.html có cơ chế ẩn nút Tạo Vụ Việc Mới khi role === 'accountant'
        self.assertRegex(
            self.cases_index_content,
            r"(?i)(accountant|asl_user_role)[\s\S]{0,300}(hide|none|display\s*=\s*['\"]none['\"]|hidden)[\s\S]{0,300}(tạo vụ việc|create\.html)|data-role-(exclude|hide)=[\"'].*accountant.*[\"']",
            "Trang cases/index.html chưa có logic hoặc thuộc tính ẩn nút 'Tạo Vụ Việc Mới' đối với vai trò Kế toán (accountant)"
        )

    def test_accountant_no_edit_case_in_cases_detail(self):
        """DEC-01 & Bất biến #2: Kế toán không có thẩm quyền chỉnh sửa vụ việc hoặc phê duyệt chuyên môn pháp lý."""
        # Kiểm tra trang cases/detail.html có script ẩn nút Chỉnh Sửa / Trình Phê Duyệt khi role === 'accountant'
        self.assertRegex(
            self.cases_detail_content,
            r"(?i)(accountant|asl_user_role)[\s\S]{0,300}(hide|none|display\s*=\s*['\"]none['\"]|hidden)[\s\S]{0,300}(chỉnh sửa|edit\.html|openApprovalModal|phê duyệt)|data-role-(exclude|hide)=[\"'].*accountant.*[\"']",
            "Trang cases/detail.html chưa có logic hoặc thuộc tính ẩn nút 'Chỉnh Sửa' / 'Trình Phê Duyệt' đối với vai trò Kế toán"
        )

    def test_prototype_checker_remains_clean(self):
        """Đảm bảo sau khi cập nhật, check-prototype.py --strict vẫn đạt 0 lỗi, 0 cảnh báo."""
        out = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "check-prototype.py"), "--strict"],
            capture_output=True,
            text=True,
            cwd=str(ROOT),
        )
        self.assertEqual(
            out.returncode,
            0,
            f"check-prototype.py phát hiện lỗi:\n{out.stdout}\n{out.stderr}",
        )


if __name__ == "__main__":
    unittest.main()
