"""Nghiệm thu TASK-005: Bộ thành phần 4 trạng thái UI dùng chung (Empty, Loading, Success, Error) cho toàn bộ prototype (A3).

Chạy: python3 -m unittest tests/prototype/test_task_005_4states.py -v
"""
import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LAYOUT_JS = ROOT / "prototype" / "assets" / "layout.js"
LAYOUT_CSS = ROOT / "prototype" / "assets" / "layout.css"


class Test4StatesUIComponent(unittest.TestCase):
    def setUp(self):
        self.assertTrue(LAYOUT_JS.exists(), f"Không tìm thấy layout.js: {LAYOUT_JS}")
        self.assertTrue(LAYOUT_CSS.exists(), f"Không tìm thấy layout.css: {LAYOUT_CSS}")
        self.js_content = LAYOUT_JS.read_text(encoding="utf-8")
        self.css_content = LAYOUT_CSS.read_text(encoding="utf-8")

    def test_4states_engine_in_layout_js(self):
        """layout.js phải định nghĩa hệ thống 4 trạng thái dùng chung (Empty, Loading/Skeleton, Success/Toast, Error)."""
        # Kiểm tra Empty State helper
        self.assertRegex(
            self.js_content,
            r"(?i)(renderEmptyState|showEmptyState|emptyStateHTML|ASL_4STATES\.empty)",
            "layout.js thiếu thành phần hoặc hàm hiển thị trạng thái Empty"
        )
        # Kiểm tra Loading / Skeleton State helper
        self.assertRegex(
            self.js_content,
            r"(?i)(renderSkeleton|showLoadingState|skeletonHTML|ASL_4STATES\.loading)",
            "layout.js thiếu thành phần hoặc hàm hiển thị trạng thái Loading/Skeleton"
        )
        # Kiểm tra Success Toast helper
        self.assertRegex(
            self.js_content,
            r"(?i)(showToast|showNotification|toastHTML|ASL_4STATES\.toast)",
            "layout.js thiếu thành phần hoặc hàm thông báo Toast Success"
        )
        # Kiểm tra Error / Validation State helper
        self.assertRegex(
            self.js_content,
            r"(?i)(renderErrorState|showFieldError|errorStateHTML|ASL_4STATES\.error)",
            "layout.js thiếu thành phần hoặc hàm thông báo Error / Validation"
        )

    def test_4states_css_classes_in_layout_css(self):
        """layout.css phải có class định dạng cho đủ 4 trạng thái: Empty, Skeleton/Loading shimmer, Toast, Error."""
        # Skeleton shimmer effect
        self.assertRegex(
            self.css_content,
            r"(?i)(skeleton|shimmer|@keyframes shimmer)",
            "layout.css thiếu hiệu ứng shimmer hoặc class cho Skeleton Loading"
        )
        # Toast notifications
        self.assertRegex(
            self.css_content,
            r"(?i)(toast|notification-toast)",
            "layout.css thiếu class định dạng cho Toast notification"
        )
        # Empty state & Error state styling
        self.assertRegex(
            self.css_content,
            r"(?i)(empty-state|asl-empty)",
            "layout.css thiếu class định dạng cho Empty state"
        )
        self.assertRegex(
            self.css_content,
            r"(?i)(field-error|error-state|asl-error|input-error)",
            "layout.css thiếu class định dạng cho Error / Field Error"
        )

    def test_interactive_state_dock_or_preview_simulator(self):
        """layout.js phải cung cấp bộ điều khiển xem trước 4 trạng thái tương tác trên prototype."""
        self.assertRegex(
            self.js_content,
            r"(?i)(stateSimulator|init4StateDock|preview4States|toggleStatePreview|asl-state-dock|state-dock)",
            "layout.js thiếu bộ điều khiển/dock xem trước 4 trạng thái cho người dùng và QA kiểm tra"
        )

    def test_prototype_checker_strict_clean(self):
        """Toàn bộ 44 trang prototype giữ vững 0 lỗi và 0 cảnh báo."""
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
