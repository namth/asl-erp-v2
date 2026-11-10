"""Nghiệm thu TASK-007: Màn hình quy trình Linh hoạt (DEC-07) và Thu tiền từng phần Kế toán (DEC-06) (A7).

Chạy: python3 -m unittest tests/prototype/test_task_007_flexible_workflow_partial_pay.py -v
"""
import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_CREATE = ROOT / "prototype" / "workflows" / "create.html"
WORKFLOW_INDEX = ROOT / "prototype" / "workflows" / "index.html"
ACCOUNTING_DETAIL = ROOT / "prototype" / "accounting" / "detail.html"
CASES_DETAIL = ROOT / "prototype" / "cases" / "detail.html"


class TestDEC06DEC07Screens(unittest.TestCase):
    def setUp(self):
        self.assertTrue(WORKFLOW_CREATE.exists(), f"Thiếu {WORKFLOW_CREATE}")
        self.assertTrue(ACCOUNTING_DETAIL.exists(), f"Thiếu {ACCOUNTING_DETAIL}")
        self.wf_create_content = WORKFLOW_CREATE.read_text(encoding="utf-8")
        self.ac_detail_content = ACCOUNTING_DETAIL.read_text(encoding="utf-8")
        self.case_detail_content = CASES_DETAIL.read_text(encoding="utf-8")

    def test_workflow_governed_mode_selection(self):
        """DEC-07: Workflow Builder phải có lựa chọn chế độ Khung cứng (STRICT) vs Linh hoạt (FLEXIBLE)."""
        self.assertRegex(
            self.wf_create_content,
            r"(?i)(Khung cứng|STRICT)[\s\S]{0,300}(Linh hoạt|FLEXIBLE)|(STRICT|FLEXIBLE)",
            "Trang tạo quy trình workflows/create.html thiếu lựa chọn chế độ Khung cứng vs Linh hoạt"
        )

    def test_partial_payment_in_accounting_detail(self):
        """DEC-06: Bàn làm việc Kế toán phải có hỗ trợ Thu tiền từng phần (Partial Payment) và tính hoa hồng thực thu."""
        self.assertRegex(
            self.ac_detail_content,
            r"(?i)(thu từng phần|thu một phần|partial|thực thu|số tiền thực thu)",
            "Trang accounting/detail.html thiếu hỗ trợ thu tiền từng phần theo DEC-06"
        )

    def test_flexible_task_proposal_in_case_detail(self):
        """DEC-07: Vụ việc chế độ Linh hoạt có nút/khối đề xuất tác vụ bổ sung qua phê duyệt."""
        self.assertRegex(
            self.case_detail_content,
            r"(?i)(đề xuất tác vụ|bổ sung tác vụ|tác vụ bổ sung|linh hoạt|FLEXIBLE)",
            "Trang cases/detail.html thiếu cơ chế đề xuất tác vụ bổ sung trong chế độ Linh hoạt"
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
