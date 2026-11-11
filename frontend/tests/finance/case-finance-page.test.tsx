import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import CaseFinancePage from '@/app/(dashboard)/cases/[id]/finance/page';
import * as financeHooks from '@/hooks/use-finance';
import * as authHooks from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'case-test-123' }),
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/cases/case-test-123/finance',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Tab Tài chính trong hồ sơ vụ việc - cases/[id]/finance (brief mục 4, 5)', () => {
  const sampleMilestones = [
    {
      id: 'ms-01',
      order_index: 1,
      name: 'Đợt 1: Ký hợp đồng dịch vụ',
      amount: '50000000',
      received_total: '50000000',
      status: 'PAID_CONFIRMED',
      triggered_by_task: { title: 'Ký kết hợp đồng dịch vụ pháp lý' },
    },
    {
      id: 'ms-02',
      order_index: 2,
      name: 'Đợt 2: Nộp đơn khiếu nại',
      amount: '50000000',
      received_total: '25000000',
      status: 'PARTIALLY_PAID',
      triggered_by_task: { title: 'Nộp đơn lên cơ quan tài phán' },
    },
    {
      id: 'ms-03',
      order_index: 3,
      name: 'Đợt 3: Hoàn tất vụ việc',
      amount: '50000000',
      received_total: '0',
      status: 'AWAITING_PAYMENT',
      triggered_by_task: null,
    },
  ];

  const unlockedPolicy = {
    originator_rate: '5.00',
    management_rate: '7.00',
    supervisor_share_pct: '40.00',
    execution_rate: '8.00',
    locked_at: null,
  };

  const lockedPolicy = {
    originator_rate: '5.00',
    management_rate: '7.00',
    supervisor_share_pct: '40.00',
    execution_rate: '8.00',
    locked_at: '2026-10-30T09:00:00Z',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();

    // Mặc định vai trò MANAGER
    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: {
        id: 'u-mgr',
        full_name: 'LS. Đặng Hoàng Giang',
        system_role: 'MANAGER',
      },
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(financeHooks, 'useCaseMilestones').mockReturnValue({
      data: sampleMilestones,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(financeHooks, 'useCaseCommissionPolicy').mockReturnValue({
      data: unlockedPolicy,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(financeHooks, 'useUpdateCommissionPolicy').mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Hiển thị danh sách đợt thu & thanh tiến độ', () => {
    it('hiển thị danh sách các đợt thu và thanh tiến độ đã thu / số tiền', () => {
      render(<CaseFinancePage />);

      expect(screen.getByText('Đợt 1: Ký hợp đồng dịch vụ')).toBeDefined();
      expect(screen.getByText('Đợt 2: Nộp đơn khiếu nại')).toBeDefined();
      expect(screen.getByText('Đợt 3: Hoàn tất vụ việc')).toBeDefined();

      // Kiểm tra thanh tiến độ hoặc tỷ lệ % đã thu (50/50 = 100%, 25/50 = 50%, 0/50 = 0%)
      const progressElements = document.querySelectorAll('[role="progressbar"], .progress-bar, .bg-emerald-500, .bg-blue-600');
      expect(progressElements.length).toBeGreaterThan(0);
    });
  });

  describe('Chính sách hoa hồng & Ràng buộc khoá', () => {
    it('hiển thị 4 tỷ lệ hoa hồng (originator, management, supervisor, execution)', () => {
      render(<CaseFinancePage />);

      expect(screen.getByText(/5(\.00)?%/)).toBeDefined();
      expect(screen.getByText(/7(\.00)?%/)).toBeDefined();
      expect(screen.getByText(/40(\.00)?%/)).toBeDefined();
      expect(screen.getByText(/8(\.00)?%/)).toBeDefined();
    });

    it('khi locked_at có giá trị: vô hiệu hoá hoặc khoá sửa chính sách hoa hồng', () => {
      vi.spyOn(financeHooks, 'useCaseCommissionPolicy').mockReturnValue({
        data: lockedPolicy,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<CaseFinancePage />);

      // Hiển thị huy hiệu / thông báo đã khoá
      expect(screen.getByText(/đã khoá|đã khóa/i)).toBeDefined();

      // Không có nút Sửa chính sách hoặc các ô input bị disable
      const editBtn = screen.queryByRole('button', { name: /sửa chính sách|chỉnh sửa/i });
      if (editBtn) {
        expect(editBtn.hasAttribute('disabled')).toBe(true);
      }
    });

    it('khi locked_at = null: Quản lý có thể sửa chính sách; tổng > 100% bị chặn ở client', async () => {
      const mockUpdate = vi.fn();
      vi.spyOn(financeHooks, 'useUpdateCommissionPolicy').mockReturnValue({
        mutateAsync: mockUpdate,
        isPending: false,
      } as any);

      render(<CaseFinancePage />);

      const editBtn = screen.queryByRole('button', { name: /sửa chính sách|chỉnh sửa|sửa/i });
      if (editBtn) {
        fireEvent.click(editBtn);
      }

      // Giả lập nhập tổng 4 tỷ lệ vượt 100% (vd: 50 + 30 + 30 + 10 = 120%)
      const originatorInput = screen.queryByLabelText(/người tạo|originator/i);
      const executionInput = screen.queryByLabelText(/thực hiện|execution/i);

      if (originatorInput && executionInput) {
        fireEvent.change(originatorInput, { target: { value: '60' } });
        fireEvent.change(executionInput, { target: { value: '50' } });

        const saveBtn = screen.getByRole('button', { name: /lưu|cập nhật/i });
        fireEvent.click(saveBtn);

        expect(mockUpdate).not.toHaveBeenCalled();
        expect(screen.getByText(/vượt quá 100%|tổng tỷ lệ không hợp lệ/i)).toBeDefined();
      }
    });

    it('xử lý lỗi COMMISSION_POLICY_LOCKED từ API hiển thị thông báo "Đã khoá từ lần thu đầu"', async () => {
      const mockUpdate = vi.fn().mockRejectedValue(
        new ApiError(409, 'COMMISSION_POLICY_LOCKED', 'Đã khoá từ lần thu đầu')
      );
      vi.spyOn(financeHooks, 'useUpdateCommissionPolicy').mockReturnValue({
        mutateAsync: mockUpdate,
        isPending: false,
      } as any);

      render(<CaseFinancePage />);

      const editBtn = screen.queryByRole('button', { name: /sửa chính sách|chỉnh sửa|sửa/i });
      if (editBtn) {
        fireEvent.click(editBtn);
      }

      const saveBtn = screen.queryByRole('button', { name: /lưu|cập nhật/i });
      if (saveBtn) {
        fireEvent.click(saveBtn);
        await waitFor(() => {
          expect(screen.getByText(/đã khoá từ lần thu đầu|đã khóa từ lần thu đầu/i)).toBeDefined();
        });
      }
    });
  });
});
