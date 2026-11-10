# Nhiệm vụ TASK-005: Bộ thành phần 4 trạng thái UI dùng chung cho toàn bộ prototype (A3)

## 1. Bối cảnh
Theo Báo cáo QA và Milestone 0 (A3, U2):
- Hiện tại 41/44 màn hình prototype thiếu Empty State, 31 màn hình thiếu Skeleton Loading, 43 màn hình thiếu Toast Success, và các form thiếu thông báo lỗi validation chuẩn.
- Cần xây dựng một bộ máy thành phần 4 trạng thái dùng chung chuẩn mực (`ASL_4STATES` / `ASL_UI`) tích hợp trực tiếp vào `prototype/assets/layout.js` và `prototype/assets/layout.css`, tự động nạp trên mọi trang của prototype.

## 2. Mục tiêu cụ thể
1. **Trong `prototype/assets/layout.js`**:
   - Định nghĩa đối tượng toàn cục `window.ASL_4STATES` (và các hàm helper dùng nhanh như `window.showToast()`, `window.renderEmptyState()`, `window.renderSkeleton()`, `window.renderErrorState()`, `window.showFieldError()`):
     - **Empty State (`renderEmptyState({ title, description, icon, actionText, actionUrl })`)**: Trả về khối HTML chuẩn với icon đồ họa, tiêu đề rõ ràng, mô tả, và nút kêu gọi hành động (CTA).
     - **Loading / Skeleton State (`renderSkeleton({ rows, type })`)**: Khối khung xương shimmer animation mô phỏng bảng danh sách hoặc thẻ card đang tải.
     - **Success Toast (`showToast(message, type = 'success')`)**: Hiển thị popup toast nổi ở góc màn hình với icon checkmark xanh, tự biến mất sau 3 giây, hỗ trợ các type: `success`, `error`, `info`.
     - **Error State (`renderErrorState({ message, retryFn })` & `showFieldError(input, msg)`)**: Khối thông báo lỗi với nút thử lại, và cảnh báo lỗi viền đỏ kèm dòng giải thích dưới ô nhập liệu form.
   - **Interactive State Preview Dock (`init4StateDock()` / `#asl-state-dock`)**:
     - Thêm một dock điều khiển nhỏ gọn, bán trong suốt ở góc phải màn hình (có thể thu gọn/mở rộng) cho phép Người dùng / Trưởng phòng / QA bấm thử nhanh 4 trạng thái:
       - `[✨ Bình thường]`
       - `[📭 Trống (Empty)]`
       - `[⏳ Đang tải (Loading)]`
       - `[🔔 Thông báo Toast]`
       - `[⚠️ Báo lỗi (Error)]`
     - Khi bấm vào các nút này, dock tự động kích hoạt demo trạng thái tương ứng trên trang hiện tại để kiểm tra trực quan!
2. **Trong `prototype/assets/layout.css`**:
   - Định nghĩa hiệu ứng shimmer `@keyframes shimmer` và các class `.asl-skeleton`, `.asl-empty-state`, `.asl-toast-container`, `.asl-toast`, `.asl-field-error`, `.asl-error-state` hỗ trợ hoàn hảo cả 2 chế độ Sáng (Light) và Tối (Dark).
3. **Đảm bảo tính toàn vẹn**:
   - Giữ nguyên các chức năng, theme và bảo toàn `?role=`.
   - `python3 scripts/check-prototype.py --strict` đạt 0 lỗi, 0 cảnh báo trên toàn bộ 44 trang.

## 3. Phạm vi file được phép sửa
- `prototype/assets/layout.js`
- `prototype/assets/layout.css`

## 4. Kiểm tra tự động
```bash
bash handoff/tasks/TASK-005-4-state-ui-components/verify.sh
```
Yêu cầu: tất cả 4 test đều đạt `OK`, exit code 0.
