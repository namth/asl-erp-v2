# Nhiệm vụ: Chỉnh trang đăng nhập prototype theo DEC-02 và Bất biến #5

- **Mã task:** TASK-002
- **Người giao:** Trưởng phòng Antigravity
- **Người nhận:** Kỹ sư thực thi (macbook / Nams-Air.local)

---

## 1. Mục tiêu

Chuẩn hóa trang đăng nhập prototype (`prototype/auth/login.html`) theo đúng Quyết định kiến trúc **DEC-02** và **Bất biến #5** (chủ quyền dữ liệu, không SSO cloud ngoài, bắt buộc xác thực 2 lớp TOTP nội bộ, bảo mật thông tin).

---

## 2. Bối cảnh & Tài liệu liên quan

- Báo cáo QA: `docs/qa/reports/QA-REPORT-20261030-2318.md` (mục 3, lỗi U1).
- Quyết định kiến trúc: `docs/14-decisions.md` (DEC-02: Đăng nhập nội bộ + TOTP).
- Bất biến dự án: `CONTEXT.md` và `CLAUDE.md` (Bất biến #5: Độc lập hạ tầng, không rò rỉ dữ liệu ra bên ngoài).
- Bảo mật phiên: `docs/10-env-and-security.md` (thời hạn phiên tối đa 7 ngày).

---

## 3. Phạm vi sửa đổi (BẮT BUỘC TUÂN THỦ)

> [!IMPORTANT]
> Bạn **CHỈ ĐƯỢC PHÉP SỬA DUY NHẤT 1 FILE SAU ĐÂY**:
> - `prototype/auth/login.html`
>
> Tuyệt đối không sửa bất kỳ file nào khác ngoài danh sách này.

---

## 4. Yêu cầu chi tiết

1. **Loại bỏ hoàn toàn nút Google SSO & Microsoft 365:**
   - Xóa bỏ khối nút Google SSO và Microsoft 365 cùng dòng chữ "Hoặc đăng nhập nhanh / Single Sign-On".
   - Tuân thủ Bất biến #5: 100% tài khoản nội bộ hãng luật.

2. **Cập nhật nhãn và domain Email công vụ:**
   - Nhãn hiển thị: `Email công vụ (@asllaw.vn)` (thay thế `@aslgate.com`).
   - Xóa bỏ giá trị điền sẵn `value="nam.h@aslgate.com"`. Sử dụng `placeholder="luatsu@asllaw.vn"`.

3. **Mật khẩu:**
   - Xóa bỏ giá trị điền sẵn `value="••••••••••••"`. Sử dụng `placeholder="Nhập mật khẩu công vụ"`.

4. **Xác thực 2 lớp TOTP (Google Authenticator / FreeOTP):**
   - Giữ và trau chuốt khối nhập mã TOTP 6 chữ số:
     - Xóa bỏ giá trị điền sẵn `value="842 190"`. Sử dụng `placeholder="6 chữ số"`.
     - Thêm chỉ dẫn ngắn gọn: "Bắt buộc đối với Quản trị viên, Trưởng phòng và Kế toán theo DEC-02".

5. **Thời gian ghi nhớ phiên:**
   - Sửa dòng `Ghi nhớ phiên đăng nhập (30 ngày)` thành `Ghi nhớ phiên đăng nhập (7 ngày)` (khớp với thời hạn refresh token 7 ngày trong `10-env-and-security.md`).

6. **Loại bỏ liên kết demo chân trang:**
   - Xóa bỏ liên kết `← Quay lại Danh Mục Master Prototype` ở chân trang.

7. **Giữ tính toàn vẹn giao diện:**
   - Đảm bảo form submit trỏ về `../dashboard/index.html`.
   - Giữ nguyên thiết kế 3D Glassmorphic, dark mode hoạt động bình thường, responsive trên mobile (375px) và desktop (1440px).

---

## 5. Tiêu chí nghiệm thu & Tự kiểm tra

Trước khi nộp bài, bạn phải chạy lệnh xác minh và đạt 100% test xanh:

```bash
python3 scripts/handoff.py verify TASK-002
```

Lệnh này thực thi:
1. `python3 -m unittest tests/prototype/test_task_002_login_dec02.py -v` (7 test cases kiểm tra SSO, domain email, prefill credentials, session days, demo links, TOTP).
2. `python3 scripts/check-prototype.py --strict` (đạt 0 lỗi, 0 cảnh báo).
