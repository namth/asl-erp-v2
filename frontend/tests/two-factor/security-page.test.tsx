import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SecurityPage from '@/app/(dashboard)/account/security/page';
import * as authHooks from '@/hooks/use-auth';
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
  usePathname: () => '/account/security',
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

describe('Trang Bảo mật tài khoản (SCR-20 / account/security/page.tsx & brief mục 4, 5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Thẻ trạng thái Xác thực 2 lớp (2FA)', () => {
    it('khi 2FA chưa bật (totp_enabled = false): hiện nút "Bật xác thực 2 lớp", bấm vào mở TwoFactorSetup', async () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: {
          id: 'u-1',
          email: 'attorney@asllaw.vn',
          full_name: 'LS. Đặng Hoàng Giang',
          system_role: 'ATTORNEY',
          totp_enabled: false,
        },
        isLoading: false,
        isError: false,
      } as any);

      vi.spyOn(apiClient, 'apiFetch').mockImplementation(async (url: string) => {
        if (url.includes('/auth/2fa/setup')) {
          return {
            secret: 'TESTSECRETKEY123',
            otpauth_uri: 'otpauth://totp/ASL%20LAW%20ERP:attorney@asllaw.vn?secret=TESTSECRETKEY123&issuer=ASL%20LAW%20ERP',
          };
        }
        return {};
      });

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <SecurityPage />
        </Wrapper>
      );

      // Thẻ 2FA có nút "Bật xác thực 2 lớp"
      const enable2faBtn = screen.getByRole('button', {
        name: /bật xác thực 2 lớp|kích hoạt 2fa|thiết lập 2fa/i,
      });
      expect(enable2faBtn).toBeDefined();

      fireEvent.click(enable2faBtn);

      // Mở TwoFactorSetup: gọi setup và hiển thị secret nhóm 4 ký tự
      await waitFor(() => {
        expect(screen.getByText(/TEST\s+SECR/i)).toBeDefined();
      });
    });

    it('khi 2FA đã bật (totp_enabled = true): hiện "Đang bật", hướng dẫn liên hệ Quản trị viên, KHÔNG có nút tắt 2FA', () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: {
          id: 'u-1',
          email: 'admin@asllaw.vn',
          full_name: 'Quản Trị Viên',
          system_role: 'ADMIN',
          totp_enabled: true,
        },
        isLoading: false,
        isError: false,
      } as any);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <SecurityPage />
        </Wrapper>
      );

      // Hiển thị trạng thái đang bật
      expect(screen.getByText(/đang bật|đã kích hoạt|đã bật/i)).toBeDefined();

      // Hướng dẫn liên hệ Quản trị viên nếu mất thiết bị
      expect(screen.getByText(/quản trị viên/i)).toBeDefined();

      // KHÔNG CÓ nút tự tắt / huỷ kích hoạt 2FA
      expect(screen.queryByRole('button', { name: /tắt 2fa|huỷ 2fa|vô hiệu hoá 2fa|tắt xác thực/i })).toBeNull();
    });
  });

  describe('Form Đổi mật khẩu', () => {
    beforeEach(() => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: {
          id: 'u-1',
          email: 'user@asllaw.vn',
          full_name: 'Nguyễn Văn A',
          system_role: 'ATTORNEY',
          totp_enabled: false,
        },
        isLoading: false,
        isError: false,
      } as any);
    });

    it('kiểm tra chính sách mật khẩu docs/10: từ chối mật khẩu < 10 ký tự', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch');

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <SecurityPage />
        </Wrapper>
      );

      const currentPassInput = screen.getByLabelText(/mật khẩu hiện tại/i) || screen.getByPlaceholderText(/mật khẩu hiện tại/i);
      const newPassInput = screen.getByLabelText(/^mật khẩu mới/i) || screen.getByPlaceholderText(/nhập mật khẩu mới/i);
      const confirmPassInput = screen.getByLabelText(/xác nhận mật khẩu/i) || screen.getByPlaceholderText(/xác nhận/i);
      const submitBtn = screen.getByRole('button', { name: /đổi mật khẩu|cập nhật mật khẩu/i });

      fireEvent.change(currentPassInput, { target: { value: 'OldPass123@' } });
      fireEvent.change(newPassInput, { target: { value: 'Short1@' } }); // chỉ 7 ký tự
      fireEvent.change(confirmPassInput, { target: { value: 'Short1@' } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/10\s*ký\s*tự/i)).toBeDefined();
      });

      expect(apiSpy).not.toHaveBeenCalled();
    });

    it('kiểm tra chính sách mật khẩu docs/10: từ chối thiếu chữ hoa, chữ thường, số, hoặc ký tự đặc biệt', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch');

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <SecurityPage />
        </Wrapper>
      );

      const currentPassInput = screen.getByLabelText(/mật khẩu hiện tại/i) || screen.getByPlaceholderText(/mật khẩu hiện tại/i);
      const newPassInput = screen.getByLabelText(/^mật khẩu mới/i) || screen.getByPlaceholderText(/nhập mật khẩu mới/i);
      const confirmPassInput = screen.getByLabelText(/xác nhận mật khẩu/i) || screen.getByPlaceholderText(/xác nhận/i);
      const submitBtn = screen.getByRole('button', { name: /đổi mật khẩu|cập nhật mật khẩu/i });

      // Thiếu ký tự đặc biệt
      fireEvent.change(currentPassInput, { target: { value: 'OldPass123@' } });
      fireEvent.change(newPassInput, { target: { value: 'NoSpecial12345' } });
      fireEvent.change(confirmPassInput, { target: { value: 'NoSpecial12345' } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/ký tự đặc biệt|chữ hoa|chữ thường|chữ số/i)).toBeDefined();
      });

      expect(apiSpy).not.toHaveBeenCalled();
    });

    it('mật khẩu xác nhận không khớp: báo lỗi và KHÔNG gọi API', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch');

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <SecurityPage />
        </Wrapper>
      );

      const currentPassInput = screen.getByLabelText(/mật khẩu hiện tại/i) || screen.getByPlaceholderText(/mật khẩu hiện tại/i);
      const newPassInput = screen.getByLabelText(/^mật khẩu mới/i) || screen.getByPlaceholderText(/nhập mật khẩu mới/i);
      const confirmPassInput = screen.getByLabelText(/xác nhận mật khẩu/i) || screen.getByPlaceholderText(/xác nhận/i);
      const submitBtn = screen.getByRole('button', { name: /đổi mật khẩu|cập nhật mật khẩu/i });

      fireEvent.change(currentPassInput, { target: { value: 'OldPass123@' } });
      fireEvent.change(newPassInput, { target: { value: 'ValidStrongPass123@' } });
      fireEvent.change(confirmPassInput, { target: { value: 'DifferentPass456@' } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/không khớp/i)).toBeDefined();
      });

      expect(apiSpy).not.toHaveBeenCalled();
    });

    it('đổi mật khẩu thành công: gọi API, hiện thông báo và điều hướng về /login', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ success: true });

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <SecurityPage />
        </Wrapper>
      );

      const currentPassInput = screen.getByLabelText(/mật khẩu hiện tại/i) || screen.getByPlaceholderText(/mật khẩu hiện tại/i);
      const newPassInput = screen.getByLabelText(/^mật khẩu mới/i) || screen.getByPlaceholderText(/nhập mật khẩu mới/i);
      const confirmPassInput = screen.getByLabelText(/xác nhận mật khẩu/i) || screen.getByPlaceholderText(/xác nhận/i);
      const submitBtn = screen.getByRole('button', { name: /đổi mật khẩu|cập nhật mật khẩu/i });

      fireEvent.change(currentPassInput, { target: { value: 'CurrentPass123@' } });
      fireEvent.change(newPassInput, { target: { value: 'BrandNewPass456@' } });
      fireEvent.change(confirmPassInput, { target: { value: 'BrandNewPass456@' } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(apiSpy).toHaveBeenCalledWith(
          expect.stringContaining('/auth/password'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              current_password: 'CurrentPass123@',
              new_password: 'BrandNewPass456@',
            }),
          })
        );
      });

      // Thông báo thành công yêu cầu đăng nhập lại
      await waitFor(() => {
        expect(screen.getByText(/đã đổi mật khẩu.*vui lòng đăng nhập lại/i)).toBeDefined();
      });

      // Điều hướng về /login
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/login');
      });
    });
  });

  describe('Trạng thái tải (Loading state)', () => {
    it('hiển thị Loading Skeleton khi thông tin tài khoản đang tải', () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
      } as any);

      const Wrapper = createWrapper();
      const { container } = render(
        <Wrapper>
          <SecurityPage />
        </Wrapper>
      );

      // Có phần tử skeleton đang animate
      const skeleton = container.querySelector('.animate-pulse') || screen.queryByTestId('loading-skeleton');
      expect(skeleton).not.toBeNull();
    });
  });
});
