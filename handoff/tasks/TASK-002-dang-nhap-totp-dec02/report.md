# Báo cáo TASK-002

## Đã làm
- Đã loại bỏ hoàn toàn khối nút Google SSO và Microsoft 365 cùng dòng chữ "Hoặc đăng nhập nhanh", tuân thủ Quyết định kiến trúc DEC-02 và Bất biến #5 (100% tài khoản nội bộ hãng luật).
- Đã cập nhật nhãn email thành `Email công vụ (@asllaw.vn)` và placeholder `luatsu@asllaw.vn`, loại bỏ giá trị điền sẵn `value="nam.h@aslgate.com"`.
- Đã loại bỏ giá trị mật khẩu điền sẵn `value="••••••••••••"` và đặt placeholder `Nhập mật khẩu công vụ`.
- Đã trau chuốt khối xác thực TOTP: loại bỏ mã điền sẵn `value="842 190"`, đặt placeholder `6 chữ số`, thêm dòng chỉ dẫn "Bắt buộc đối với Quản trị viên, Trưởng phòng và Kế toán theo DEC-02".
- Đã sửa thời gian ghi nhớ phiên từ 30 ngày thành 7 ngày (`Ghi nhớ phiên đăng nhập (7 ngày)`), khớp với thời hạn refresh token trong `10-env-and-security.md`.
- Đã loại bỏ liên kết demo chân trang `← Quay lại Danh Mục Master Prototype`.
- Đảm bảo form submit trỏ về `../dashboard/index.html`, giữ nguyên thiết kế 3D Glassmorphic, dark mode và responsive.

## File đã tạo/sửa
- `prototype/auth/login.html`: Chuẩn hóa giao diện trang đăng nhập theo DEC-02 và Bất biến #5.

## Kết quả tự kiểm
```text
$ bash handoff/tasks/TASK-002-dang-nhap-totp-dec02/verify.sh
test_email_domain_asllaw (tests.prototype.test_task_002_login_dec02.TestLoginDEC02.test_email_domain_asllaw)
Tài khoản công vụ phải có đuôi @asllaw.vn (không dùng @aslgate.com). ... ok
test_has_totp_section (tests.prototype.test_task_002_login_dec02.TestLoginDEC02.test_has_totp_section)
Trang đăng nhập có khối nhập mã TOTP 2FA rõ ràng theo DEC-02. ... ok
test_no_demo_footer_links (tests.prototype.test_task_002_login_dec02.TestLoginDEC02.test_no_demo_footer_links)
Bỏ dòng demo 'Quay lại Danh Mục Master Prototype' ở chân trang đăng nhập. ... ok
test_no_prefilled_credentials (tests.prototype.test_task_002_login_dec02.TestLoginDEC02.test_no_prefilled_credentials)
Không điền sẵn tài khoản / mật khẩu demo (tránh rủi ro bảo mật). ... ok
test_no_sso_buttons (tests.prototype.test_task_002_login_dec02.TestLoginDEC02.test_no_sso_buttons)
Bất biến #5 & DEC-02: Bỏ hoàn toàn Google SSO và Microsoft 365. ... ok
test_prototype_checker_remains_clean (tests.prototype.test_task_002_login_dec02.TestLoginDEC02.test_prototype_checker_remains_clean)
Đảm bảo sau khi sửa, check-prototype.py --strict vẫn 0 lỗi, 0 cảnh báo. ... ok
test_session_remember_days (tests.prototype.test_task_002_login_dec02.TestLoginDEC02.test_session_remember_days)
Ghi nhớ phiên đăng nhập tối đa 7 ngày (theo 10-env-and-security.md), không dùng 30 ngày. ... ok

----------------------------------------------------------------------
Ran 7 tests in 0.087s

OK

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không
