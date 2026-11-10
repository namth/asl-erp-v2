"""Nghiệm thu TASK-006: Nâng tương phản chữ nhỏ chuẩn WCAG AA (≥ 4.5:1) ở cả Light và Dark mode (A5).

Chạy: python3 -m unittest tests/prototype/test_task_006_wcag_contrast.py -v
"""
import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LAYOUT_JS = ROOT / "prototype" / "assets" / "layout.js"
LAYOUT_CSS = ROOT / "prototype" / "assets" / "layout.css"


def relative_luminance(r, g, b):
    """Tính độ chói tương đối theo chuẩn WCAG 2.1."""
    def channel(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def contrast_ratio(rgb1, rgb2):
    """Tính tỷ lệ tương phản giữa 2 màu (L1 + 0.05) / (L2 + 0.05)."""
    l1 = relative_luminance(*rgb1)
    l2 = relative_luminance(*rgb2)
    lighter = max(l1, l2)
    darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


class TestWCAGContrastTASK006(unittest.TestCase):
    def setUp(self):
        self.assertTrue(LAYOUT_JS.exists(), f"Không tìm thấy layout.js: {LAYOUT_JS}")
        self.assertTrue(LAYOUT_CSS.exists(), f"Không tìm thấy layout.css: {LAYOUT_CSS}")
        self.js_content = LAYOUT_JS.read_text(encoding="utf-8")
        self.css_content = LAYOUT_CSS.read_text(encoding="utf-8")

    def test_sidebar_nav_title_contrast(self):
        """Tiêu đề nhóm menu sidebar (.nav-section-title) không được dùng text-slate-400 (ratio 2.9:1), phải đạt ≥ 4.5:1."""
        # Kiểm tra không còn dùng text-slate-400 cho nav-section-title trong layout.js
        self.assertNotIn(
            "nav-section-title px-3 mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400",
            self.js_content,
            "Tiêu đề nhóm menu vẫn đang dùng text-slate-400 (chỉ đạt ~2.9:1, trượt chuẩn WCAG AA)"
        )
        self.assertRegex(
            self.js_content,
            r"nav-section-title[^\"]*text-(slate-500|slate-600|slate-700|cyan-800)",
            "Tiêu đề nhóm menu chưa được nâng lên màu có độ tương phản cao (text-slate-500 hoặc đậm hơn)"
        )

    def test_dark_mode_contrast_enhancement(self):
        """layout.css phải có quy tắc nâng tương phản cho chữ phụ và tiêu đề nhóm trong Dark Mode."""
        self.assertRegex(
            self.css_content,
            r"(?i)(nav-section-title|\.dark\s+[^\}]*(nav-title|section-title|text-slate-400|text-slate-500))",
            "layout.css thiếu quy tắc nâng tương phản cho tiêu đề nhóm và chữ nhỏ trong dark mode"
        )
        # Đảm bảo có quy tắc WCAG contrast rules rõ ràng
        self.assertRegex(
            self.css_content,
            r"(?i)(wcag|contrast|4\.5:1)",
            "layout.css cần có khối chú thích hoặc quy tắc WCAG AA Contrast Engineering"
        )

    def test_role_selector_label_contrast(self):
        """Nhãn 'Vai trò đối tượng:' trong role switcher không được dùng text-slate-400."""
        self.assertNotIn(
            'text-[10px] font-extrabold uppercase tracking-wider text-slate-400',
            self.js_content,
            "Nhãn role switcher vẫn dùng text-slate-400"
        )

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
