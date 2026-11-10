# Nhiệm vụ TASK-006: Nâng tương phản chữ nhỏ chuẩn WCAG AA (≥ 4.5:1) ở Light và Dark (A5)

## 1. Bối cảnh
Theo Báo cáo QA (U7, A5):
- Chữ nhỏ (10–12px) ở nhiều vị trí như tiêu đề nhóm menu sidebar (`.nav-section-title`), nhãn chọn vai trò, chữ phụ đang dùng `text-slate-400` trên nền trắng chỉ đạt tỷ lệ tương phản ~2.9:1, trượt chuẩn WCAG 2.1 AA (yêu cầu tối thiểu ≥ 4.5:1 đối với văn bản nhỏ < 18px).
- Ở chế độ Dark Mode (`html.dark`), các dòng text phụ xám mờ cần được nâng độ chói tương đối để hiển thị rõ ràng trên nền tối `#0B132B`.

## 2. Mục tiêu cụ thể
1. **Trong `prototype/assets/layout.js`**:
   - Nâng màu của `.nav-section-title` từ `text-slate-400` lên `text-slate-600` (hoặc `text-slate-500` có tương phản ≥ 4.5:1).
   - Nâng màu nhãn "Vai trò đối tượng:" trong `#sidebar-role-selector` từ `text-slate-400` lên `text-slate-600`.
2. **Trong `prototype/assets/layout.css`**:
   - Thêm quy tắc kỹ thuật tương phản WCAG AA (`/* WCAG AA Contrast Engineering */`).
   - Đảm bảo trong `html.dark`, tiêu đề nhóm `.nav-section-title` và các nhãn phụ hiển thị màu sáng rõ ràng (ví dụ: `#94A3B8` hoặc `text-slate-300`, tương phản ≥ 4.5:1 trên nền tối).
3. **Đảm bảo tính toàn vẹn**:
   - `python3 scripts/check-prototype.py --strict` đạt 0 lỗi, 0 cảnh báo.

## 3. Phạm vi file được phép sửa
- `prototype/assets/layout.js`
- `prototype/assets/layout.css`

## 4. Kiểm tra tự động
```bash
bash handoff/tasks/TASK-006-wcag-aa-contrast-tuning/verify.sh
```
Yêu cầu: tất cả 4 test đều đạt `OK`, exit code 0.
