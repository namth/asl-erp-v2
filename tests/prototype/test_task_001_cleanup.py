"""Nghiệm thu TASK-001: prototype tuân thủ quy ước product-ready (CLAUDE.md).

Chạy: python3 -m unittest tests/prototype/test_task_001_cleanup.py -v
"""
import re
import subprocess
import sys
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROTO = ROOT / "prototype"
# Emoji + ký hiệu Dingbats/Misc Symbols (✓ ✔ ⚡ ☕ ...). Quy ước: nút/link dùng icon SVG Lucide.
EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿⬀-⯿]")
# Baseline đo ngày 30/10/2026 — chặn việc "sửa" bằng cách xoá trang hoặc xoá link.
MIN_PAGES = 44
MIN_LINKS = 363


def pages():
    return sorted(p for p in PROTO.rglob("*.html") if "assets" not in p.parts)


class ClickableText(HTMLParser):
    """Gom text hiển thị bên trong mọi <a> và <button>."""

    def __init__(self):
        super().__init__()
        self.depth = 0
        self.items = []  # (dòng, text)

    def handle_starttag(self, tag, attrs):
        if tag in ("a", "button"):
            if self.depth == 0:
                self.items.append([self.getpos()[0], ""])
            self.depth += 1

    def handle_endtag(self, tag):
        if tag in ("a", "button") and self.depth:
            self.depth -= 1

    def handle_data(self, data):
        if self.depth:
            self.items[-1][1] += data


class TestPrototypeConventions(unittest.TestCase):
    def test_checker_strict_clean(self):
        out = subprocess.run(
            [sys.executable, "scripts/check-prototype.py", "--strict"],
            cwd=ROOT, capture_output=True, text=True,
        ).stdout
        summary = re.search(r"(\d+) trang, (\d+) link nội bộ — (\d+) lỗi, (\d+) cảnh báo", out)
        self.assertIsNotNone(summary, out[-500:])
        n_pages, n_links, n_err, n_warn = map(int, summary.groups())
        problems = "\n".join(l for l in out.splitlines() if l.startswith(("ERROR", "WARN")))[:3000]
        self.assertEqual(n_err, 0, problems)
        self.assertEqual(n_warn, 0, problems)
        self.assertGreaterEqual(n_pages, MIN_PAGES, "không được xoá trang")
        self.assertGreaterEqual(n_links, MIN_LINKS, "không được xoá link để né kiểm tra")

    def test_no_emoji_in_buttons_or_links(self):
        found = []
        for page in pages():
            parser = ClickableText()
            parser.feed(page.read_text(encoding="utf-8"))
            for line, text in parser.items:
                if EMOJI.search(text):
                    found.append(f"{page.relative_to(PROTO)}:{line} {text.strip()[:60]!r}")
        self.assertEqual(found, [], "\n".join(found))

    def test_role_param_uses_current_role(self):
        """Link nội trang không được hard-code một vai trò cố định khác nhau trong cùng trang
        (vd vừa role=admin vừa role=attorney) — vai trò phải theo vai trò hiện tại."""
        mixed = []
        for page in pages():
            if page.parent == PROTO:  # trang danh mục gốc được phép liệt kê theo từng vai trò
                continue
            roles = set(re.findall(r'href="[^"]*[?&]role=(admin|manager|accountant|attorney)', page.read_text(encoding="utf-8")))
            if len(roles) > 1:
                mixed.append(f"{page.relative_to(PROTO)}: {sorted(roles)}")
        self.assertEqual(mixed, [], "\n".join(mixed))

    def test_role_links_follow_current_role_at_runtime(self):
        """layout.js phải đồng bộ ?role= của mọi link nội trang theo vai trò hiện tại,
        để link viết sẵn role=admin không kéo người dùng sang vai trò khác."""
        js = (PROTO / "assets" / "layout.js").read_text(encoding="utf-8")
        self.assertIsNotNone(re.search(r"querySelectorAll\(\s*['\"]a\[href", js),
                             "layout.js chưa đồng bộ ?role= cho link nội trang")

    def test_shared_assets_version_bumped_consistently(self):
        """Sửa layout.js → tăng ?v= (CLAUDE.md). Mọi trang phải dùng cùng phiên bản 3.3 cho cả js và css."""
        wrong = []
        for page in pages():
            versions = re.findall(r"layout\.(js|css)\?v=([\w.]+)", page.read_text(encoding="utf-8"))
            for kind, v in versions:
                if v != "3.3":
                    wrong.append(f"{page.relative_to(PROTO)}: layout.{kind}?v={v}")
        self.assertEqual(wrong, [], "\n".join(wrong))

    def test_js_navigation_keeps_role(self):
        """Chuyển trang bằng JS (vd sau khi Lưu form) phải đi qua withRole(), không gán thẳng chuỗi .html —
        nếu không, mở trong tab/trình duyệt mới sẽ mất vai trò."""
        literal = re.compile(r"""location(?:\.href)?\s*=\s*['"`][^'"`]*\.html""")
        found = []
        for page in pages():
            text = page.read_text(encoding="utf-8")
            for m in literal.finditer(text):
                found.append(f"{page.relative_to(PROTO)}:{text[:m.start()].count(chr(10)) + 1} {m.group(0)}")
        self.assertEqual(found, [], "Dùng location.href = withRole('…html'):\n" + "\n".join(found))

    def test_layout_exposes_with_role_and_syncs_on_click(self):
        """layout.js phải (1) cung cấp window.withRole(url) để code trang dùng khi chuyển trang,
        (2) đồng bộ ?role= ngay lúc bấm link (sự kiện click ở document) để link sinh bằng JS sau khi
        tải trang (template `${…}`) cũng giữ vai trò."""
        js = (PROTO / "assets" / "layout.js").read_text(encoding="utf-8")
        self.assertIsNotNone(re.search(r"window\.withRole\s*=", js), "layout.js chưa gán window.withRole")
        self.assertIsNotNone(re.search(r"document\.addEventListener\(\s*['\"]click['\"]", js),
                             "layout.js chưa đồng bộ ?role= lúc bấm link (document click listener)")


if __name__ == "__main__":
    unittest.main()
