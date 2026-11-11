import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import LoginPage from '@/app/(auth)/login/page';
import * as apiClient from '@/lib/api-client';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/login',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Trang Đăng Nhập (SCR-01 & DEC-02)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('giao diện chuẩn: có logo/tiêu đề ASL LAW, ô email, ô mật khẩu, nút đăng nhập', () => {
    render(<LoginPage />);

    expect(screen.getByText(/ASL LAW/i)).toBeDefined();
    expect(screen.getByLabelText(/email/i) || screen.getByPlaceholderText(/@asllaw\.vn/i)).toBeDefined();
    expect(screen.getByLabelText(/mật khẩu/i) || screen.getByPlaceholderText(/mật khẩu/i)).toBeDefined();

    const submitBtn = screen.getByRole('button', { name: /đăng nhập|xác thực/i });
    expect(submitBtn).toBeDefined();

    // Không có nút SSO theo DEC-02
    expect(screen.queryByText(/google/i)).toBeNull();
    expect(screen.queryByText(/microsoft/i)).toBeNull();
    expect(screen.queryByText(/sso/i)).toBeNull();
  });

  it('kiểm tra email sai đuôi: báo lỗi và KHÔNG gọi API', async () => {
    const apiSpy = vi.spyOn(apiClient, 'apiFetch');
    render(<LoginPage />);

    const emailInput = screen.getByLabelText(/email/i) || screen.getByPlaceholderText(/@asllaw\.vn/i);
    const passwordInput = screen.getByLabelText(/mật khẩu/i) || screen.getByPlaceholderText(/mật khẩu/i);
    const submitBtn = screen.getByRole('button', { name: /đăng nhập|xác thực/i });

    fireEvent.change(emailInput, { target: { value: 'user@gmail.com' } });
    fireEvent.change(passwordInput, { target: { value: 'Secret123@' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/@asllaw\.vn/i)).toBeDefined();
    });

    expect(apiSpy).not.toHaveBeenCalled();
  });

  it('mật khẩu để trống: báo lỗi và KHÔNG gọi API', async () => {
    const apiSpy = vi.spyOn(apiClient, 'apiFetch');
    render(<LoginPage />);

    const emailInput = screen.getByLabelText(/email/i) || screen.getByPlaceholderText(/@asllaw\.vn/i);
    const submitBtn = screen.getByRole('button', { name: /đăng nhập|xác thực/i });

    fireEvent.change(emailInput, { target: { value: 'luatsu@asllaw.vn' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/mật khẩu/i)).toBeDefined();
    });

    expect(apiSpy).not.toHaveBeenCalled();
  });

  it('nút bị khoá (disabled) khi đang gửi yêu cầu (Loading state)', async () => {
    let resolvePromise: (val: any) => void;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    vi.spyOn(apiClient, 'apiFetch').mockImplementation(() => promise as any);

    render(<LoginPage />);
    const emailInput = screen.getByLabelText(/email/i) || screen.getByPlaceholderText(/@asllaw\.vn/i);
    const passwordInput = screen.getByLabelText(/mật khẩu/i) || screen.getByPlaceholderText(/mật khẩu/i);
    const submitBtn = screen.getByRole('button', { name: /đăng nhập|xác thực/i });

    fireEvent.change(emailInput, { target: { value: 'luatsu@asllaw.vn' } });
    fireEvent.change(passwordInput, { target: { value: 'ValidPass123@' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect((submitBtn as HTMLButtonElement).disabled).toBe(true);
    });

    resolvePromise!({ user: { id: 'u1' } });
  });

  it('UNAUTHENTICATED: hiển thị thông báo "Email hoặc mật khẩu không đúng"', async () => {
    vi.spyOn(apiClient, 'apiFetch').mockRejectedValue(
      new apiClient.ApiError(401, 'UNAUTHENTICATED', 'Email hoặc mật khẩu không đúng')
    );

    render(<LoginPage />);
    const emailInput = screen.getByLabelText(/email/i) || screen.getByPlaceholderText(/@asllaw\.vn/i);
    const passwordInput = screen.getByLabelText(/mật khẩu/i) || screen.getByPlaceholderText(/mật khẩu/i);
    const submitBtn = screen.getByRole('button', { name: /đăng nhập|xác thực/i });

    fireEvent.change(emailInput, { target: { value: 'luatsu@asllaw.vn' } });
    fireEvent.change(passwordInput, { target: { value: 'WrongPass123@' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/email hoặc mật khẩu không đúng/i)).toBeDefined();
    });
  });

  it('ACCOUNT_LOCKED: hiển thị thông báo khoá kèm số phút tính từ details.retry_after_seconds', async () => {
    vi.spyOn(apiClient, 'apiFetch').mockRejectedValue(
      new apiClient.ApiError(423, 'ACCOUNT_LOCKED', 'Tài khoản bị khoá tạm thời', {
        retry_after_seconds: 900,
      })
    );

    render(<LoginPage />);
    const emailInput = screen.getByLabelText(/email/i) || screen.getByPlaceholderText(/@asllaw\.vn/i);
    const passwordInput = screen.getByLabelText(/mật khẩu/i) || screen.getByPlaceholderText(/mật khẩu/i);
    const submitBtn = screen.getByRole('button', { name: /đăng nhập|xác thực/i });

    fireEvent.change(emailInput, { target: { value: 'luatsu@asllaw.vn' } });
    fireEvent.change(passwordInput, { target: { value: 'WrongPass123@' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      // 900 giây = 15 phút
      expect(screen.getByText(/15\s*phút/i)).toBeDefined();
    });
  });

  it('TOTP_REQUIRED: chuyển sang bước 2 nhập mã 6 số và gọi /auth/2fa/verify với challenge_id', async () => {
    const apiSpy = vi.spyOn(apiClient, 'apiFetch');
    apiSpy.mockRejectedValueOnce(
      new apiClient.ApiError(401, 'TOTP_REQUIRED', 'Yêu cầu mã 2FA', {
        challenge_id: 'ch-xyz-789',
      })
    );

    render(<LoginPage />);
    const emailInput = screen.getByLabelText(/email/i) || screen.getByPlaceholderText(/@asllaw\.vn/i);
    const passwordInput = screen.getByLabelText(/mật khẩu/i) || screen.getByPlaceholderText(/mật khẩu/i);
    const submitBtn = screen.getByRole('button', { name: /đăng nhập|xác thực/i });

    fireEvent.change(emailInput, { target: { value: 'admin@asllaw.vn' } });
    fireEvent.change(passwordInput, { target: { value: 'ValidPass123@' } });
    fireEvent.click(submitBtn);

    // Bước 2: ô nhập mã 6 số xuất hiện
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/6\s*chữ\s*số/i) || screen.getByLabelText(/mã\s*xác\s*thực|totp/i)).toBeDefined();
    });

    apiSpy.mockResolvedValueOnce({ success: true, user: { id: 'u1' } });

    const totpInput = screen.getByPlaceholderText(/6\s*chữ\s*số/i) || screen.getByLabelText(/mã\s*xác\s*thực|totp/i);
    const verifyBtn = screen.getByRole('button', { name: /xác thực|xác nhận|tiếp tục/i });

    fireEvent.change(totpInput, { target: { value: '123456' } });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(apiSpy).toHaveBeenCalledWith(
        '/auth/2fa/verify',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ challenge_id: 'ch-xyz-789', code: '123456' }),
        })
      );
    });
  });

  it('TOTP_SETUP_REQUIRED: thông báo người dùng cần thiết lập 2FA', async () => {
    vi.spyOn(apiClient, 'apiFetch').mockRejectedValue(
      new apiClient.ApiError(403, 'TOTP_SETUP_REQUIRED', 'Tài khoản cần thiết lập 2FA')
    );

    render(<LoginPage />);
    const emailInput = screen.getByLabelText(/email/i) || screen.getByPlaceholderText(/@asllaw\.vn/i);
    const passwordInput = screen.getByLabelText(/mật khẩu/i) || screen.getByPlaceholderText(/mật khẩu/i);
    const submitBtn = screen.getByRole('button', { name: /đăng nhập|xác thực/i });

    fireEvent.change(emailInput, { target: { value: 'admin@asllaw.vn' } });
    fireEvent.change(passwordInput, { target: { value: 'ValidPass123@' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/thiết lập 2fa/i)).toBeDefined();
    });
  });

  it('PASSWORD_RESET_REQUIRED: hiển thị form mật khẩu mới và gọi /auth/password với Bearer reset_token', async () => {
    const apiSpy = vi.spyOn(apiClient, 'apiFetch');
    apiSpy.mockRejectedValueOnce(
      new apiClient.ApiError(403, 'PASSWORD_RESET_REQUIRED', 'Bắt buộc đổi mật khẩu', {
        reset_token: 'reset-tok-999',
      })
    );

    render(<LoginPage />);
    const emailInput = screen.getByLabelText(/email/i) || screen.getByPlaceholderText(/@asllaw\.vn/i);
    const passwordInput = screen.getByLabelText(/mật khẩu/i) || screen.getByPlaceholderText(/mật khẩu/i);
    const submitBtn = screen.getByRole('button', { name: /đăng nhập|xác thực/i });

    fireEvent.change(emailInput, { target: { value: 'newuser@asllaw.vn' } });
    fireEvent.change(passwordInput, { target: { value: 'TempPass123@' } });
    fireEvent.click(submitBtn);

    // Form đổi mật khẩu mới xuất hiện
    await waitFor(() => {
      expect(screen.getByLabelText(/mật khẩu mới/i) || screen.getByPlaceholderText(/mật khẩu mới/i)).toBeDefined();
    });

    apiSpy.mockResolvedValueOnce({ success: true });

    const newPassInput = screen.getByLabelText(/mật khẩu mới/i) || screen.getByPlaceholderText(/mật khẩu mới/i);
    const savePassBtn = screen.getByRole('button', { name: /đổi mật khẩu|cập nhật|xác nhận/i });

    fireEvent.change(newPassInput, { target: { value: 'NewSuperPass456@' } });
    fireEvent.click(savePassBtn);

    await waitFor(() => {
      expect(apiSpy).toHaveBeenCalledWith(
        '/auth/password',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer reset-tok-999',
          }),
        })
      );
    });
  });

  it('đăng nhập thành công: điều hướng về trang chủ /', async () => {
    vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({
      user: { id: 'u1', email: 'luatsu@asllaw.vn', system_role: 'ATTORNEY' },
    });

    render(<LoginPage />);
    const emailInput = screen.getByLabelText(/email/i) || screen.getByPlaceholderText(/@asllaw\.vn/i);
    const passwordInput = screen.getByLabelText(/mật khẩu/i) || screen.getByPlaceholderText(/mật khẩu/i);
    const submitBtn = screen.getByRole('button', { name: /đăng nhập|xác thực/i });

    fireEvent.change(emailInput, { target: { value: 'luatsu@asllaw.vn' } });
    fireEvent.change(passwordInput, { target: { value: 'ValidPass123@' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('bảo mật: KHÔNG lưu mật khẩu hoặc token vào localStorage', async () => {
    vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({
      token: 'jwt-access-token',
      user: { id: 'u1' },
    });

    render(<LoginPage />);
    const emailInput = screen.getByLabelText(/email/i) || screen.getByPlaceholderText(/@asllaw\.vn/i);
    const passwordInput = screen.getByLabelText(/mật khẩu/i) || screen.getByPlaceholderText(/mật khẩu/i);
    const submitBtn = screen.getByRole('button', { name: /đăng nhập|xác thực/i });

    fireEvent.change(emailInput, { target: { value: 'luatsu@asllaw.vn' } });
    fireEvent.change(passwordInput, { target: { value: 'MySecretPass123@' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/');
    });

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || '';
      const val = localStorage.getItem(key) || '';
      expect(key.toLowerCase()).not.toContain('token');
      expect(key.toLowerCase()).not.toContain('password');
      expect(val).not.toContain('MySecretPass123@');
      expect(val).not.toContain('jwt-access-token');
    }
  });
});
