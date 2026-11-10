# Báo cáo TASK-007: Màn hình quy trình Linh hoạt (DEC-07) và Thu tiền từng phần Kế toán (DEC-06) (A7)

## Đã làm
- **`prototype/workflows/create.html`**:
  - Thêm khối chọn chế độ kiểm soát quy trình theo Quyết định kiến trúc **DEC-07**:
    - **Khung Cứng (`STRICT`)**: Khóa cứng số lượng giai đoạn và tác vụ, dành cho các quy trình chuẩn hóa hành chính.
    - **Linh Hoạt (`FLEXIBLE`)**: Cho phép đề xuất bổ sung tác vụ mới trong quá trình thực thi có kiểm soát.
- **`prototype/accounting/detail.html`**:
  - Thêm khối đối soát thu tiền và tính hoa hồng theo Quyết định kiến trúc **DEC-06**:
    - Hỗ trợ 2 chế độ: Thu đủ 100% đợt hoặc **Thu từng phần (Partial Payment)** kèm ô nhập số tiền thực thu.
    - Thêm chỉ dẫn chiết tính hoa hồng theo dòng tiền thực thu (Cash-basis theo Bất biến #4: hoa hồng chỉ tính trên số tiền thực về).
- **`prototype/cases/detail.html`**:
  - Bổ sung huy hiệu hiển thị chế độ quy trình `FLEXIBLE — DEC-07`.
  - Thêm nút `+ Đề xuất tác vụ bổ sung (Chế độ Linh hoạt)` kèm hàm xử lý `proposeFlexibleTask()` thông báo gửi tới Quản lý phê duyệt và ghi nhận Audit log bất biến.
- **Bảo toàn tính toàn vẹn hệ thống**:
  - `python3 scripts/check-prototype.py --strict` đạt 0 lỗi, 0 cảnh báo trên toàn bộ 44 trang và 360 liên kết nội bộ.

## File đã tạo/sửa
- `prototype/workflows/create.html`: Thêm lựa chọn radio chế độ STRICT vs FLEXIBLE.
- `prototype/accounting/detail.html`: Thêm khối thu tiền từng phần và hoa hồng Cash-basis.
- `prototype/cases/detail.html`: Thêm huy hiệu chế độ quy trình và nút đề xuất tác vụ bổ sung.

## Kết quả tự kiểm
```text
$ bash handoff/tasks/TASK-007-flexible-workflow-and-partial-payment/verify.sh
test_flexible_task_proposal_in_case_detail ... ok
test_partial_payment_in_accounting_detail ... ok
test_prototype_checker_strict_clean ... ok
test_workflow_governed_mode_selection ... ok

Ran 4 tests in 0.122s - OK
44 trang, 360 link nội bộ — 0 lỗi, 0 cảnh báo
KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không
