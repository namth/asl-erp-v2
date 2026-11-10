# Nhiệm vụ TASK-007: Màn hình quy trình Linh hoạt (DEC-07) và Thu tiền từng phần Kế toán (DEC-06) (A7)

## 1. Bối cảnh
Theo các quyết định kiến trúc:
- **DEC-06 (Thu tiền từng phần & Hoa hồng Cash-basis):** Tại Bàn làm việc Kế toán (`accounting/`), khách hàng có thể thanh toán một phần của đợt thu (ví dụ đợt 50 triệu nhưng thanh toán trước 20 triệu). Hệ thống ghi nhận số tiền thực thu và phân bổ hoa hồng tương ứng trên số thực về, không bắt buộc thu đủ 100% đợt mới được xác nhận.
- **DEC-07 (Quy trình có kiểm soát — Governed Workflow):**
  - Mọi quy trình có 2 chế độ: Khung cứng (`STRICT` — chuẩn hóa, không được thêm/bớt task) hoặc Linh hoạt (`FLEXIBLE` — cho phép luật sư đề xuất bổ sung tác vụ mới ngoài template nhưng bắt buộc phải qua Quản lý phê duyệt).

## 2. Mục tiêu cụ thể
1. **Trong `prototype/workflows/create.html` & `prototype/workflows/edit.html`**:
   - Thêm trường chọn chế độ quy trình:
     - Radio 1: **Khung Cứng (STRICT)** — Khóa cứng danh sách tác vụ, phù hợp các thủ tục hành chính/SHTT chuẩn.
     - Radio 2: **Linh Hoạt (FLEXIBLE)** — Cho phép đề xuất bổ sung tác vụ khi phát sinh tình huống thực tế.
2. **Trong `prototype/accounting/detail.html` & `prototype/accounting/index.html`**:
   - Tại form/modal Xác nhận thu tiền MISA:
     - Cho phép chọn "Thu đủ đợt (100%)" hoặc "Thu từng phần (Partial Payment)".
     - Có ô nhập "Số tiền thực thu (VNĐ)".
     - Hiển thị dòng giải thích hoa hồng: "Hoa hồng được tính ngay trên số tiền thực thu theo Bất biến #4 (Cash-basis)".
3. **Trong `prototype/cases/detail.html`**:
   - Thêm nhãn chế độ quy trình (`STRICT` / `FLEXIBLE`).
   - Ở chế độ `FLEXIBLE`: Thêm nút/khối `+ Đề xuất tác vụ bổ sung (Chế độ Linh hoạt)` kèm chỉ dẫn "Cần Trưởng phòng phê duyệt và ghi nhận Audit log".
4. **Đảm bảo tính toàn vẹn**:
   - `python3 scripts/check-prototype.py --strict` đạt 0 lỗi, 0 cảnh báo.

## 3. Phạm vi file được phép sửa
- `prototype/workflows/create.html`
- `prototype/accounting/detail.html`
- `prototype/cases/detail.html`

## 4. Kiểm tra tự động
```bash
bash handoff/tasks/TASK-007-flexible-workflow-and-partial-payment/verify.sh
```
Yêu cầu: tất cả 4 test đều đạt `OK`, exit code 0.
