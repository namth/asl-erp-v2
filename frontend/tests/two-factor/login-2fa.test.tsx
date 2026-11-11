import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('Đăng nhập với yêu cầu thiết lập 2FA bắt buộc (brief mục 4 & 5)', () => {
  const mockSetupToken = 'setup-tok-login-99';
  const mockSecret = 'JBSWY3DPEHPK3PXP';
  const mockOtpauthUri =
    'otpauth://totp/ASL%20LAW%20ERP:user@asllaw.vn?secret=JBSWY3DPEHPK3PXP&issuer=ASL%20LAW%20ERP';
  const mockRecoveryCodes = [
    'RC01-AAAA', 'RC02-BBBB', 'RC03-CCCC', 'RC04-DDDD', 'RC05-EEEE',
    'RC06-FFFF', 'RC07-GGGG', 'RC08-HHHH', 'RC09-IIII', 'RC10-KKKK',
  ];

  let writeTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
    localStorage.clear();
    sessionStorage.clear();

    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    if (!window.URL.createObjectURL) {
      window.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    }
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('TOTP_SETUP_REQUIRED: mở TwoFactorSetup với setup_token và điều hướng về / sau khi hoàn tất', async () => {
    const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/auth/login')) {
        throw new apiClient.ApiError(403, 'TOTP_SETUP_REQUIRED', 'Tài khoản cần thiết lập 2FA', {
          setup_token: mockSetupToken,
        });
      }
      if (u.includes('/auth/2fa/setup')) {
        return {
          secret: mockSecret,
          otpauth_uri: mockOtpauthUri,
        };
      }
      if (u.includes('/auth/2fa/enable')) {
        return {
          recovery_codes: mockRecoveryCodes,
        };
      }
      return {};
    });

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <LoginPage />
      </Wrapper>
    );

    const emailInput = screen.getByLabelText(/email/i) || screen.getByPlaceholderText(/@asllaw\.vn/i);
    const passwordInput = screen.getByLabelText(/mật khẩu/i) || screen.getByPlaceholderText(/mật khẩu/i);
    const submitBtn = screen.getByRole('button', { name: /đăng nhập|xác thực/i });

    fireEvent.change(emailInput, { target: { value: 'user@asllaw.vn' } });
    fireEvent.change(passwordInput, { target: { value: 'ValidPass123@' } });
    fireEvent.click(submitBtn);

    // Mở luồng thiết lập 2FA: hiển thị secret chia nhóm 4 ký tự
    await waitFor(() => {
      expect(screen.getByText(/JBSW\s+Y3DP/i)).toBeDefined();
    });

    // Bấm Tiếp tục sang bước 2
    const nextBtn = screen.getByRole('button', {
      name: /tiếp tục|tiếp theo|bước tiếp|xác thực/i,
    });
    fireEvent.click(nextBtn);

    // Nhập mã 6 số
    await waitFor(() => {
      const input =
        screen.queryByPlaceholderText(/6\s*chữ\s*số|000000/i) ||
        screen.queryByLabelText(/mã\s*xác\s*thực|mã\s*totp|mã\s*6\s*số/i);
      expect(input).not.toBeNull();
    });

    const totpInput = (screen.queryByPlaceholderText(/6\s*chữ\s*số|000000/i) ||
      screen.queryByLabelText(/mã\s*xác\s*thực|mã\s*totp|mã\s*6\s*số/i)) as HTMLInputElement;

    fireEvent.change(totpInput, { target: { value: '654321' } });

    // Enable API được gọi với setupToken
    await waitFor(() => {
      expect(apiSpy).toHaveBeenCalledWith(
        expect.stringContaining('/auth/2fa/enable'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ code: '654321' }),
        })
      );
    });

    // Bước 3: hiển thị mã khôi phục
    await waitFor(() => {
      expect(screen.getByText('RC01-AAAA')).toBeDefined();
    });

    // Sao chép mã để mở khoá nút hoàn tất
    const copyAllBtn = screen.getByRole('button', {
      name: /sao chép tất cả|sao chép toàn bộ/i,
    });
    fireEvent.click(copyAllBtn);

    const finishBtn = screen.getByRole('button', {
      name: /tôi đã lưu mã|đã lưu mã|hoàn tất/i,
    });
    fireEvent.click(finishBtn);

    // Sau khi kết thúc, điều hướng về trang chủ /
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('bảo mật: KHÔNG lưu trữ setup_token, secret, mã khôi phục hay mật khẩu vào localStorage/sessionStorage', async () => {
    vi.spyOn(apiClient, 'apiFetch').mockImplementation(async (url: string) => {
      if (url.includes('/auth/login')) {
        throw new apiClient.ApiError(403, 'TOTP_SETUP_REQUIRED', 'Tài khoản cần thiết lập 2FA', {
          setup_token: mockSetupToken,
        });
      }
      if (url.includes('/auth/2fa/setup')) {
        return {
          secret: mockSecret,
          otpauth_uri: mockOtpauthUri,
        };
      }
      return {};
    });

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <LoginPage />
      </Wrapper>
    );

    const emailInput = screen.getByLabelText(/email/i) || screen.getByPlaceholderText(/@asllaw\.vn/i);
    const passwordInput = screen.getByLabelText(/mật khẩu/i) || screen.getByPlaceholderText(/mật khẩu/i);
    const submitBtn = screen.getByRole('button', { name: /đăng nhập|xác thực/i });

    fireEvent.change(emailInput, { target: { value: 'user@asllaw.vn' } });
    fireEvent.change(passwordInput, { target: { value: 'TopSecretPass123@' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/JBSW\s+Y3DP/i)).toBeDefined();
    });

    // Kiểm tra localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || '';
      const val = localStorage.getItem(key) || '';
      expect(key.toLowerCase()).not.toContain('token');
      expect(key.toLowerCase()).not.toContain('secret');
      expect(val).not.toContain(mockSetupToken);
      expect(val).not.toContain(mockSecret);
      expect(val).not.toContain('TopSecretPass123@');
    }

    // Kiểm tra sessionStorage
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i) || '';
      const val = sessionStorage.getItem(key) || '';
      expect(key.toLowerCase()).not.toContain('token');
      expect(key.toLowerCase()).not.toContain('secret');
      expect(val).not.toContain(mockSetupToken);
      expect(val).not.toContain(mockSecret);
      expect(val).not.toContain('TopSecretPass123@');
    }
  });
});
