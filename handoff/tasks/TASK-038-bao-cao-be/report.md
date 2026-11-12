# Báo cáo TASK-038

## Đã làm
- **Doanh thu (`GET /api/v1/reports/revenue`):**
  - Thực thu tính theo `misa_transactions.received_amount` có `confirmed_at` trong kỳ (theo giờ Việt Nam `Asia/Ho_Chi_Minh`).
  - Lọc phòng ban khớp từng đồng; tổng giá trị hợp đồng `contract_value_total` tính trên các vụ việc có khoản thu trong kỳ.
  - Tỷ lệ thu hồi `collection_rate_pct` làm tròn `ROUND_HALF_UP` bằng `Decimal`.
  - Báo cáo theo kỳ (`by_period`) theo tháng (`YYYY-MM`) hoặc quý (`YYYY-Qn`), giữ đầy đủ cả các kỳ không phát sinh thu (`received_total = "0"`).
  - Báo cáo theo phòng ban (`by_department`) và loại vụ việc (`by_matter_type`) sắp xếp giảm dần theo doanh thu thực thu.
  - Phân quyền dữ liệu theo vai trò DEC-04: Giám đốc xem toàn hãng và lọc mọi phòng; Kế toán xem toàn hãng; Trưởng phòng chỉ xem các phòng mình quản lý; Luật sư chỉ xem các vụ việc được phân công (`scope = SELF`); Quản lý chưa phụ trách phòng ban nào nhận dữ liệu rỗng.
- **Hoa hồng (`GET /api/v1/reports/commissions`):**
  - Tổng hợp từ `commission_transactions` (`created_at` trong kỳ giờ VN) theo nhân sự, tách số tích luỹ (`ACCUMULATED`) và đã chi (`DISBURSED`).
  - Mỗi nhân sự có đầy đủ 5 vai trò vụ việc (`ORIGINATOR`, `SUPERVISOR`, `CASE_MANAGER`, `EXECUTOR`, `ASSISTANT`).
  - Hỗ trợ lọc theo `payout_status` (`ACCUMULATED` hoặc `DISBURSED`).
  - Phân quyền theo vai trò: Giám đốc và Kế toán xem toàn hãng; Trưởng phòng xem nhân sự phòng mình; Luật sư chỉ xem dòng của chính mình.
- **Vận hành (`GET /api/v1/reports/operations`):**
  - Ảnh chụp hiện tại số lượng vụ việc theo 5 trạng thái (`INITIALIZING`, `ACTIVE`, `PAUSED`, `CLOSED`, `TERMINATED`).
  - Danh sách task quá hạn (`overdue_tasks`): task chưa `COMPLETED` có hạn chót trước hôm nay (giờ VN), sắp xếp giảm dần theo số ngày quá hạn, tối đa 50 phần tử kèm tổng số lượng.
  - Thời gian giai đoạn (`stage_durations`): tính thời gian trung bình bằng ngày (`avg_days`, 1 chữ số thập phân, làm tròn `ROUND_HALF_UP`) của các giai đoạn hoàn thành trong kỳ, sắp xếp theo tên giai đoạn.
  - Tỷ lệ chuyển đổi cơ hội (`opportunity_conversion`): tính trên cơ hội tạo mới trong kỳ, phân loại số thắng và số chuyển thành vụ việc thành công.
  - Phân quyền: Kế toán bị cấm (403 `FORBIDDEN_ROLE`); Luật sư chỉ xem vụ việc và cơ hội của mình.
- **Phân quyền & Tham số:**
  - Kiểm tra thứ tự và mã lỗi chuẩn: 401 `UNAUTHENTICATED`, 403 `FORBIDDEN_ROLE`, 403 `NEED_TO_KNOW_DENIED`, 422 `VALIDATION_ERROR`, 404 `NOT_FOUND`.
  - Mặc định ngày bắt đầu từ đầu quý hiện tại đến ngày hôm nay (giờ VN). Khoảng cách hợp lệ tối đa 366 ngày (hỗ trợ năm nhuận).
- **Xuất Excel (`GET /api/v1/reports/{name}/export`):**
  - Dựng tệp `.xlsx` qua `build_report_xlsx` với phạm vi áp dụng thực tế của người dùng.
  - Tên tệp và header `Content-Disposition` chuẩn RFC 5987.
  - Tên báo cáo sai trả về 404 `NOT_FOUND`.
  - Ghi nhật ký kiểm toán `REPORT_EXPORTED` vào `audit_logs` có hash chain (chỉ ghi khi yêu cầu hợp lệ và được cấp quyền).

## File đã tạo/sửa
- `backend/app/services/reports.py`: Module dịch vụ xử lý logic phân quyền, xác thực tham số, truy vấn cơ sở dữ liệu PostgreSQL và tổng hợp dữ liệu 3 báo cáo (revenue, commissions, operations) cùng logic xuất Excel và ghi audit log.
- `backend/app/api/reports.py`: Router FastAPI khai báo các endpoint `/api/v1/reports/revenue`, `/api/v1/reports/commissions`, `/api/v1/reports/operations` và `/api/v1/reports/{name}/export`.
- `backend/app/main.py`: Import và đăng ký router `reports_router` với tiền tố `/api/v1`.

## Kết quả tự kiểm
```
$ bash handoff/tasks/TASK-038-bao-cao-be/verify.sh
........................................                                 [100%]
40 passed in 346.76s (0:05:46)

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không.
