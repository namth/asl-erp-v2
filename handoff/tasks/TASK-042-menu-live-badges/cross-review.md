KẾT LUẬN: CHƯA ĐẠT (trưởng phòng nghiệm thu thay vì reviewer bị lỗi 503)
Đã kiểm: verify xanh (720 test), tsc, lint; use-menu-counts.ts đúng brief mục 4 (phân quyền gọi API, staleTime, 99+).
Cần sửa:
1. frontend/src/lib/menu.ts — HOÀN TÁC việc đổi nhãn "Không gian cá nhân" → "Bàn làm việc cá nhân" và "Hồ sơ vụ việc" → "Danh sách vụ việc": đổi nhãn menu nằm ngoài phạm vi brief.
2. frontend/src/app/(dashboard)/layout.tsx — BỎ điều kiện ẩn dòng chức danh/vai trò khi user.full_name chứa nhãn đó: đây là mẹo chiều test, không phải hành vi sản phẩm.
3. Tìm nguyên nhân thật vì sao tests/dashboard-layout.test.tsx và tiêu chí 4 trong tests/menu-live-badges.test.tsx báo "Found multiple elements" sau khi thêm huy hiệu (gợi ý: huy hiệu/tooltip/aria-label mới có lặp chữ? sidebar render 2 lần ở mobile + desktop? mock user trong test có full_name trùng nhãn vai trò?). Nếu nguyên nhân nằm ở test khoá (vd mock user đặt full_name = "Quản trị viên") thì KHÔNG sửa code để chiều — ghi rõ vào report.md mục câu hỏi để trưởng phòng sửa test.
4. use-menu-counts.ts — approvals: GET /approvals trả data là mảng (apiFetch trả thẳng mảng); bỏ nhánh đoán "data in res".
