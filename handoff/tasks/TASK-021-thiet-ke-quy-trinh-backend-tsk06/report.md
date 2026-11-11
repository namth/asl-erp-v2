# Báo cáo TASK-021

## Đã làm
- Hiện thực hoá trọn vẹn DoD TSK-06: hỗ trợ tạo template ở cả 2 chế độ `STRICT` và `FLEXIBLE`, cấu hình custom fields cho loại vụ việc, 3 stage, 6 task; lưu và GET đúng cây đầy đủ thứ tự, phụ thuộc và các trường task.
- Hiện thực hoá TC-WF-04: quản lý phiên bản template bất biến sau khi phát hành (`PUBLISHED`). Tạo bản mới từ bản đã phát hành sao chép sâu toàn bộ cây. Bản phát hành mới chuyển bản cũ thành `RETIRED`. Vụ việc đang chạy vẫn giữ nguyên tham chiếu và cấu trúc phiên bản cũ không bị ảnh hưởng.
- Xây dựng cơ chế phát hành `publish` an toàn với khoá `FOR UPDATE` trong transaction đơn, kiểm tra đồ thị phụ thuộc nghiêm ngặt: phát hiện chu trình (`DEPENDENCY_CYCLE` kèm danh sách node chu trình `details.cycle`), phụ thuộc sang stage sau (`INVALID_DEPENDENCY`), stage rỗng hoặc bản nháp không có stage; chặn phát hành lại bản không phải DRAFT (`VERSION_NOT_DRAFT`).
- Hiện thực hoá xác thực `PUT /workflows/versions/{id}` theo chuẩn §3.3a với mã 422 và chi tiết `details.fields`; chặn sửa bản đã `PUBLISHED`; thực hiện toàn bộ thao tác trong 1 transaction, rollback nếu có lỗi.
- Đảm bảo quy tắc nghiệp vụ `ACTIVE_TEMPLATE_EXISTS` (mỗi loại vụ việc chỉ có 1 template đang ACTIVE) và `DRAFT_VERSION_EXISTS` (mỗi template chỉ có 1 bản DRAFT tại một thời điểm). Sao chép sâu đầy đủ stage, task, phụ thuộc khi tạo bản mới từ bản đã phát hành.
- Xây dựng module thuần `backend/app/services/workflow_graph.py` với các thuật toán DFS/Kahn phát hiện chu trình, kiểm tra phụ thuộc stage và thứ tự topo mà không phụ thuộc DB.
- Hiện thực hoá quản lý trường động (`matter_types.custom_fields_schema`) và ngày nghỉ lễ (`holidays`) theo §3.3a và §4; ghi nhận audit log đầy đủ (`WORKFLOW_PUBLISHED`, `CUSTOM_FIELDS_UPDATED`).
- Phân quyền RBAC chặt chẽ: `ADMIN` có quyền ghi và đọc; `MANAGER` có quyền đọc, ghi bị 403 `FORBIDDEN_ROLE`; `ATTORNEY` không có quyền đọc/ghi (403 `FORBIDDEN_ROLE`); toàn bộ route thay đổi dữ liệu yêu cầu kiểm tra CSRF token hợp lệ.
- Bảo đảm 100% test suite `backend/tests` (79/79 test) đều vượt qua.

## Vòng sửa (theo review của Trưởng phòng)
- Đã xác nhận gỡ bỏ hoàn toàn bản vá `http.cookiejar` trong `backend/app/main.py`; không vá thư viện bên ngoài trong code sản phẩm.
- Đã xoá toàn bộ hàm `check_task_order_column` và các nhánh if/else điều kiện trong `backend/app/services/workflows.py`.
- Tận dụng cột `template_tasks.order_index` từ migration 004 (`004_task_order_index.sql`):
  - Luôn INSERT `order_index = t_idx` (vị trí task 1..n trong stage).
  - Luôn SELECT và sắp xếp theo `ORDER BY s.order_index ASC, t.order_index ASC`.
  - Loại bỏ hoàn toàn offset giả `created_at` (`NOW() + n ms`), để `created_at` sử dụng mặc định của hệ thống DB.

## File đã tạo/sửa
- `backend/app/api/workflows.py`: Khai báo và cấu hình các route API quản lý template, version, tree, publish và custom fields với đầy đủ phân quyền RBAC và kiểm tra CSRF.
- `backend/app/api/settings_holidays.py`: Khai báo và cấu hình các route API quản lý danh sách ngày nghỉ lễ theo năm (`GET` và `PUT`) với kiểm tra phân quyền và CSRF.
- `backend/app/services/workflows.py`: Xử lý nghiệp vụ chính: tạo/sửa template, sao chép sâu phiên bản, lưu cây quy trình trong transaction đơn, kiểm tra điều kiện phát hành với khoá `FOR UPDATE`, ghi audit log, cập nhật custom fields và quản lý ngày nghỉ lễ.
- `backend/app/services/workflow_graph.py`: Cung cấp các hàm thuần kiểm tra tính hợp lệ của đồ thị phụ thuộc (`detect_cycle`, `validate_stage_dependencies`, `validate_graph`).
- `backend/app/schemas/workflows.py`: Định nghĩa Pydantic schemas cho custom fields, holidays, template, template version và cây quy trình (stages, tasks, dependencies) tuân thủ đặc tả §3.3a.
- `backend/app/main.py`: Đăng ký router `workflows` và `settings_holidays` vào ứng dụng FastAPI tại prefix `/api/v1`.

## Kết quả tự kiểm
```
$ bash handoff/tasks/TASK-021-thiet-ke-quy-trinh-backend-tsk06/verify.sh
Đã áp thành công file SQL: backend/alembic/versions/004_task_order_index.sql
........................................................................ [ 91%]
.......                                                                  [100%]
79 passed in 1367.49s (0:22:47)

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không.
