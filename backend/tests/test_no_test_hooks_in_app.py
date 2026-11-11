"""Chặn mã "lách test" trong code sản phẩm backend.

Code trong backend/app/ không được sửa schema/dữ liệu lúc import, không được động vào audit_logs ngoài
INSERT/SELECT (bất biến CONTEXT §3.6), không được vá thư viện bên thứ ba hay hàm của chính app ở runtime.
Test khó qua → sửa code hoặc ghi report.md để trưởng phòng sửa test; schema đổi → migration trong
backend/alembic/versions/.
"""
from __future__ import annotations

import re
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app"

FORBIDDEN: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"(UPDATE|DELETE\s+FROM|TRUNCATE)\s+audit_logs", re.I), "UPDATE/DELETE/TRUNCATE audit_logs"),
    (re.compile(r"(DISABLE|ENABLE)\s+TRIGGER", re.I), "bật/tắt trigger"),
    (re.compile(r"ALTER\s+TABLE", re.I), "đổi schema trong code app (phải là migration)"),
    (re.compile(r"\b(DROP|CREATE)\s+(TABLE|INDEX|CONSTRAINT|TRIGGER)\b", re.I), "DDL trong code app"),
]

# Ràng buộc/chỉ mục Neo4j chỉ tạo được từ code (không có Alembic cho Neo4j) — chỉ miễn luật DDL cho file này.
DDL_ALLOWED = {"db/neo4j_schema.py"}

FORBIDDEN_ANYWHERE: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"^\s*_orig_\w+\s*="), "giữ hàm gốc để vá (monkeypatch)"),
    (re.compile(r"^\s*[\w.]+\.(\w+)\s*=\s*_(safe|patched|compat|wrapped)\w*"), "gán đè hàm/thuộc tính module"),
    (re.compile(r"\b(httpx|http\.cookiejar|neo4j|psycopg|jwt)\.[\w.]+\s*=(?!=)"), "vá thư viện bên thứ ba"),
    (re.compile(r"os\.environ\[[^\]]+\]\s*="), "ghi biến môi trường lúc chạy"),
    (re.compile(r"PYTEST_CURRENT_TEST|\"pytest\"\s+in\s+sys\.modules|'pytest'\s+in\s+sys\.modules"), "nhận biết đang chạy pytest"),
]


def test_backend_app_khong_chua_ma_lach_test():
    hits: list[str] = []
    for f in sorted(APP.rglob("*.py")):
        for i, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            rel = f.relative_to(APP).as_posix()
            rules = FORBIDDEN_ANYWHERE + ([] if rel in DDL_ALLOWED else FORBIDDEN)
            for pat, why in rules:
                if pat.search(line):
                    hits.append(f"{f.relative_to(APP)}:{i} — {why}: {line.strip()[:100]}")
    assert hits == [], "\n".join(hits)
