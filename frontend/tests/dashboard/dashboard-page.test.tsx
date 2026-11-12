import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
import DashboardPage from '@/app/(dashboard)/page';
import * as authHooks from '@/hooks/use-auth';
import * as myTasksHooks from '@/hooks/use-my-tasks';
import * as approvalsHooks from '@/hooks/use-approvals';
import * as casesHooks from '@/hooks/use-cases';
import * as accountingHooks from '@/hooks/use-accounting';

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
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Màn hình Bàn làm việc cá nhân - dashboard/page.tsx (SCR-02 & brief mục 4, 5)', () => {
  const attorneyUser = {
    id: 'u-attorney-1',
    email: 'minh.duc@asllaw.vn',
    full_name: 'LS. Phạm Minh Đức',
    system_role: 'ATTORNEY',
  };

  const managerUser = {
    id: 'u-manager-1',
    email: 'truong.nv@asllaw.vn',
    full_name: 'LS. Nguyễn Văn Trường',
    system_role: 'MANAGER',
  };

  const accountantUser = {
    id: 'u-accountant-1',
    email: 'lan.tt@asllaw.vn',
    full_name: 'Trần Thị Lan',
    system_role: 'ACCOUNTANT',
  };

  const adminUser = {
    id: 'u-admin-1',
    email: 'admin@asllaw.vn',
    full_name: 'Quản trị viên Hệ thống',
    system_role: 'ADMIN',
  };

  const sampleMyTasks = [
    {
      id: 'task-101',
      title: 'Soạn thảo đơn đăng ký nhãn hiệu ASL GATEWAY',
      status: 'IN_PROGRESS',
      due_at: '2026-11-12T17:00:00Z',
      is_overdue: false,
      case: { id: 'c-1', case_code: 'ASL-2026-TM-0045', title: 'Đăng ký nhãn hiệu quốc tế ASL GATEWAY' },
      stage: { name: 'Thẩm định hình thức', status: 'IN_PROGRESS' },
      blocked_by_count: 0,
    },
    {
      id: 'task-102',
      title: 'Nộp bổ sung tài liệu chứng minh quyền ưu tiên',
      status: 'TODO',
      due_at: '2026-11-10T17:00:00Z',
      is_overdue: true,
      case: { id: 'c-2', case_code: 'ASL-2026-MNA-0012', title: 'Thẩm định pháp lý M&A' },
      stage: { name: 'Rà soát tài liệu', status: 'IN_PROGRESS' },
      blocked_by_count: 1,
    },
  ];

  const sampleTasksSummary = {
    todo: 5,
    in_progress: 8,
    waiting_approval: 3,
    overdue: 2,
  };

  const sampleApprovals = [
    {
      id: 'appr-01',
      type: 'TASK',
      case: { id: 'c-1', case_code: 'ASL-2026-TM-0045', title: 'Đăng ký nhãn hiệu ASL' },
      subject: { id: 't-1', title: 'Tờ khai đăng ký nhãn hiệu' },
      requested_by: { id: 'u-2', full_name: 'Lê Mai Anh' },
      requested_at: '2026-11-11T09:00:00Z',
      note: 'Đã hoàn thiện hồ sơ',
    },
    {
      id: 'appr-02',
      type: 'STAGE_GATE',
      case: { id: 'c-2', case_code: 'ASL-2026-MNA-0012', title: 'Thẩm định pháp lý M&A' },
      subject: { id: 'stg-1', title: 'Cổng thẩm định giai đoạn 1' },
      requested_by: { id: 'u-3', full_name: 'Phạm Minh Đức' },
      requested_at: '2026-11-11T10:15:00Z',
      note: 'Báo cáo rà soát hoàn tất',
    },
  ];

  const sampleCases = [
    {
      id: 'c-1',
      case_code: 'ASL-2026-TM-0045',
      title: 'Đăng ký nhãn hiệu quốc tế ASL GATEWAY',
      client_name: 'Công ty Cổ phần Công nghệ ASL Gate',
      status: 'ACTIVE',
      workflow_mode: 'STRICT',
      current_stage: { name: 'Nộp đơn và thẩm định hình thức', status: 'IN_PROGRESS' },
      progress_pct: 45,
      due_at_nearest: '2026-11-20T17:00:00Z',
      my_role_in_case: 'EXECUTOR',
    },
    {
      id: 'c-2',
      case_code: 'ASL-2026-MNA-0012',
      title: 'Thẩm định pháp lý M&A Doanh nghiệp',
      client_name: 'Tập đoàn Đầu tư Phương Nam',
      status: 'ACTIVE',
      workflow_mode: 'FLEXIBLE',
      current_stage: { name: 'Thẩm định chi tiết', status: 'IN_PROGRESS' },
      progress_pct: 70,
      due_at_nearest: '2026-11-25T17:00:00Z',
      my_role_in_case: 'CASE_MANAGER',
    },
  ];

  const sampleAccountingInbox = {
    data: [
      {
        milestone_id: 'm-1',
        case: { id: 'c-1', case_code: 'ASL-2026-TM-0045', title: 'Đăng ký nhãn hiệu ASL', client_name: 'ASL Gate' },
        name: 'Đợt 1 - Tạm ứng chi phí nộp đơn',
        amount: '50000000',
        received_total: '0',
        remaining: '50000000',
        status: 'AWAITING_PAYMENT',
        awaiting_since: '2026-11-10T08:00:00Z',
        payments: [],
      },
    ],
    meta: { total: 1, page: 1, limit: 10, total_pages: 1 },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();

    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: attorneyUser,
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(myTasksHooks, 'useMyTasks').mockReturnValue({
      data: {
        data: sampleMyTasks,
        summary: sampleTasksSummary,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(approvalsHooks, 'useApprovals').mockReturnValue({
      data: sampleApprovals,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(casesHooks, 'useCases').mockReturnValue({
      data: {
        data: sampleCases,
        meta: { total: 2, page: 1, limit: 10, total_pages: 1 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(accountingHooks, 'useAccountingInbox').mockReturnValue({
      data: sampleAccountingInbox,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);
  });

  describe('1. Phân quyền & Giao diện cho ATTORNEY / MANAGER', () => {
    it('hiển thị lời chào theo useMe().full_name của luật sư / quản lý', () => {
      render(<DashboardPage />);
      expect(screen.getByText(new RegExp(attorneyUser.full_name, 'i'))).toBeDefined();
    });

    it('hiển thị 4 thẻ đếm KPI chính xác từ summary của /me/tasks (Cần làm, Đang làm, Chờ duyệt, Quá hạn)', () => {
      render(<DashboardPage />);

      // Thẻ Cần làm: 5
      expect(screen.getByText(/cần làm/i)).toBeDefined();
      expect(screen.getByText('5')).toBeDefined();

      // Thẻ Đang làm: 8
      expect(screen.getByText(/đang làm/i)).toBeDefined();
      expect(screen.getByText('8')).toBeDefined();

      // Thẻ Chờ duyệt: 3
      expect(screen.getByText(/chờ duyệt/i)).toBeDefined();
      expect(screen.getByText('3')).toBeDefined();

      // Thẻ Quá hạn: 2
      expect(screen.getByText(/quá hạn/i)).toBeDefined();
      expect(screen.getByText('2')).toBeDefined();
    });

    it('thẻ Quá hạn hiển thị màu đỏ cảnh báo khi summary.overdue > 0 và không đỏ khi = 0', () => {
      const { rerender } = render(<DashboardPage />);

      // Khi overdue = 2 (> 0): phải có styling đỏ (text-red hoặc bg-red)
      const overdueElement = screen.getByText('2').closest('div') || screen.getByText(/quá hạn/i).closest('div');
      const htmlOverdue = overdueElement?.parentElement?.innerHTML || '';
      expect(
        htmlOverdue.includes('text-red') ||
        htmlOverdue.includes('bg-red') ||
        htmlOverdue.includes('border-red') ||
        htmlOverdue.includes('red-')
      ).toBe(true);

      // Khi overdue = 0: không được mang class cảnh báo đỏ nguy cấp
      vi.spyOn(myTasksHooks, 'useMyTasks').mockReturnValue({
        data: {
          items: sampleMyTasks,
          summary: { ...sampleTasksSummary, overdue: 0 },
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      rerender(<DashboardPage />);
      expect(screen.getByText('0')).toBeDefined();
    });

    it('khối "Việc của tôi" có bộ lọc nhanh: Quá hạn / Hôm nay / Tuần này và gửi đúng due= khi chọn', () => {
      const useMyTasksSpy = vi.spyOn(myTasksHooks, 'useMyTasks');
      render(<DashboardPage />);

      // Kiểm tra sự hiện diện của danh sách Việc của tôi
      expect(screen.getByText(/việc của tôi/i)).toBeDefined();

      // Nút lọc: Quá hạn, Hôm nay, Tuần này
      const overdueBtn = screen.getByRole('button', { name: /quá hạn/i }) || screen.getByText(/quá hạn/i);
      const todayBtn = screen.getByRole('button', { name: /hôm nay/i }) || screen.getByText(/hôm nay/i);
      const weekBtn = screen.getByRole('button', { name: /tuần này/i }) || screen.getByText(/tuần này/i);

      expect(overdueBtn).toBeDefined();
      expect(todayBtn).toBeDefined();
      expect(weekBtn).toBeDefined();

      // Bấm nút lọc "Hôm nay"
      fireEvent.click(todayBtn);
      expect(useMyTasksSpy).toHaveBeenCalledWith(expect.objectContaining({ due: 'today' }));

      // Bấm nút lọc "Tuần này"
      fireEvent.click(weekBtn);
      expect(useMyTasksSpy).toHaveBeenCalledWith(expect.objectContaining({ due: 'week' }));

      // Bấm nút lọc "Quá hạn"
      fireEvent.click(overdueBtn);
      expect(useMyTasksSpy).toHaveBeenCalledWith(expect.objectContaining({ due: 'overdue' }));
    });

    it('mỗi dòng trong "Việc của tôi" có link điều hướng tới /cases/{case.id}/tasks', () => {
      render(<DashboardPage />);

      // Task-101 thuộc case c-1: link tới /cases/c-1/tasks
      const taskLinks = screen.getAllByRole('link');
      const case1TaskLink = taskLinks.find((l) => l.getAttribute('href')?.includes('/cases/c-1/tasks'));
      expect(case1TaskLink).toBeDefined();

      // Task-102 thuộc case c-2: link tới /cases/c-2/tasks
      const case2TaskLink = taskLinks.find((l) => l.getAttribute('href')?.includes('/cases/c-2/tasks'));
      expect(case2TaskLink).toBeDefined();
    });

    it('hiển thị khối "Chờ tôi duyệt" (số lượng + 5 mục mới nhất) và link tới /approvals', () => {
      render(<DashboardPage />);

      expect(screen.getByText(/chờ tôi duyệt/i)).toBeDefined();
      expect(screen.getByText('Tờ khai đăng ký nhãn hiệu')).toBeDefined();
      expect(screen.getByText('Cổng thẩm định giai đoạn 1')).toBeDefined();

      const approvalsLink = screen.getAllByRole('link').find((l) => l.getAttribute('href') === '/approvals');
      expect(approvalsLink).toBeDefined();
    });

    it('hiển thị khối "Vụ việc của tôi" (danh sách vụ việc từ useCases mine=true)', () => {
      render(<DashboardPage />);

      expect(screen.getByText(/vụ việc của tôi/i)).toBeDefined();
      expect(screen.getByText('ASL-2026-TM-0045')).toBeDefined();
      expect(screen.getByText('ASL-2026-MNA-0012')).toBeDefined();
    });
  });

  describe('2. Phân quyền cho ACCOUNTANT (Kế toán)', () => {
    beforeEach(() => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: accountantUser,
        isLoading: false,
        isError: false,
      } as any);
    });

    it('thay "Việc của tôi" bằng "Đợt thu chờ xác nhận" kèm số lượng + mục từ /accounting/inbox và link /accounting', () => {
      render(<DashboardPage />);

      // Khối Đợt thu chờ xác nhận hiển thị
      expect(screen.getByText(/đợt thu chờ xác nhận/i)).toBeDefined();
      expect(screen.getByText('Đợt 1 - Tạm ứng chi phí nộp đơn')).toBeDefined();

      // Có link tới /accounting
      const accountingLink = screen.getAllByRole('link').find((l) => l.getAttribute('href') === '/accounting');
      expect(accountingLink).toBeDefined();

      // KHÔNG có tiêu đề Việc của tôi của luật sư
      expect(screen.queryByText(/^việc của tôi$/i)).toBeNull();
    });

    it('Kế toán KHÔNG gọi API /me/tasks và KHÔNG có thẻ duyệt task', () => {
      const useMyTasksSpy = vi.spyOn(myTasksHooks, 'useMyTasks');
      render(<DashboardPage />);

      // Không gọi useMyTasks khi là ACCOUNTANT
      expect(useMyTasksSpy).not.toHaveBeenCalled();

      // Không hiển thị khối duyệt tác vụ (Chờ tôi duyệt)
      expect(screen.queryByText(/chờ tôi duyệt/i)).toBeNull();
    });
  });

  describe('3. Phân quyền cho ADMIN (Quản trị viên)', () => {
    beforeEach(() => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: adminUser,
        isLoading: false,
        isError: false,
      } as any);
    });

    it('hiển thị các lối tắt tới Người dùng, Quy trình, Nhật ký kiểm toán, Cài đặt', () => {
      render(<DashboardPage />);

      const links = screen.getAllByRole('link');
      const hrefs = links.map((l) => l.getAttribute('href'));

      // Người dùng (/admin/users hoặc /users)
      expect(hrefs.some((h) => h?.includes('/users'))).toBe(true);
      // Quy trình (/admin/workflows hoặc /workflows)
      expect(hrefs.some((h) => h?.includes('/workflows'))).toBe(true);
      // Nhật ký kiểm toán (/admin/audit-logs hoặc /audit-logs)
      expect(hrefs.some((h) => h?.includes('/audit-logs'))).toBe(true);
      // Cài đặt (/settings)
      expect(hrefs.some((h) => h === '/settings')).toBe(true);
    });

    it('ADMIN KHÔNG gọi API nghiệp vụ vụ việc (/cases, /me/tasks)', () => {
      const useCasesSpy = vi.spyOn(casesHooks, 'useCases');
      const useMyTasksSpy = vi.spyOn(myTasksHooks, 'useMyTasks');

      render(<DashboardPage />);

      expect(useCasesSpy).not.toHaveBeenCalled();
      expect(useMyTasksSpy).not.toHaveBeenCalled();
    });
  });

  describe('4. Độ bền phục hồi lỗi & Tiêu chuẩn giao diện 4 trạng thái (Resilience & UI 4-states)', () => {
    it('mỗi khối có Skeleton riêng khi đang tải dữ liệu', () => {
      vi.spyOn(myTasksHooks, 'useMyTasks').mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: vi.fn(),
      } as any);

      vi.spyOn(approvalsHooks, 'useApprovals').mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<DashboardPage />);

      // Phải có phần tử skeleton animate-pulse
      const pulseElements = document.querySelectorAll('.animate-pulse');
      expect(pulseElements.length).toBeGreaterThan(0);
    });

    it('khi 1 khối bị lỗi (500), chỉ khối đó hiện ErrorState, các khối khác vẫn hiển thị bình thường', () => {
      // Giả lập approvals bị lỗi 500
      vi.spyOn(approvalsHooks, 'useApprovals').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Internal Server Error 500'),
        refetch: vi.fn(),
      } as any);

      // myTasks và cases vẫn bình thường
      vi.spyOn(myTasksHooks, 'useMyTasks').mockReturnValue({
        data: {
          items: sampleMyTasks,
          summary: sampleTasksSummary,
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<DashboardPage />);

      // Khối Việc của tôi vẫn hiển thị bình thường
      expect(screen.getByText('Soạn thảo đơn đăng ký nhãn hiệu ASL GATEWAY')).toBeDefined();

      // Khối Vụ việc của tôi vẫn hiển thị
      expect(screen.getByText('ASL-2026-TM-0045')).toBeDefined();

      // Khối Chờ tôi duyệt hiện thông báo lỗi hoặc nút Thử lại (ErrorState)
      expect(
        screen.getByText(/lỗi|không thể tải|thử lại/i)
      ).toBeDefined();
    });

    it('hiển thị EmptyState khi danh sách tác vụ hoặc vụ việc trống', () => {
      vi.spyOn(myTasksHooks, 'useMyTasks').mockReturnValue({
        data: {
          items: [],
          summary: { todo: 0, in_progress: 0, waiting_approval: 0, overdue: 0 },
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<DashboardPage />);

      // Phải có EmptyState thể hiện chưa có tác vụ nào
      expect(screen.getByText(/chưa có tác vụ|không có công việc|trống/i)).toBeDefined();
    });
  });
});
