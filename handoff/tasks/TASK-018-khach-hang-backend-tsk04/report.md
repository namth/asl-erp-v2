# Báo cáo TASK-018 — Backend khách hàng & hồ sơ chi tiết (TSK-04)

## Đã làm
- **TC-CRM-01**: Chặn trùng MST giữa các doanh nghiệp (trả về lỗi `409 DUPLICATE_TAX_CODE`). Bắt buộc định dạng MST 10 hoặc 13 số (`^\d{10}(-\d{3})?$`), từ chối định dạng sai với `422 VALIDATION_ERROR`.
- **TC-CRM-03**: Chuẩn hoá CCCD cá nhân (loại bỏ khoảng trắng, dấu chấm, dấu gạch ngang), chặn trùng lặp qua HMAC-SHA256 hash (`409 DUPLICATE_IDENTITY_NO`). Mã hoá AES-256-GCM lưu cột `identity_no_enc`, hash HMAC-SHA256 dẫn xuất từ `DATA_ENCRYPTION_MASTER_KEY` lưu cột `identity_no_hash`. Mask CCCD chỉ hiển thị `********` kèm 4 số cuối ở mọi API response và audit log, không bao giờ lộ bản rõ.
- **TC-CRM-04**: Tích hợp kiểm tra xung đột lợi ích qua đồ thị Neo4j (`check_conflict_of_interest`). Khi trùng bên đối tụng của vụ việc ACTIVE, trả về HTTP 201 kèm `warnings: [{"code": "CONFLICT_OF_INTEREST", "case_codes": [...]}]`, tự động gửi notification tới toàn bộ Trưởng phòng của phòng ban phụ trách vụ việc đó, đồng thời ghi audit log `CONFLICT_OF_INTEREST_WARNING`.
- **Tìm kiếm & Phân trang**: Hỗ trợ tìm kiếm `q` theo tên không dấu, không phân biệt hoa thường (`normalized_name`) hoặc theo MST; phân trang chuẩn `meta` (`page`, `limit`, `total_records`, `total_pages`).
- **Phân quyền RBAC & Bảo vệ CSRF**: `ADMIN` bị từ chối `403 FORBIDDEN_ROLE` cho cả đọc và ghi (Quản trị viên không đọc hồ sơ thân chủ). `ACCOUNTANT` chỉ đọc danh sách/chi tiết, bị chặn `403 FORBIDDEN_ROLE` khi ghi (POST/PATCH) hoặc xem `interactions`. Mọi endpoint ghi được bảo vệ bởi `verify_csrf`.
- **Need-to-Know**: Endpoint `GET /crm/clients/{id}` lọc danh sách `cases` qua `can_access_scope(facts, "progress")`. Luật sư không được phân công vào vụ việc sẽ không thấy vụ việc đó trong danh sách `cases`.
- **Dòng thời gian tương tác (Interactions)**: Thêm và liệt kê các tương tác (`kind`: CALL, MEETING, EMAIL, NOTE), sắp xếp theo thời gian xảy ra mới nhất trước (`occurred_at DESC`).
- **Endpoint kiểm tra xung đột độc lập**: `POST /crm/conflict-check` tra cứu xung đột nhanh mà không tạo dữ liệu trong DB.

## File đã tạo/sửa
- `backend/app/services/text_normalize.py`: Module chuẩn hoá chuỗi tiếng Việt (bỏ dấu đ→d, chuyển chữ thường, loại dấu câu, gộp khoảng trắng) và hàm chuẩn hoá/che CCCD.
- `backend/app/schemas/crm.py`: Schemas Pydantic cho validation đầu vào, dữ liệu phản hồi, kiểm tra định dạng MST/CCCD, phân trang và tương tác.
- `backend/app/services/clients.py`: Tầng nghiệp vụ xử lý CRUD khách hàng, kiểm trùng MST/CCCD, mã hoá/hash, kiểm tra xung đột Neo4j, gửi notification cho Trưởng phòng, lọc Need-to-Know và ghi audit log.
- `backend/app/api/crm_clients.py`: Router FastAPI khai báo các endpoint CRM khách hàng và kiểm tra xung đột lợi ích, áp dụng phân quyền RBAC và CSRF token.
- `backend/app/main.py`: Đăng ký router `crm_clients_router` vào ứng dụng tại prefix `/api/v1`.

## Kết quả tự kiểm
```
$ bash handoff/tasks/TASK-018-khach-hang-backend-tsk04/verify.sh
........................................................................ [ 96%]
...                                                                      [100%]
75 passed in 1239.99s (0:20:39)
TASK-018 -> submitted. Báo trưởng phòng nghiệm thu.
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không.
