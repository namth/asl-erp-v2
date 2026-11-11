"""Tiện ích áp file SQL migration/schema vào PostgreSQL dev."""
import sys
from pathlib import Path
import psycopg
from backend.app.core.config import settings


def main() -> None:
    if len(sys.argv) < 2:
        print("Sử dụng: python apply_sql.py <duong_dan_file.sql>")
        sys.exit(1)

    sql_path = Path(sys.argv[1])
    if not sql_path.is_file():
        print(f"File SQL không tồn tại: {sql_path} (bỏ qua)")
        return

    sql_content = sql_path.read_text(encoding="utf-8")
    with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(sql_content)
    print(f"Đã áp thành công file SQL: {sql_path}")


if __name__ == "__main__":
    main()
