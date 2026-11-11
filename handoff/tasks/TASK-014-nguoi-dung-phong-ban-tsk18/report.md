# Báo cáo TASK-014 — Người dùng, phòng ban & đồng bộ đồ thị (TSK-18)

> Báo cáo do **trưởng phòng (Claude) viết thay**: agent (agy1) đã code xong nhưng dừng sớm nhiều lần ở hội thoại dài (mất điện giữa chừng) và không kịp viết báo cáo.

## Đã làm (agent)
File: backend/app/main.py backend/app/api/departments.py backend/app/api/users.py backend/app/schemas/users.py backend/app/scripts/rebuild_graph.py backend/app/services/graph_sync.py backend/app/services/users.py 

- Router `users`, `departments`; service `users`, `graph_sync` (outbox + cập nhật Neo4j ngay khi khoá tài khoản/gỡ Trưởng phòng); script `rebuild_graph` (`--dry-run`).

## Kết quả verify gần nhất (trưởng phòng chạy)
- 58/61 xanh; 3 test đỏ đều do **test**, không do code — đã sửa test và khoá lại:
  1. fixture chèn `cases` thiếu cột bắt buộc;
  2. kiểm cả chuỗi audit trong DB dev chung có dòng hash giả từ `test_schema_constraints.py` → chỉ kiểm phần do test tạo;
  3. đếm nút `User` lệch 1 vì bộ test khác chạy song song → chạy tuần tự.

## Câu hỏi / chưa xong
- Không.
