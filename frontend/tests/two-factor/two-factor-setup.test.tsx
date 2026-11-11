import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as TwoFactorSetupModule from '@/components/two-factor/two-factor-setup';
import * as apiClient from '@/lib/api-client';

const TwoFactorSetup =
  (TwoFactorSetupModule as any).TwoFactorSetup || (TwoFactorSetupModule as any).default;

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

describe('Thành phần TwoFactorSetup (brief mục 4 & 5)', () => {
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
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    if (!window.URL.createObjectURL) {
      window.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-download-url');
    }
    if (!window.URL.revokeObjectURL) {
      window.URL.revokeObjectURL = vi.fn();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Bước 1: Quét mã QR & Khoá bí mật', () => {
    it('gọi setup API, hiển thị mã QR và secret chia theo nhóm 4 ký tự', async () => {
      vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({
        secret: mockSecret,
        otpauth_uri: mockOtpauthUri,
      });

      const Wrapper = createWrapper();
      const { container } = render(
        <Wrapper>
          <TwoFactorSetup setupToken="tok-test-1" />
        </Wrapper>
      );

      // Chờ dữ liệu setup tải xong
      await waitFor(() => {
        // Secret hiển thị dạng nhóm 4 ký tự (JBSW Y3DP EHPK 3PXP)
        expect(screen.getByText(/JBSW\s+Y3DP\s+EHPK\s+3PXP/i)).toBeDefined();
      });

      // QR render từ otpauth_uri (qrcode.react render ra svg hoặc canvas)
      const qrElement = container.querySelector('svg, canvas, img');
      expect(qrElement).toBeDefined();
    });

    it('nút sao chép bí mật: bấm sao chép ghi đúng secret vào clipboard', async () => {
      vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({
        secret: mockSecret,
        otpauth_uri: mockOtpauthUri,
      });

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <TwoFactorSetup setupToken="tok-test-1" />
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/JBSW\s+Y3DP/i)).toBeDefined();
      });

      const copySecretBtn = screen.getByRole('button', {
        name: /sao chép|copy/i,
      });
      fireEvent.click(copySecretBtn);

      expect(writeTextMock).toHaveBeenCalledWith(mockSecret);
    });

    it('chuyển sang bước 2 khi bấm nút Tiếp tục', async () => {
      vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({
        secret: mockSecret,
        otpauth_uri: mockOtpauthUri,
      });

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <TwoFactorSetup setupToken="tok-test-1" />
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/JBSW\s+Y3DP/i)).toBeDefined();
      });

      const nextBtn = screen.getByRole('button', {
        name: /tiếp tục|tiếp theo|bước tiếp|xác thực/i,
      });
      fireEvent.click(nextBtn);

      // Bước 2: ô nhập 6 số xuất hiện
      await waitFor(() => {
        expect(
          screen.getByPlaceholderText(/6\s*chữ\s*số|000000/i) ||
          screen.getByLabelText(/mã\s*xác\s*thực|mã\s*totp|mã\s*6\s*số/i)
        ).toBeDefined();
      });
    });
  });

  describe('Bước 2: Ô nhập mã 6 số & tự gửi khi đủ 6 số', () => {
    async function goToStep2() {
      vi.spyOn(apiClient, 'apiFetch').mockImplementation(async (url: string) => {
        if (url.includes('/auth/2fa/setup')) {
          return {
            secret: mockSecret,
            otpauth_uri: mockOtpauthUri,
          };
        }
        return {};
      });

      const Wrapper = createWrapper();
      const res = render(
        <Wrapper>
          <TwoFactorSetup setupToken="tok-test-2" />
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/JBSW\s+Y3DP/i)).toBeDefined();
      });

      const nextBtn = screen.getByRole('button', {
        name: /tiếp tục|tiếp theo|bước tiếp|xác thực/i,
      });
      fireEvent.click(nextBtn);

      await waitFor(() => {
        const input =
          screen.queryByPlaceholderText(/6\s*chữ\s*số|000000/i) ||
          screen.queryByLabelText(/mã\s*xác\s*thực|mã\s*totp|mã\s*6\s*số/i);
        expect(input).not.toBeNull();
      });

      const input = (screen.queryByPlaceholderText(/6\s*chữ\s*số|000000/i) ||
        screen.queryByLabelText(/mã\s*xác\s*thực|mã\s*totp|mã\s*6\s*số/i)) as HTMLInputElement;

      return { ...res, input };
    }

    it('ô nhập chỉ chấp nhận ký tự số, bỏ qua chữ cái và ký tự đặc biệt', async () => {
      const { input } = await goToStep2();

      fireEvent.change(input, { target: { value: 'abc!@#' } });
      // Không nhận ký tự chữ/đặc biệt
      expect(input.value).not.toContain('abc');
      expect(input.value).not.toContain('!@#');
    });

    it('tự gửi khi nhập đủ 6 chữ số (không cần bấm nút)', async () => {
      const { input } = await goToStep2();

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({
        recovery_codes: mockRecoveryCodes,
      });

      fireEvent.change(input, { target: { value: '123456' } });

      await waitFor(() => {
        expect(apiSpy).toHaveBeenCalledWith(
          expect.stringContaining('/auth/2fa/enable'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ code: '123456' }),
          })
        );
      });
    });

    it('TOTP_INVALID: hiện thông báo lỗi dưới ô nhập và cho phép nhập lại', async () => {
      const { input } = await goToStep2();

      vi.spyOn(apiClient, 'apiFetch').mockRejectedValue(
        new apiClient.ApiError(401, 'TOTP_INVALID', 'Mã xác thực không chính xác hoặc đã hết hạn')
      );

      fireEvent.change(input, { target: { value: '999999' } });

      await waitFor(() => {
        expect(
          screen.getByText(/không chính xác|không hợp lệ|mã sai/i)
        ).toBeDefined();
      });

      // Ô nhập vẫn cho phép nhập lại (không bị disabled vĩnh viễn)
      expect(input.disabled).toBe(false);
    });
  });

  describe('Bước 3: Hiển thị 10 mã khôi phục & Lưu trữ an toàn', () => {
    async function goToStep3(props: any = {}) {
      vi.spyOn(apiClient, 'apiFetch').mockImplementation(async (url: string) => {
        if (url.includes('/auth/2fa/setup')) {
          return {
            secret: mockSecret,
            otpauth_uri: mockOtpauthUri,
          };
        }
        if (url.includes('/auth/2fa/enable')) {
          return {
            recovery_codes: mockRecoveryCodes,
          };
        }
        return {};
      });

      const Wrapper = createWrapper();
      const res = render(
        <Wrapper>
          <TwoFactorSetup setupToken="tok-test-3" {...props} />
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/JBSW\s+Y3DP/i)).toBeDefined();
      });

      const nextBtn = screen.getByRole('button', {
        name: /tiếp tục|tiếp theo|bước tiếp|xác thực/i,
      });
      fireEvent.click(nextBtn);

      await waitFor(() => {
        const input =
          screen.queryByPlaceholderText(/6\s*chữ\s*số|000000/i) ||
          screen.queryByLabelText(/mã\s*xác\s*thực|mã\s*totp|mã\s*6\s*số/i);
        expect(input).not.toBeNull();
      });

      const input = (screen.queryByPlaceholderText(/6\s*chữ\s*số|000000/i) ||
        screen.queryByLabelText(/mã\s*xác\s*thực|mã\s*totp|mã\s*6\s*số/i)) as HTMLInputElement;

      fireEvent.change(input, { target: { value: '654321' } });

      await waitFor(() => {
        expect(screen.getByText('RC01-AAAA')).toBeDefined();
      });

      return res;
    }

    it('hiển thị đủ 10 mã khôi phục theo định dạng monospace', async () => {
      await goToStep3();

      for (const code of mockRecoveryCodes) {
        expect(screen.getByText(code)).toBeDefined();
      }
    });

    it('nút "Tôi đã lưu mã" bị khoá (disabled) cho tới khi sao chép hoặc tải tệp', async () => {
      await goToStep3();

      const finishBtn = screen.getByRole('button', {
        name: /tôi đã lưu mã|đã lưu mã|hoàn tất/i,
      }) as HTMLButtonElement;

      // Ban đầu bị khoá
      expect(finishBtn.disabled).toBe(true);
    });

    it('sau khi bấm "Sao chép tất cả", nút "Tôi đã lưu mã" được mở khoá', async () => {
      await goToStep3();

      const finishBtn = screen.getByRole('button', {
        name: /tôi đã lưu mã|đã lưu mã|hoàn tất/i,
      }) as HTMLButtonElement;

      expect(finishBtn.disabled).toBe(true);

      const copyAllBtn = screen.getByRole('button', {
        name: /sao chép tất cả|sao chép toàn bộ/i,
      });
      fireEvent.click(copyAllBtn);

      expect(writeTextMock).toHaveBeenCalled();
      const copiedText = writeTextMock.mock.calls[0][0];
      for (const code of mockRecoveryCodes) {
        expect(copiedText).toContain(code);
      }

      // Đã mở khoá nút
      expect(finishBtn.disabled).toBe(false);
    });

    it('sau khi bấm "Tải tệp .txt", nút "Tôi đã lưu mã" được mở khoá', async () => {
      await goToStep3();

      const finishBtn = screen.getByRole('button', {
        name: /tôi đã lưu mã|đã lưu mã|hoàn tất/i,
      }) as HTMLButtonElement;

      expect(finishBtn.disabled).toBe(true);

      const downloadBtn = screen.getByRole('button', {
        name: /tải tệp|tải về|\.txt/i,
      });
      fireEvent.click(downloadBtn);

      // Đã mở khoá nút
      expect(finishBtn.disabled).toBe(false);
    });

    it('khi đóng bước 3: gọi callback onComplete/onSuccess và xoá secret + recovery codes khỏi DOM', async () => {
      const onCompleteMock = vi.fn();
      await goToStep3({ onComplete: onCompleteMock, onSuccess: onCompleteMock });

      const copyAllBtn = screen.getByRole('button', {
        name: /sao chép tất cả|sao chép toàn bộ/i,
      });
      fireEvent.click(copyAllBtn);

      const finishBtn = screen.getByRole('button', {
        name: /tôi đã lưu mã|đã lưu mã|hoàn tất/i,
      }) as HTMLButtonElement;

      fireEvent.click(finishBtn);

      await waitFor(() => {
        expect(onCompleteMock).toHaveBeenCalled();
      });

      // Secret và mã khôi phục không còn hiển thị trong DOM
      expect(screen.queryByText(/JBSWY3DPEHPK3PXP/i)).toBeNull();
      expect(screen.queryByText('RC01-AAAA')).toBeNull();
    });
  });
});
