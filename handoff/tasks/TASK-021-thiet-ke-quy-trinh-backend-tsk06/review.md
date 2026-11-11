# Nghiệm thu TASK-021 — trả về

Trưởng phòng trả về 2 điểm (test đã sửa cookie, verify.sh đã áp migration 004):
1) Đã gỡ bản vá http.cookiejar trong backend/app/main.py — KHÔNG được thêm lại; code sản phẩm không vá thư viện cho test.
2) Cột template_tasks.order_index nay có sẵn (migration backend/alembic/versions/004_task_order_index.sql, docs/06). Xoá check_task_order_column và mọi nhánh if/else theo nó; luôn INSERT order_index = vị trí task trong stage (1..n) và đọc ORDER BY s.order_index, t.order_index. Bỏ created_at giả NOW() + n ms — để created_at mặc định.
Chạy python3 scripts/handoff.py verify TASK-021 --quiet, đọc handoff/logs/verify-TASK-021-*.log, sửa tới khi xanh, cập nhật report.md rồi submit. Làm liên tục, không dừng giữa chừng.
