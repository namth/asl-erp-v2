"""Danh sách vụ việc GET /cases: meta theo docs/07 §1.2, current_stage và due_at_nearest (docs/07 §3.4 bảng vụ việc).

current_stage = cases.current_stage_id nếu có; nếu chưa ghi thì là stage chưa hoàn thành, không bị khoá,
order_index nhỏ nhất. due_at_nearest = hạn sớm nhất trong các task chưa hoàn thành (null nếu không có).
"""
import datetime as dt
import os
import uuid

os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6379/8")

import pytest

from backend.tests.test_task_flow import (
    create_test_case,
    create_test_client,
    create_test_department,
    create_test_matter_type,
    db_conn,
    make_auth_client,
)
from backend.tests.test_reports_api import _user, _stage, _task, at


@pytest.mark.asyncio
async def test_danh_sach_vu_viec_co_giai_doan_hien_tai_han_gan_nhat_va_meta():
    tag = uuid.uuid4().hex[:6]
    with db_conn() as conn:
        d = create_test_department(conn, name=f"Phòng danh sách {tag}")
        mt = create_test_matter_type(conn, d["id"], name=f"Loại danh sách {tag}")
        cl = create_test_client(conn)
        exe = _user(conn, "MANAGER", f"Giám đốc DS {tag}", is_executive=True)
        c = create_test_case(conn, cl["id"], mt["id"], d["id"], status="ACTIVE", created_by=exe["id"])
        bare = create_test_case(conn, cl["id"], mt["id"], d["id"], status="INITIALIZING", created_by=exe["id"])
        _stage(conn, c["id"], 1, f"Tiếp nhận {tag}", "COMPLETED", at(2026, 1, 1), at(2026, 1, 2))
        s2 = _stage(conn, c["id"], 2, f"Nộp đơn {tag}", "ACTIVE", at(2026, 1, 2))
        _stage(conn, c["id"], 3, f"Cấp văn bằng {tag}", "LOCKED")
        _task(conn, c["id"], s2, f"Đã xong {tag}", "COMPLETED", at(2026, 1, 3))
        _task(conn, c["id"], s2, f"Hạn sau {tag}", "TODO", at(2026, 3, 1))
        _task(conn, c["id"], s2, f"Hạn sớm {tag}", "IN_PROGRESS", at(2026, 2, 1))
        conn.execute("UPDATE cases SET current_stage_id = NULL WHERE id IN (%s, %s)", (c["id"], bare["id"]))

    async with make_auth_client(exe["id"]) as client:
        r = await client.get("/api/v1/cases", params={"q": c["case_code"]})
        r2 = await client.get("/api/v1/cases", params={"q": bare["case_code"]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body["data"], list)
    assert {"page", "limit", "total_records", "total_pages"} <= set(body["meta"]), body["meta"]
    row = next(x for x in body["data"] if x["id"] == c["id"])
    assert row["current_stage"] == {"name": f"Nộp đơn {tag}", "status": "ACTIVE"}
    assert dt.datetime.fromisoformat(row["due_at_nearest"]) == at(2026, 2, 1)

    row2 = next(x for x in r2.json()["data"] if x["id"] == bare["id"])
    assert row2["current_stage"] is None and row2["due_at_nearest"] is None
