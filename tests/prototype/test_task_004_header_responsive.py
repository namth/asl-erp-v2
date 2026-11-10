"""Nghiệm thu TASK-004: Header chuẩn hóa theo vai trò, sidebar đóng mặc định trên mobile và responsive 375/1024/1440.

Chạy: python3 -m unittest tests/prototype/test_task_004_header_responsive.py -v
"""
import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LAYOUT_JS = ROOT / "prototype" / "assets" / "layout.js"
LAYOUT_CSS = ROOT / "prototype" / "assets" / "layout.css"


class TestHeaderResponsiveTASK004(unittest.TestCase):
    def setUp(self):
        self.assertTrue(LAYOUT_JS.exists(), f"Không tìm thấy layout.js: {LAYOUT_JS}")
        self.assertTrue(LAYOUT_CSS.exists(), f"Không tìm thấy layout.css: {LAYOUT_CSS}")
        self.js_content = LAYOUT_JS.read_text(encoding="utf-8")
        self.css_content = LAYOUT_CSS.read_text(encoding="utf-8")

    def test_header_dynamic_role_sync_exists(self):
        """Header phải có hàm/logic đồng bộ thông tin người dùng theo 4 vai trò (admin, manager, accountant, attorney)."""
        # layout.js phải có logic cập nhật header profile theo vai trò hiện tại
        self.assertRegex(
            self.js_content,
            r"(?i)(syncHeaderProfile|updateHeaderUser|updateHeaderProfile|syncHeaderRole|renderHeaderHTML)",
            "Chưa tìm thấy hàm đồng bộ thông tin người dùng ở Header trong layout.js"
        )
        # Kiểm tra logic xử lý tìm kiếm và cập nhật profile trên các header tĩnh
        self.assertRegex(
            self.js_content,
            r"(?i)header.*(getRoleInfo|Thu Trang|Gia Huy|Nguyễn Anh|Nam Trần)",
            "layout.js chưa có mã cập nhật profile người dùng trong Header dựa trên getRoleInfo()"
        )

    def test_mobile_sidebar_default_closed(self):
        """Trên mobile (<768px), sidebar phải đóng mặc định (off-canvas / -translate-x-full) và có backdrop overlay."""
        # Kiểm tra CSS hoặc JS có cấu hình trạng thái đóng mặc định trên mobile
        has_mobile_css = bool(
            re.search(r"@media\s*\([^\)]*max-width:\s*76[78]px[^\)]*\)[\s\S]*?(sidebar|translate-x|-translate-x-full|left:\s*-[0-9]+)", self.css_content, re.IGNORECASE) or
            re.search(r"(-translate-x-full|sidebar-mobile-closed|left-[-0-9]|sidebar-backdrop|sidebar-overlay)", self.js_content, re.IGNORECASE) or
            re.search(r"(-translate-x-full|sidebar-mobile-closed|left-[-0-9]|sidebar-backdrop|sidebar-overlay)", self.css_content, re.IGNORECASE)
        )
        self.assertTrue(
            has_mobile_css,
            "Chưa có cấu hình CSS/JS cho sidebar đóng mặc định ngoài màn hình trên mobile (<768px)"
        )

    def test_sidebar_backdrop_overlay_support(self):
        """Khi mở sidebar trên mobile, phải hỗ trợ backdrop overlay để chạm ra ngoài là tự đóng."""
        has_backdrop = bool(
            "sidebar-backdrop" in self.js_content or
            "sidebar-overlay" in self.js_content or
            "sidebar-backdrop" in self.css_content or
            "sidebar-overlay" in self.css_content or
            re.search(r"(?i)(createBackdrop|toggleBackdrop|backdrop)", self.js_content)
        )
        self.assertTrue(has_backdrop, "Thiếu cơ chế backdrop/overlay che mờ và đóng sidebar khi click ra ngoài trên mobile")

    def test_responsive_overflow_protection(self):
        """Đảm bảo có thuộc tính bảo vệ chống tràn ngang (overflow-x protection) cho mobile 375px."""
        self.assertIn("overflow-x: hidden", self.css_content, "Thiếu overflow-x: hidden trong layout.css")

    def test_prototype_checker_strict_clean(self):
        """Sau khi cập nhật, check-prototype.py --strict phải đạt 0 lỗi, 0 cảnh báo."""
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
