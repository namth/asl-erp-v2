import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import ApprovalsPage from '@/app/(dashboard)/approvals/page';
import * as approvalsHooks from '@/hooks/use-approvals';
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
  usePathname: () => '/approvals',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Màn hình Hàng chờ phê duyệt - approvals/page.tsx (SCR-16 & SCR-10, brief mục 4, 5)', () => {
  const currentManager = {
    id: 'u-mgr-1',
    email: 'truong.nv@asllaw.vn',
    full_name: 'LS. Nguyễn Văn Trường',
    system_role: 'MANAGER',
  };

  const sampleApprovals = [
    {
      id: 'appr-task-01',
      type: 'TASK',
      case: { id: 'c-1', case_code: 'ASL-2026-TM-0045', title: 'Đăng ký nhãn hiệu ASL GATEWAY' },
      subject: { id: 't-10', title: 'Tờ khai đăng ký nhãn hiệu mẫu 01' },
      requested_by: { id: 'u-exec-1', full_name: 'Lê Mai Anh' },
      requested_at: '2026-11-11T08:30:00Z',
      note: 'Đã hoàn thiện hồ sơ kèm chứng từ phí',
    },
    {
      id: 'appr-gate-01',
      type: 'STAGE_GATE',
      case: { id: 'c-2', case_code: 'ASL-2026-MNA-0012', title: 'Thẩm định pháp lý M&A Vốn góp' },
      subject: { id: 'stg-1', title: 'Cổng thẩm định giai đoạn 1' },
      requested_by: { id: 'u-exec-2', full_name: 'Phạm Minh Đức' },
      requested_at: '2026-11-11T09:15:00Z',
      note: 'Báo cáo rà soát pháp lý sơ bộ đã hoàn thành',
    },
    {
      id: 'appr-cr-01',
      type: 'CHANGE_REQUEST',
      case: { id: 'c-1', case_code: 'ASL-2026-TM-0045', title: 'Đăng ký nhãn hiệu ASL GATEWAY' },
      subject: { id: 'cr-5', title: 'Yêu cầu thêm task dịch công chứng' },
      requested_by: { id: 'u-exec-1', full_name: 'Lê Mai Anh' },
      requested_at: '2026-11-11T10:00:00Z',
      note: 'Toà án gửi trát yêu cầu bản dịch hợp đồng',
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();

    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: currentManager,
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(approvalsHooks, 'useApprovals').mockReturnValue({
      data: sampleApprovals,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(approvalsHooks, 'useDecideApproval').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);
  });

  describe('Tiêu chuẩn 4 trạng thái giao diện (UI 4-states)', () => {
    it('trạng thái đang tải (Loading state): hiển thị Skeleton loading', () => {
      vi.spyOn(approvalsHooks, 'useApprovals').mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<ApprovalsPage />);

      const skeleton =
        screen.queryByRole('status', { name: /đang tải/i }) ||
        document.querySelector('.animate-pulse');
      expect(skeleton).not.toBeNull();
    });

    it('trạng thái trống (Empty state): hiển thị thông báo khi không có yêu cầu nào chờ duyệt', () => {
      vi.spyOn(approvalsHooks, 'useApprovals').mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<ApprovalsPage />);

      expect(
        screen.getByText(/không có yêu cầu nào chờ duyệt|hàng chờ trống|chưa có yêu cầu/i)
      ).toBeDefined();
    });

    it('trạng thái lỗi (Error state): hiển thị thông báo và nút Thử lại', () => {
      const mockRefetch = vi.fn();
      vi.spyOn(approvalsHooks, 'useApprovals').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Không thể tải hàng chờ'),
        refetch: mockRefetch,
      } as any);

      render(<ApprovalsPage />);

      const retryBtn = screen.getByRole('button', { name: /thử lại/i });
      expect(retryBtn).toBeDefined();

      fireEvent.click(retryBtn);
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  describe('Hàng chờ phê duyệt & bộ lọc theo loại (SCR-16)', () => {
    it('hiển thị danh sách các yêu cầu kèm thông tin vụ việc, đối tượng, người gửi và đường dẫn tới vụ việc', () => {
      render(<ApprovalsPage />);

      expect(screen.getByText('ASL-2026-TM-0045')).toBeDefined();
      expect(screen.getByText('Tờ khai đăng ký nhãn hiệu mẫu 01')).toBeDefined();
      expect(screen.getByText('Cổng thẩm định giai đoạn 1')).toBeDefined();
      expect(screen.getByText('Yêu cầu thêm task dịch công chứng')).toBeDefined();

      // Mỗi dòng có link tới vụ việc tương ứng
      const caseLinks = screen.getAllByRole('link', { name: /ASL-2026-TM-0045/i });
      expect(caseLinks.length).toBeGreaterThan(0);
      expect(caseLinks[0].getAttribute('href')).toMatch(/\/cases\/c-1/);
    });

    it('hỗ trợ lọc danh sách theo loại: Tác vụ, Cổng giai đoạn, Yêu cầu bổ sung', () => {
      render(<ApprovalsPage />);

      const filterTaskTab = screen.getByRole('button', { name: /tác vụ|task/i }) ||
        screen.getByText(/tác vụ|task/i);
      fireEvent.click(filterTaskTab);

      // Khi chọn lọc Tác vụ, useApprovals được gọi lại với type tương ứng
      expect(approvalsHooks.useApprovals).toHaveBeenCalledWith(
        expect.stringMatching(/TASK/i)
      );
    });
  });

  describe('Hộp thoại phê duyệt (SCR-10)', () => {
    it('thao tác Duyệt (Approve) gửi POST …/decide với action = APPROVE và làm mới hàng chờ', async () => {
      const mockRefetch = vi.fn();
      vi.spyOn(approvalsHooks, 'useApprovals').mockReturnValue({
        data: sampleApprovals,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      } as any);

      const mockDecide = vi.fn().mockImplementation((_args, options) => {
        options?.onSuccess?.();
      });
      vi.spyOn(approvalsHooks, 'useDecideApproval').mockReturnValue({
        mutate: mockDecide,
        isPending: false,
      } as any);

      render(<ApprovalsPage />);

      const approveButtons = screen.getAllByRole('button', { name: /phê duyệt|duyệt/i });
      fireEvent.click(approveButtons[0]);

      expect(mockDecide).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'appr-task-01',
          action: 'APPROVE',
        }),
        expect.anything()
      );

      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalled();
      });
    });

    it('thao tác Trả về (Reject) bắt buộc phải có lý do; chặn gửi khi lý do rỗng', async () => {
      const mockDecide = vi.fn();
      vi.spyOn(approvalsHooks, 'useDecideApproval').mockReturnValue({
        mutate: mockDecide,
        isPending: false,
      } as any);

      render(<ApprovalsPage />);

      const rejectButtons = screen.getAllByRole('button', { name: /trả về|từ chối/i });
      fireEvent.click(rejectButtons[0]);

      // Mở modal hoặc ô nhập lý do trả về
      const confirmRejectBtn = screen.getByRole('button', { name: /xác nhận trả về|xác nhận|gửi/i });
      fireEvent.click(confirmRejectBtn);

      expect(mockDecide).not.toHaveBeenCalled();
      expect(screen.getByText(/lý do bắt buộc|vui lòng nhập lý do/i)).toBeDefined();

      const reasonInput = screen.getByPlaceholderText(/lý do trả về|nhập lý do/i) ||
        screen.getByRole('textbox', { name: /lý do/i });
      fireEvent.change(reasonInput, { target: { value: 'Tài liệu scan bị mờ, cần quét lại trang 3' } });

      fireEvent.click(confirmRejectBtn);

      expect(mockDecide).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'appr-task-01',
          action: 'REJECT',
          comment: 'Tài liệu scan bị mờ, cần quét lại trang 3',
        }),
        expect.anything()
      );
    });

    it('hiển thị thông báo "Bạn không thể duyệt yêu cầu của chính mình" khi gặp lỗi APPROVAL_NOT_ALLOWED', async () => {
      vi.spyOn(approvalsHooks, 'useDecideApproval').mockReturnValue({
        mutate: (_args: any, options: any) => {
          options?.onError?.(
            new ApiError(403, 'APPROVAL_NOT_ALLOWED', 'Người duyệt không được là người gửi yêu cầu')
          );
        },
        isPending: false,
      } as any);

      render(<ApprovalsPage />);

      const approveButtons = screen.getAllByRole('button', { name: /phê duyệt|duyệt/i });
      fireEvent.click(approveButtons[0]);

      await waitFor(() => {
        expect(
          screen.getByText(/bạn không thể duyệt yêu cầu của chính mình/i)
        ).toBeDefined();
      });
    });
  });
});
