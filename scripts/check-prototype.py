#!/usr/bin/env python3
"""Kiểm tra prototype HTML: link nội bộ hỏng, mã đặc tả lộ ra UI, thiếu layout dùng chung.

Dùng:  python3 scripts/check-prototype.py [thư_mục_prototype] [--strict]
       --strict: cảnh báo cả link nội bộ thiếu ?role= (layout.js vẫn giữ vai trò qua localStorage)
Thoát với mã 1 nếu có lỗi (ERROR); cảnh báo (WARN) không làm fail.
"""
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse, unquote

ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
STRICT = "--strict" in sys.argv
ROOT = Path(ARGS[0]) if ARGS else Path(__file__).resolve().parent.parent / "prototype"
SPEC_CODE = re.compile(r"\b(SCR|TSK)-\d+[A-Z]?\b")


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []          # (line, href)
        self.text = []           # (line, visible text)
        self.assets = set()
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("script", "style"):
            self._skip += 1
        if tag == "a" and a.get("href"):
            self.links.append((self.getpos()[0], a["href"]))
        src = a.get("src") or (a.get("href") if tag == "link" else None)
        if src:
            for name in ("layout.js", "layout.css"):
                if name in src:
                    self.assets.add(name)

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if not self._skip and data.strip():
            self.text.append((self.getpos()[0], data.strip()))


def main():
    if not ROOT.is_dir():
        print(f"Không tìm thấy thư mục {ROOT}")
        return 2
    pages = sorted(p for p in ROOT.rglob("*.html") if "assets" not in p.parts)
    errors = warns = links_total = 0

    for page in pages:
        rel = page.relative_to(ROOT)
        p = PageParser()
        p.feed(page.read_text(encoding="utf-8", errors="replace"))

        for line, href in p.links:
            if href.startswith(("#", "javascript:", "mailto:", "tel:")) or "${" in href:
                continue
            u = urlparse(href)
            if u.scheme or u.netloc:
                continue
            links_total += 1
            target = (page.parent / unquote(u.path)).resolve() if u.path else page
            if target.is_dir():
                target = target / "index.html"
            if not target.exists():
                errors += 1
                print(f"ERROR {rel}:{line} link hỏng -> {href}")
            elif STRICT and target.suffix == ".html" and "role=" not in u.query:
                warns += 1
                print(f"WARN  {rel}:{line} link thiếu ?role= -> {href}")

        for line, text in p.text:
            m = SPEC_CODE.search(text)
            if m:
                errors += 1
                print(f"ERROR {rel}:{line} lộ mã đặc tả '{m.group(0)}' trong UI: {text[:80]}")

        if rel.parts[0] not in ("architecture", "auth") and rel.name != "architecture.html":
            missing = {"layout.js", "layout.css"} - p.assets
            if missing and page.parent != ROOT:
                warns += 1
                print(f"WARN  {rel} chưa nạp {', '.join(sorted(missing))}")

    print(f"\n{len(pages)} trang, {links_total} link nội bộ — {errors} lỗi, {warns} cảnh báo")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
