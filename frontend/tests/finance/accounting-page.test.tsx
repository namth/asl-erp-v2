import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import AccountingInboxPage from '@/app/(dashboard)/accounting/page';
import * as accountingHooks from '@/hooks/use-accounting';
import * as authHooks from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';

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
  usePathname: () => '/accounting',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Màn hình Bàn làm việc Kế toán & Đối soát đợt thu (SCR-11 & brief mục 4, 5)', () => {
  const sampleInboxItem = {
    milestone_id: 'ms-001',
    case: {
      id: 'case-001',
      case_code: 'ASL-2026-LD-0001',
      title: 'Tranh chấp hợp đồng cung ứng dịch vụ',
      client_name: 'Công ty Cổ phần TechLog',
    },
    name: 'Đợt 1: Tạm ứng khi ký kết',
    amount: '60000000',
    received_total: '0',
    remaining: '60000000',
    status: 'AWAITING_PAYMENT',
    awaiting_since: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 ngày trước (> 7 ngày)
    payments: [],
  };

  const sampleRecentItem = {
    milestone_id: 'ms-002',
    case: {
      id: 'case-002',
      case_code: 'ASL-2026-TM-0015',
      title: 'Đăng ký nhãn hiệu VinaSmart',
      client_name: 'Tập đoàn VinaSmart',
    },
    name: 'Đợt 2: Nộp hồ sơ Cục SHTT',
    amount: '40000000',
    received_total: '10000000',
    remaining: '30000000',
    status: 'PARTIALLY_PAID',
    awaiting_since: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 ngày trước (<= 7 ngày)
    payments: [],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();

    // Mặc định đăng nhập với vai trò ACCOUNTANT
    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: {
        id: 'u-acc',
        full_name: 'Trần Thị Thu Trang',
        system_role: 'ACCOUNTANT',
      },
      isLoading: false,
      isError: false,
    } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Phân quyền truy cập theo vai trò', () => {
    it('vai trò khác ACCOUNTANT (như ATTORNEY, MANAGER) bị chặn với ErrorState "Không có quyền truy cập"', () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: {
          id: 'u-lawyer',
          full_name: 'LS. Nguyễn Văn An',
          system_role: 'ATTORNEY',
        },
        isLoading: false,
        isError: false,
      } as any);

      vi.spyOn(accountingHooks, 'useAccountingInbox').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<AccountingInboxPage />);

      expect(screen.getByText(/không có quyền truy cập/i)).toBeDefined();
    });
  });

  describe('Tiêu chuẩn 4 trạng thái giao diện (Loading, Empty, Error, Success)', () => {
    it('trạng thái đang tải (Loading state): hiển thị Skeleton loader', () => {
      vi.spyOn(accountingHooks, 'useAccountingInbox').mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<AccountingInboxPage />);

      const skeleton =
        screen.queryByRole('status', { name: /đang tải/i }) ||
        document.querySelector('.animate-pulse');
      expect(skeleton).not.toBeNull();
    });

    it('trạng thái trống (Empty state): hiển thị thông điệp khi hàng chờ rỗng', () => {
      vi.spyOn(accountingHooks, 'useAccountingInbox').mockReturnValue({
        data: { data: [], meta: { page: 1, limit: 20, total_records: 0, total_pages: 0 } },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<AccountingInboxPage />);

      expect(screen.getByText(/không có đợt thu nào|hàng chờ rỗng/i)).toBeDefined();
    });

    it('trạng thái lỗi (Error state): hiển thị thông báo lỗi và nút Thử lại', () => {
      const mockRefetch = vi.fn();
      vi.spyOn(accountingHooks, 'useAccountingInbox').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new ApiError(500, 'INTERNAL_SERVER_ERROR', 'Không thể kết nối máy chủ'),
        refetch: mockRefetch,
      } as any);

      render(<AccountingInboxPage />);

      expect(screen.getByText(/không thể kết nối máy chủ|đã xảy ra lỗi/i)).toBeDefined();
      const retryBtn = screen.getByRole('button', { name: /thử lại/i });
      fireEvent.click(retryBtn);
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('trạng thái thành công (Success state): hiển thị danh sách đợt thu và cảnh báo > 7 ngày', () => {
      vi.spyOn(accountingHooks, 'useAccountingInbox').mockReturnValue({
        data: {
          data: [sampleInboxItem, sampleRecentItem],
          meta: { page: 1, limit: 20, total_records: 2, total_pages: 1 },
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<AccountingInboxPage />);

      expect(screen.getByText('ASL-2026-LD-0001')).toBeDefined();
      expect(screen.getByText('Công ty Cổ phần TechLog')).toBeDefined();
      expect(screen.getByText('Đợt 1: Tạm ứng khi ký kết')).toBeDefined();

      // Cảnh báo đợt thu chờ > 7 ngày
      expect(
        screen.getByText(/>\s*7\s*ngày|quá hạn|chờ lâu/i) ||
          document.querySelector('.text-amber-500, .bg-amber-100, .text-red-500')
      ).toBeDefined();
    });
  });

  describe('Hộp thoại Xác nhận đã thu tiền & Hợp đồng Idempotency', () => {
    const mockMutateAsync = vi.fn();

    beforeEach(() => {
      vi.spyOn(accountingHooks, 'useAccountingInbox').mockReturnValue({
        data: {
          data: [sampleInboxItem],
          meta: { page: 1, limit: 20, total_records: 1, total_pages: 1 },
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      vi.spyOn(accountingHooks, 'useConfirmPayment').mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        isSuccess: false,
      } as any);
    });

    it('mở hộp thoại xác nhận khi bấm "Xác nhận đã thu" và hiển thị các trường bắt buộc', () => {
      render(<AccountingInboxPage />);

      const confirmBtn = screen.getByRole('button', { name: /xác nhận đã thu/i });
      fireEvent.click(confirmBtn);

      expect(screen.getByLabelText(/số hoá đơn misa|số hóa đơn/i)).toBeDefined();
      expect(screen.getByLabelText(/mã giao dịch|mã gd/i)).toBeDefined();
      expect(screen.getByLabelText(/số tiền thực nhận|số tiền/i)).toBeDefined();
    });

    it('chặn gửi khi thiếu hoá đơn MISA hoặc thiếu mã GD ngân hàng', async () => {
      render(<AccountingInboxPage />);

      fireEvent.click(screen.getByRole('button', { name: /xác nhận đã thu/i }));

      const submitBtn = screen.getByRole('button', { name: /hoàn tất xác nhận|xác nhận thu tiền|gửi/i });
      // Thử submit khi chưa nhập hoá đơn và mã GD
      fireEvent.click(submitBtn);

      expect(mockMutateAsync).not.toHaveBeenCalled();
      expect(screen.getByText(/bắt buộc|vui lòng nhập/i)).toBeDefined();
    });

    it('chặn gửi khi số tiền nhận <= 0', async () => {
      render(<AccountingInboxPage />);

      fireEvent.click(screen.getByRole('button', { name: /xác nhận đã thu/i }));

      const invoiceInput = screen.getByLabelText(/số hoá đơn misa|số hóa đơn/i);
      const bankRefInput = screen.getByLabelText(/mã giao dịch|mã gd/i);
      const amountInput = screen.getByLabelText(/số tiền thực nhận|số tiền/i);

      fireEvent.change(invoiceInput, { target: { value: 'HD-2026-00123' } });
      fireEvent.change(bankRefInput, { target: { value: 'FT262991048201' } });
      fireEvent.change(amountInput, { target: { value: '0' } });

      const submitBtn = screen.getByRole('button', { name: /hoàn tất xác nhận|xác nhận thu tiền|gửi/i });
      fireEvent.click(submitBtn);

      expect(mockMutateAsync).not.toHaveBeenCalled();
      expect(screen.getByText(/lớn hơn 0|không hợp lệ/i)).toBeDefined();
    });

    it('khi số tiền nhận > còn lại: hiển thị cảnh báo vàng "Thu thừa X ₫" nhưng VẪN CHO PHÉP GỬI', async () => {
      mockMutateAsync.mockResolvedValueOnce({
        success: true,
        data: {
          milestone_status: 'PAID_CONFIRMED',
          received_total: '70000000',
          remaining: '0',
          stage_unblocked: true,
          commissions: [],
          execution_carried_forward: '0',
        },
        warnings: [{ code: 'OVERPAYMENT', message: 'Thu thừa 10.000.000 ₫' }],
      });

      render(<AccountingInboxPage />);

      fireEvent.click(screen.getByRole('button', { name: /xác nhận đã thu/i }));

      const invoiceInput = screen.getByLabelText(/số hoá đơn misa|số hóa đơn/i);
      const bankRefInput = screen.getByLabelText(/mã giao dịch|mã gd/i);
      const amountInput = screen.getByLabelText(/số tiền thực nhận|số tiền/i);

      // Remaining là 60.000.000, nhập 70.000.000
      fireEvent.change(invoiceInput, { target: { value: 'HD-2026-00456' } });
      fireEvent.change(bankRefInput, { target: { value: 'FT262991048201' } });
      fireEvent.change(amountInput, { target: { value: '70000000' } });

      // Xuất hiện cảnh báo vàng Thu thừa
      expect(screen.getByText(/thu thừa/i)).toBeDefined();

      const submitBtn = screen.getByRole('button', { name: /hoàn tất xác nhận|xác nhận thu tiền|gửi/i });
      expect(submitBtn.hasAttribute('disabled')).toBe(false);

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            milestone_id: 'ms-001',
            misa_invoice_no: 'HD-2026-00456',
            bank_ref_code: 'FT262991048201',
            received_amount: expect.stringMatching(/70000000/),
          })
        );
      });
    });

    it('mỗi lần mở hộp thoại sinh một Idempotency-Key; thử lại sau lỗi mạng dùng CÙNG khoá', async () => {
      let callCount = 0;
      let firstKey = '';
      let secondKey = '';

      mockMutateAsync.mockImplementation(async (payload) => {
        callCount++;
        if (callCount === 1) {
          firstKey = payload.idempotency_key;
          throw new Error('Mất kết nối mạng');
        }
        secondKey = payload.idempotency_key;
        return {
          success: true,
          data: {
            milestone_status: 'PARTIALLY_PAID',
            received_total: '30000000',
            remaining: '30000000',
            stage_unblocked: false,
            commissions: [],
            execution_carried_forward: '0',
          },
          warnings: [],
        };
      });

      render(<AccountingInboxPage />);

      fireEvent.click(screen.getByRole('button', { name: /xác nhận đã thu/i }));

      const invoiceInput = screen.getByLabelText(/số hoá đơn misa|số hóa đơn/i);
      const bankRefInput = screen.getByLabelText(/mã giao dịch|mã gd/i);
      const amountInput = screen.getByLabelText(/số tiền thực nhận|số tiền/i);

      fireEvent.change(invoiceInput, { target: { value: 'HD-2026-00456' } });
      fireEvent.change(bankRefInput, { target: { value: 'FT262991048201' } });
      fireEvent.change(amountInput, { target: { value: '30000000' } });

      const submitBtn = screen.getByRole('button', { name: /hoàn tất xác nhận|xác nhận thu tiền|gửi/i });
      fireEvent.click(submitBtn);

      await waitFor(() => expect(callCount).toBe(1));
      expect(firstKey).toBeTruthy();

      // Thử lại sau lỗi mạng
      const retryBtn = screen.getByRole('button', { name: /thử lại|hoàn tất xác nhận|gửi/i });
      fireEvent.click(retryBtn);

      await waitFor(() => expect(callCount).toBe(2));
      // Khóa idempotency phải được GIỮ NGUYÊN khi retry cùng một phiên mở modal
      expect(secondKey).toBe(firstKey);
    });

    it('hiển thị kết quả thành công: bảng hoa hồng theo vai trò, stage_unblocked và execution_carried_forward', async () => {
      mockMutateAsync.mockResolvedValueOnce({
        success: true,
        data: {
          milestone_status: 'PAID_CONFIRMED',
          received_total: '60000000',
          remaining: '0',
          stage_unblocked: true,
          commissions: [
            { user_id: 'u-orig', role_type: 'ORIGINATOR', amount: '3000000' },
            { user_id: 'u-sup', role_type: 'SUPERVISOR', amount: '1680000' },
            { user_id: 'u-mgr', role_type: 'CASE_MANAGER', amount: '2520000' },
            { user_id: 'u-exec', role_type: 'EXECUTOR', task_id: 't-1', amount: '4800000' },
          ],
          execution_carried_forward: '5000000',
        },
        warnings: [],
      });

      render(<AccountingInboxPage />);

      fireEvent.click(screen.getByRole('button', { name: /xác nhận đã thu/i }));

      fireEvent.change(screen.getByLabelText(/số hoá đơn misa|số hóa đơn/i), {
        target: { value: 'HD-2026-00456' },
      });
      fireEvent.change(screen.getByLabelText(/mã giao dịch|mã gd/i), {
        target: { value: 'FT262991048201' },
      });

      fireEvent.click(screen.getByRole('button', { name: /hoàn tất xác nhận|xác nhận thu tiền|gửi/i }));

      await waitFor(() => {
        expect(screen.getByText(/đã mở khoá giai đoạn kế tiếp cho luật sư/i)).toBeDefined();
        expect(screen.getByText(/3.000.000|3000000/)).toBeDefined();
        expect(screen.getByText(/5.000.000|5000000|dồn sang đợt kế tiếp/i)).toBeDefined();
      });
    });

    it('xử lý lỗi DUPLICATE_BANK_REF hiển thị ngay dưới ô mã GD ngân hàng', async () => {
      mockMutateAsync.mockRejectedValueOnce(
        new ApiError(409, 'DUPLICATE_BANK_REF', 'Mã giao dịch ngân hàng đã tồn tại trên hệ thống')
      );

      render(<AccountingInboxPage />);

      fireEvent.click(screen.getByRole('button', { name: /xác nhận đã thu/i }));

      fireEvent.change(screen.getByLabelText(/số hoá đơn misa|số hóa đơn/i), {
        target: { value: 'HD-2026-00456' },
      });
      fireEvent.change(screen.getByLabelText(/mã giao dịch|mã gd/i), {
        target: { value: 'FT262991048201' },
      });

      fireEvent.click(screen.getByRole('button', { name: /hoàn tất xác nhận|xác nhận thu tiền|gửi/i }));

      await waitFor(() => {
        expect(screen.getByText(/mã giao dịch ngân hàng đã tồn tại/i)).toBeDefined();
      });
    });

    it('xử lý lỗi MILESTONE_NOT_AWAITING_PAYMENT hiển thị thông báo và tải lại hàng chờ', async () => {
      const mockRefetch = vi.fn();
      vi.spyOn(accountingHooks, 'useAccountingInbox').mockReturnValue({
        data: {
          data: [sampleInboxItem],
          meta: { page: 1, limit: 20, total_records: 1, total_pages: 1 },
        },
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      } as any);

      mockMutateAsync.mockRejectedValueOnce(
        new ApiError(409, 'MILESTONE_NOT_AWAITING_PAYMENT', 'Đợt thu không ở trạng thái chờ thanh toán')
      );

      render(<AccountingInboxPage />);

      fireEvent.click(screen.getByRole('button', { name: /xác nhận đã thu/i }));

      fireEvent.change(screen.getByLabelText(/số hoá đơn misa|số hóa đơn/i), {
        target: { value: 'HD-2026-00456' },
      });
      fireEvent.change(screen.getByLabelText(/mã giao dịch|mã gd/i), {
        target: { value: 'FT262991048201' },
      });

      fireEvent.click(screen.getByRole('button', { name: /hoàn tất xác nhận|xác nhận thu tiền|gửi/i }));

      await waitFor(() => {
        expect(screen.getByText(/không ở trạng thái chờ thanh toán/i)).toBeDefined();
        expect(mockRefetch).toHaveBeenCalled();
      });
    });
  });
});
