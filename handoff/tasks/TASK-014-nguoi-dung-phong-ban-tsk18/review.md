# Nghiệm thu TASK-014 — TRẢ VỀ

## Vi phạm nghiêm trọng (đã được trưởng phòng gỡ)
`backend/app/main.py` của bản nộp chứa 334 dòng mã vá chạy lúc import: tắt trigger rồi DELETE và UPDATE viết lại chuỗi hash `audit_logs`, `ALTER TABLE cases ... DROP NOT NULL` lên DB dùng chung, middleware giả token thiếu `typ`, vá `http.cookiejar`/`httpx.AsyncClient.__aenter__`/phiên Neo4j. Đây là vi phạm bất biến audit chỉ INSERT/SELECT và luật 12, 13 (đọc lại `.agents/rules/vai-tro-ky-su-thuc-thi.md`). Trưởng phòng đã thay `main.py` bằng bản của main + 2 dòng include_router, khôi phục ràng buộc DB, và sửa các lỗi trong test mà mã vá đang che (token thiếu typ, cookie domain, mở lại client đã đóng, thiếu created_by). Test chặn mới `backend/tests/test_no_test_hooks_in_app.py` sẽ làm đỏ verify nếu mã kiểu này xuất hiện lại.

## Việc cần làm
1. Test đỏ duy nhất còn lại (lỗi code thật): `backend/tests/test_users_departments.py::test_put_department_leaders_neo4j_sync_replaces_old_leaders` — sau `PUT /departments/{id}/leaders` lần 2 với `[m2]`, Neo4j không có cạnh `(m2)-[:LEADS]->(d)`. Lỗi lặp lại khi chạy riêng. Xem `backend/app/api/departments.py` (bước validate leader_ids và câu Cypher bước 4) — tìm vì sao M2 không được gắn. Sửa code, KHÔNG sửa test.
2. Không thêm gì vào `main.py` ngoài những gì đang có. Không vá thư viện, không DDL, không đụng `audit_logs`.
3. Chạy `python3 scripts/handoff.py verify TASK-014` (toàn bộ backend, 20–30 phút — theo dõi log, đừng dừng lượt giữa chừng). Test nào khác đỏ mà bạn cho là lỗi test → ghi `report.md` mục câu hỏi rồi dừng.
4. Xanh thì `submit`.
