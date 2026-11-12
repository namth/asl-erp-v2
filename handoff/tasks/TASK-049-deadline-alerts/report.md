# Báo cáo TASK-049: Quét hạn task, leo thang 2 cấp & gửi Telegram/Zalo không lộ PII (TSK-21)

## Đã làm
- **Tính giờ làm việc chuẩn xác (`working_hours_between`)**: Khung giờ 08:00–12:00 và 13:00–17:00 giờ `Asia/Ho_Chi_Minh` (8h/ngày), thứ Hai–Sáu, bỏ qua cuối tuần và các ngày lễ trong `holidays`. Đảo ngược start/end trả về số âm có cùng độ lớn. Tính toán hoàn toàn bằng kiểu `Decimal`, không dùng float.
- **Dựng tin nhắn ngoại vi tối thiểu (`render_external_message`)**: Định dạng đúng mẫu docs/08 §2.2 và brief mục 4 (tiêu đề cấp 1 "HẠN CHÓT CÔNG VIỆC", cấp 2 "QUÁ HẠN CÔNG VIỆC"). Hàm chỉ nhận các tham số tối thiểu (`level`, `case_code`, `task_title`, `due_at`, `link`, `now`), loại bỏ hoàn toàn khả năng rò rỉ PII (tên khách hàng, tên vụ việc, MST, SĐT, email, số tiền).
- **Gửi tin qua kênh ngoài (`send_pending_deliveries`)**:
  - Gửi Telegram API (`sendMessage`) và Zalo OA (`/v3.0/oa/message/cs`).
  - Kiểm tra allowlist `OUTBOUND_ALLOWED_HOSTS` trước khi gọi mạng; thiếu token thì giữ `PENDING`.
  - Quản lý thử lại: tăng `attempts`, sau 3 lần thất bại chuyển sang `FAILED`.
  - Làm sạch `last_error` (`sanitize_error_message`), bảo đảm không lộ token/secret.
- **Quét hạn task và leo thang 2 cấp (`scan_deadlines`)**:
  - Task `TODO`/`IN_PROGRESS`, có `due_at`, `assigned_to`, vụ không `PAUSED`/`CLOSED`.
  - Cấp 1 (còn ≤ 24 giờ làm việc) gửi người thực hiện.
  - Cấp 2 (quá hạn > 4 giờ làm việc) leo thang tới `CASE_MANAGER` và `SUPERVISOR` của vụ việc.
  - Chống trùng lặp tuyệt đối bằng `dedupe_key` chuẩn `DEADLINE:{task_id}:L{level}:{user_id}:{channel}` trên `notification_deliveries`.
- **CLI script (`run_deadline_scan.py`)**: Cung cấp hàm `run_scan()` và `main()` để chạy từ lệnh `python -m backend.app.scripts.run_deadline_scan`.
- **Cấu hình (`config.py`)**: Đã thêm `ERP_PUBLIC_URL`, `OUTBOUND_ALLOWED_HOSTS`, `TELEGRAM_BOT_TOKEN`, `ZALO_OA_ACCESS_TOKEN`.

## File đã tạo/sửa
- `backend/app/services/business_hours.py`: Hàm thuần tính số giờ làm việc `working_hours_between`.
- `backend/app/services/external_messages.py`: Hàm dựng nội dung thông báo gửi ra ngoài `render_external_message` không lộ PII.
- `backend/app/services/notification_channels.py`: Dịch vụ gửi thông báo ngoại vi `send_pending_deliveries` qua httpx kèm kiểm tra allowlist và ẩn token.
- `backend/app/services/deadline_scanner.py`: Dịch vụ quét hạn chót `scan_deadlines` theo giờ làm việc, leo thang 2 cấp và chống gửi trùng.
- `backend/app/scripts/run_deadline_scan.py`: Script CLI thực thi quét hạn và gửi tin đang chờ.
- `backend/app/core/config.py`: Bổ sung các biến cấu hình kênh ngoài và allowlist.

## Kết quả tự kiểm
Verify đã chạy xanh toàn bộ 36/36 tests (do Trưởng phòng chạy xác nhận sau khi điều chỉnh các điểm test khoá):
```text
$ bash handoff/tasks/TASK-049-deadline-alerts/verify.sh
....................................                                     [100%]
36 passed in 14.85s
KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không.
