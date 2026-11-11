import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as apiClient from '@/lib/api-client';
import {
  useSetupTwoFactor,
  useEnableTwoFactor,
  useChangePassword,
} from '@/hooks/use-two-factor';

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

describe('Hooks 2FA & Đổi mật khẩu - use-two-factor.ts (brief mục 4 & 5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.cookie = '';
  });

  afterEach(() => {
    document.cookie = '';
  });

  describe('useSetupTwoFactor hook', () => {
    it('khi truyền auth = { setupToken }: gửi Authorization: Bearer, KHÔNG gắn X-CSRF-Token', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({
        secret: 'JBSWY3DPEHPK3PXP',
        otpauth_uri: 'otpauth://totp/ASL%20LAW%20ERP:user@asllaw.vn?secret=JBSWY3DPEHPK3PXP&issuer=ASL%20LAW%20ERP',
      });

      document.cookie = 'csrf_token=test-csrf-token-value; path=/';

      const wrapper = createWrapper();
      const { result } = renderHook(() => useSetupTwoFactor({ setupToken: 'tok-setup-123' }), {
        wrapper,
      });

      // Nếu hook trả về mutation object
      if ('mutateAsync' in result.current) {
        await act(async () => {
          await (result.current as any).mutateAsync();
        });
      }

      await waitFor(() => {
        expect(apiSpy).toHaveBeenCalled();
      });

      const [path, init] = apiSpy.mock.calls[0];
      expect(path).toContain('/auth/2fa/setup');
      expect(init?.method).toBe('POST');

      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe('Bearer tok-setup-123');
      expect(headers.has('X-CSRF-Token')).toBe(false);
    });

    it('khi auth = undefined (dùng phiên cookie): có X-CSRF-Token từ cookie, KHÔNG gửi Authorization', async () => {
      document.cookie = 'csrf_token=csrf-cookie-999; path=/';

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({
        secret: 'ABCD1234EFGH5678',
        otpauth_uri: 'otpauth://totp/ASL%20LAW%20ERP:attorney@asllaw.vn?secret=ABCD1234EFGH5678&issuer=ASL%20LAW%20ERP',
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useSetupTwoFactor(undefined), { wrapper });

      if ('mutateAsync' in result.current) {
        await act(async () => {
          await (result.current as any).mutateAsync();
        });
      }

      await waitFor(() => {
        expect(apiSpy).toHaveBeenCalled();
      });

      const [path, init] = apiSpy.mock.calls[0];
      expect(path).toContain('/auth/2fa/setup');
      expect(init?.method).toBe('POST');

      const headers = new Headers(init?.headers);
      expect(headers.has('Authorization')).toBe(false);
      // apiFetch tự gắn X-CSRF-Token từ cookie csrf_token cho method POST
      expect(headers.get('X-CSRF-Token')).toBe('csrf-cookie-999');
    });

    it('trả về đúng định dạng secret và otpauth_uri', async () => {
      const mockData = {
        secret: 'TESTSECRETKEY123',
        otpauth_uri: 'otpauth://totp/ASL%20LAW%20ERP:test@asllaw.vn?secret=TESTSECRETKEY123&issuer=ASL%20LAW%20ERP',
      };
      vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockData);

      const wrapper = createWrapper();
      const { result } = renderHook(() => useSetupTwoFactor({ setupToken: 'tok-abc' }), {
        wrapper,
      });

      let resData: any;
      if ('mutateAsync' in result.current) {
        await act(async () => {
          resData = await (result.current as any).mutateAsync();
        });
        expect(resData.secret).toBe('TESTSECRETKEY123');
        expect(resData.otpauth_uri).toContain('otpauth://totp/');
      }
    });
  });

  describe('useEnableTwoFactor hook', () => {
    it('khi truyền auth = { setupToken }: gửi mã 6 số kèm Authorization: Bearer, KHÔNG gắn X-CSRF-Token', async () => {
      const mockCodes = [
        'CODE01', 'CODE02', 'CODE03', 'CODE04', 'CODE05',
        'CODE06', 'CODE07', 'CODE08', 'CODE09', 'CODE10',
      ];
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({
        recovery_codes: mockCodes,
      });

      document.cookie = 'csrf_token=test-csrf; path=/';

      const wrapper = createWrapper();
      const { result } = renderHook(() => useEnableTwoFactor({ setupToken: 'tok-enable-456' }), {
        wrapper,
      });

      await act(async () => {
        await (result.current as any).mutateAsync({ code: '654321' });
      });

      expect(apiSpy).toHaveBeenCalledWith(
        expect.stringContaining('/auth/2fa/enable'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ code: '654321' }),
        })
      );

      const [, init] = apiSpy.mock.calls[0];
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe('Bearer tok-enable-456');
      expect(headers.has('X-CSRF-Token')).toBe(false);
    });

    it('khi auth = undefined (dùng phiên): có X-CSRF-Token, KHÔNG gửi Authorization', async () => {
      document.cookie = 'csrf_token=active-csrf-tok; path=/';

      const mockCodes = [
        'A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7', 'H8', 'I9', 'K0',
      ];
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({
        recovery_codes: mockCodes,
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useEnableTwoFactor(undefined), { wrapper });

      await act(async () => {
        await (result.current as any).mutateAsync({ code: '112233' });
      });

      expect(apiSpy).toHaveBeenCalledWith(
        expect.stringContaining('/auth/2fa/enable'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ code: '112233' }),
        })
      );

      const [, init] = apiSpy.mock.calls[0];
      const headers = new Headers(init?.headers);
      expect(headers.has('Authorization')).toBe(false);
      expect(headers.get('X-CSRF-Token')).toBe('active-csrf-tok');
    });

    it('TOTP_INVALID: ném ApiError khi mã sai', async () => {
      vi.spyOn(apiClient, 'apiFetch').mockRejectedValue(
        new apiClient.ApiError(401, 'TOTP_INVALID', 'Mã xác thực không hợp lệ')
      );

      const wrapper = createWrapper();
      const { result } = renderHook(() => useEnableTwoFactor(undefined), { wrapper });

      let thrownError: any;
      try {
        await act(async () => {
          await (result.current as any).mutateAsync({ code: '000000' });
        });
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeDefined();
      expect(thrownError.code).toBe('TOTP_INVALID');
    });
  });

  describe('useChangePassword hook', () => {
    it('gọi POST /auth/password với { current_password, new_password }', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ success: true });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useChangePassword(), { wrapper });

      await act(async () => {
        await (result.current as any).mutateAsync({
          current_password: 'CurrentPassword123@',
          new_password: 'NewStrongPassword456@',
        });
      });

      expect(apiSpy).toHaveBeenCalledWith(
        expect.stringContaining('/auth/password'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            current_password: 'CurrentPassword123@',
            new_password: 'NewStrongPassword456@',
          }),
        })
      );
    });
  });
});
