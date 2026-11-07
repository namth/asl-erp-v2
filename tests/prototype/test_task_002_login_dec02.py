"""Nghiệm thu TASK-002: Trang đăng nhập prototype tuân thủ DEC-02 và Bất biến #5.

Chạy: python3 -m unittest tests/prototype/test_task_002_login_dec02.py -v
"""
import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOGIN_FILE = ROOT / "prototype" / "auth" / "login.html"


class TestLoginDEC02(unittest.TestCase):
    def setUp(self):
        self.assertTrue(LOGIN_FILE.exists(), f"Không tìm thấy file: {LOGIN_FILE}")
        self.content = LOGIN_FILE.read_text(encoding="utf-8")

    def test_no_sso_buttons(self):
        """Bất biến #5 & DEC-02: Bỏ hoàn toàn Google SSO và Microsoft 365."""
        self.assertNotIn("Google SSO", self.content, "Vẫn còn nút Google SSO trong trang đăng nhập")
        self.assertNotIn("Microsoft 365", self.content, "Vẫn còn nút Microsoft 365 trong trang đăng nhập")
        self.assertNotRegex(
            self.content,
            r"(?i)hoặc đăng nhập nhanh|single sign-on",
            "Vẫn còn khối đăng nhập nhanh SSO"
        )

    def test_email_domain_asllaw(self):
        """Tài khoản công vụ phải có đuôi @asllaw.vn (không dùng @aslgate.com)."""
        self.assertNotIn("@aslgate.com", self.content, "Vẫn còn domain cũ @aslgate.com")
        self.assertIn("@asllaw.vn", self.content, "Chưa có nhãn hoặc placeholder email @asllaw.vn")

    def test_no_prefilled_credentials(self):
        """Không điền sẵn tài khoản / mật khẩu demo (tránh rủi ro bảo mật)."""
        self.assertNotIn('value="nam.h@aslgate.com"', self.content, "Vẫn điền sẵn email")
        self.assertNotIn('value="••••••••••••"', self.content, "Vẫn điền sẵn mật khẩu")
        self.assertNotIn('value="842 190"', self.content, "Vẫn điền sẵn mã TOTP demo")

    def test_session_remember_days(self):
        """Ghi nhớ phiên đăng nhập tối đa 7 ngày (theo 10-env-and-security.md), không dùng 30 ngày."""
        self.assertNotIn("30 ngày", self.content, "Thời gian ghi nhớ phiên vẫn là 30 ngày")

    def test_no_demo_footer_links(self):
        """Bỏ dòng demo 'Quay lại Danh Mục Master Prototype' ở chân trang đăng nhập."""
        self.assertNotIn("Master Prototype", self.content, "Vẫn còn nhãn 'Master Prototype' ở chân trang")
        self.assertNotIn("Danh Mục Master", self.content, "Vẫn còn dòng 'Danh Mục Master'")

    def test_has_totp_section(self):
        """Trang đăng nhập có khối nhập mã TOTP 2FA rõ ràng theo DEC-02."""
        self.assertRegex(
            self.content,
            r"(?i)totp|2fa|xác thực 2 lớp|mã xác thực",
            "Thiếu khối nhập mã TOTP 2FA"
        )

    def test_prototype_checker_remains_clean(self):
        """Đảm bảo sau khi sửa, check-prototype.py --strict vẫn 0 lỗi, 0 cảnh báo."""
        out = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "check-prototype.py"), "--strict"],
            capture_output=True,
            text=True,
            cwd=str(ROOT),
        )
        self.assertEqual(
            out.returncode,
            0,
            f"check-prototype.py phát hiện lỗi sau khi sửa login.html:\n{out.stdout}\n{out.stderr}",
        )


if __name__ == "__main__":
    unittest.main()
