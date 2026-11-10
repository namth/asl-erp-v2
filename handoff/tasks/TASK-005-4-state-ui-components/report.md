# Báo cáo TASK-005: Bộ thành phần 4 trạng thái UI dùng chung cho toàn bộ prototype (A3)

## Đã làm
- **Empty State (`renderEmptyState`)**: Xây dựng hàm tạo HTML chuẩn cho trạng thái rỗng kèm icon trực quan, tiêu đề, mô tả và nút kêu gọi hành động (CTA), tích hợp vào đối tượng toàn cục `window.ASL_4STATES.empty`.
- **Skeleton Loading State (`renderSkeleton`)**: Xây dựng hiệu ứng khung xương tải dạng bảng (table) và dạng thẻ (card) với hiệu ứng animation `@keyframes shimmer`, tích hợp vào `window.ASL_4STATES.loading`.
- **Toast Notifications (`showToast`)**: Xây dựng thành phần popup toast nổi ở góc phải màn hình, hỗ trợ các kiểu `success`, `error`, `info`, tự động mờ dần và biến mất sau 3 giây, tích hợp vào `window.ASL_4STATES.toast`.
- **Error State & Field Error (`renderErrorState` & `showFieldError`)**: Khối thông báo lỗi trang có nút thử lại và hàm cảnh báo viền đỏ kèm text hướng dẫn dưới input form khi dữ liệu không hợp lệ.
- **Interactive State Preview Dock (`init4StateDock` / `#asl-state-dock`)**: Tạo dock điều khiển cố định ở góc dưới bên phải màn hình, hỗ trợ thu gọn/mở rộng, cho phép Người dùng / QA bấm chuyển đổi trực quan nhanh 4 trạng thái (`Bình thường`, `Trống`, `Đang tải`, `Toast`, `Báo lỗi`) trên trang hiện tại.
- **Tương thích toàn diện Light / Dark Mode**: Định nghĩa đầy đủ các class CSS `.asl-skeleton`, `.asl-empty-state`, `.asl-toast-container`, `.asl-toast`, `.asl-error-state`, `.asl-field-error`, `#asl-state-dock` hoạt động tối ưu trên cả giao diện Sáng và Tối.
- **Bảo toàn tính toàn vẹn prototype**: Giữ vững 0 lỗi và 0 cảnh báo trên toàn bộ 44 trang khi chạy `check-prototype.py --strict`.

## File đã tạo/sửa
- `prototype/assets/layout.css`: Thêm hiệu ứng `@keyframes shimmer`, styling chuẩn cho Empty State, Skeleton Shimmer, Toast Notification, Error State, Field Error Validation và Dock điều khiển xem trước 4 trạng thái (#asl-state-dock), hỗ trợ Light và Dark mode.
- `prototype/assets/layout.js`: Định nghĩa các hàm helper toàn cục (`renderEmptyState`, `renderSkeleton`, `showToast`, `renderErrorState`, `showFieldError`, `clearFieldError`), đối tượng `window.ASL_4STATES`, cơ chế dock điều khiển xem trước trạng thái `init4StateDock()` và tự động nạp khi trang tải.

## Kết quả tự kiểm
```text
$ bash handoff/tasks/TASK-005-4-state-ui-components/verify.sh
test_4states_css_classes_in_layout_css (tests.prototype.test_task_005_4states.Test4StatesUIComponent.test_4states_css_classes_in_layout_css)
layout.css phải có class định dạng cho đủ 4 trạng thái: Empty, Skeleton/Loading shimmer, Toast, Error. ... ok
test_4states_engine_in_layout_js (tests.prototype.test_task_005_4states.Test4StatesUIComponent.test_4states_engine_in_layout_js)
layout.js phải định nghĩa hệ thống 4 trạng thái dùng chung (Empty, Loading/Skeleton, Success/Toast, Error). ... ok
test_interactive_state_dock_or_preview_simulator (tests.prototype.test_task_005_4states.Test4StatesUIComponent.test_interactive_state_dock_or_preview_simulator)
layout.js phải cung cấp bộ điều khiển xem trước 4 trạng thái tương tác trên prototype. ... ok
test_prototype_checker_strict_clean (tests.prototype.test_task_005_4states.Test4StatesUIComponent.test_prototype_checker_strict_clean)
Toàn bộ 44 trang prototype giữ vững 0 lỗi và 0 cảnh báo. ... ok

----------------------------------------------------------------------
Ran 4 tests in 0.110s

OK

44 trang, 360 link nội bộ — 0 lỗi, 0 cảnh báo

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không.
