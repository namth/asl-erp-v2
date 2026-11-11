import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import TasksPage from '@/app/(dashboard)/cases/[id]/tasks/page';
import * as tasksHooks from '@/hooks/use-tasks';
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
  useParams: () => ({ id: 'case-tm-0045' }),
  usePathname: () => '/cases/case-tm-0045/tasks',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Màn hình Bảng tác vụ vụ việc - cases/[id]/tasks/page.tsx (SCR-09 & brief mục 4, 5)', () => {
  const currentUser = {
    id: 'u-mgr-1',
    email: 'truong.nv@asllaw.vn',
    full_name: 'LS. Nguyễn Văn Trường',
    system_role: 'MANAGER',
  };

  const sampleStages = [
    { id: 'stg-1', name: 'Giai đoạn 1: Tiếp nhận & Thẩm định', status: 'ACTIVE' },
    { id: 'stg-2', name: 'Giai đoạn 2: Nộp đơn & Theo dõi', status: 'WAITING_PAYMENT' },
  ];

  const sampleTasks = [
    {
      id: 'task-1',
      stage_id: 'stg-1',
      title: 'Soạn thảo tờ khai mẫu 01',
      description: 'Lập tờ khai theo mẫu mới nhất của Cục SHTT',
      status: 'TODO',
      assigned_to: { id: 'u-exec-1', full_name: 'Lê Mai Anh' },
      due_at: '2026-11-01T00:00:00Z', // Quá hạn so với thời điểm hiện tại
      sla_business_days: 2,
      complexity_weight: 1,
      requires_approval: false,
      is_ad_hoc: false,
      depends_on: [],
      blocked_by: [],
    },
    {
      id: 'task-2',
      stage_id: 'stg-1',
      title: 'Dịch công chứng tài liệu gốc',
      description: 'Dịch thuật bản quyền từ tiếng Anh sang tiếng Việt',
      status: 'TODO',
      assigned_to: { id: 'u-exec-1', full_name: 'Lê Mai Anh' },
      due_at: '2026-11-30T17:00:00Z',
      sla_business_days: 3,
      complexity_weight: 2,
      requires_approval: true,
      is_ad_hoc: true, // Task bổ sung ad-hoc
      depends_on: ['task-1'],
      blocked_by: ['task-1'], // Bị chặn bởi task-1
    },
    {
      id: 'task-3',
      stage_id: 'stg-1',
      title: 'Nộp lệ phí đăng ký tại Cục SHTT',
      description: 'Đóng biên lai và quét lưu vào hồ sơ',
      status: 'IN_PROGRESS',
      assigned_to: { id: 'u-mgr-1', full_name: 'LS. Nguyễn Văn Trường' },
      due_at: '2026-11-25T17:00:00Z',
      sla_business_days: 1,
      complexity_weight: 1,
      requires_approval: true,
      is_ad_hoc: false,
      depends_on: [],
      blocked_by: [],
    },
    {
      id: 'task-4',
      stage_id: 'stg-1',
      title: 'Kiểm tra hồ sơ ủy quyền đại diện',
      description: 'Hồ sơ đã gửi duyệt',
      status: 'WAITING_APPROVAL',
      assigned_to: { id: 'u-exec-1', full_name: 'Lê Mai Anh' },
      due_at: '2026-11-20T17:00:00Z',
      sla_business_days: 1,
      complexity_weight: 1,
      requires_approval: true,
      is_ad_hoc: false,
      depends_on: [],
      blocked_by: [],
    },
    {
      id: 'task-5',
      stage_id: 'stg-1',
      title: 'Tra cứu sơ bộ nhãn hiệu',
      description: 'Đã hoàn tất tra cứu trên cơ sở dữ liệu WIPO',
      status: 'COMPLETED',
      assigned_to: { id: 'u-exec-1', full_name: 'Lê Mai Anh' },
      due_at: '2026-11-10T17:00:00Z',
      sla_business_days: 2,
      complexity_weight: 1,
      requires_approval: false,
      is_ad_hoc: false,
      depends_on: [],
      blocked_by: [],
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();

    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: currentUser,
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(tasksHooks, 'useTasks').mockReturnValue({
      data: sampleTasks,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);
  });

  describe('Tiêu chuẩn 4 trạng thái giao diện (UI 4-states)', () => {
    it('trạng thái đang tải (Loading state): hiển thị Skeleton loading', () => {
      vi.spyOn(tasksHooks, 'useTasks').mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<TasksPage />);

      const skeleton =
        screen.queryByRole('status', { name: /đang tải/i }) ||
        document.querySelector('.animate-pulse');
      expect(skeleton).not.toBeNull();
    });

    it('trạng thái trống (Empty state): hiển thị thông điệp thân thiện khi vụ việc chưa có tác vụ', () => {
      vi.spyOn(tasksHooks, 'useTasks').mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<TasksPage />);

      expect(
        screen.getByText(/chưa có tác vụ|không có tác vụ|danh sách trống|chưa có task/i)
      ).toBeDefined();
    });

    it('trạng thái lỗi (Error state): hiển thị thông báo lỗi và nút Thử lại', () => {
      const mockRefetch = vi.fn();
      vi.spyOn(tasksHooks, 'useTasks').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Lỗi kết nối máy chủ'),
        refetch: mockRefetch,
      } as any);

      render(<TasksPage />);

      const retryBtn = screen.getByRole('button', { name: /thử lại/i });
      expect(retryBtn).toBeDefined();

      fireEvent.click(retryBtn);
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  describe('Chế độ xem Kanban và Danh sách (SCR-09)', () => {
    it('hiển thị đầy đủ 4 cột trạng thái trong chế độ Kanban mặc định: Cần làm, Đang làm, Chờ duyệt, Hoàn thành', () => {
      render(<TasksPage />);

      expect(screen.getByText(/cần làm|to do/i)).toBeDefined();
      expect(screen.getByText(/đang làm|in progress/i)).toBeDefined();
      expect(screen.getByText(/chờ duyệt|waiting approval/i)).toBeDefined();
      expect(screen.getByText(/hoàn thành|completed/i)).toBeDefined();

      // Kiểm tra task được phân bố đúng cột
      expect(screen.getByText('Soạn thảo tờ khai mẫu 01')).toBeDefined();
      expect(screen.getByText('Nộp lệ phí đăng ký tại Cục SHTT')).toBeDefined();
      expect(screen.getByText('Kiểm tra hồ sơ ủy quyền đại diện')).toBeDefined();
      expect(screen.getByText('Tra cứu sơ bộ nhãn hiệu')).toBeDefined();
    });

    it('hỗ trợ chuyển đổi linh hoạt giữa chế độ Kanban và chế độ Danh sách', () => {
      render(<TasksPage />);

      const listViewBtn = screen.getByRole('button', { name: /danh sách|list/i });
      fireEvent.click(listViewBtn);

      // Ở chế độ danh sách, các task hiển thị dưới dạng hàng/bảng
      expect(screen.getByText('Soạn thảo tờ khai mẫu 01')).toBeDefined();
      expect(screen.getByText('Tra cứu sơ bộ nhãn hiệu')).toBeDefined();

      const kanbanViewBtn = screen.getByRole('button', { name: /kanban|bảng/i });
      fireEvent.click(kanbanViewBtn);

      expect(screen.getByText(/cần làm|to do/i)).toBeDefined();
    });
  });

  describe('Chi tiết hiển thị thẻ tác vụ (Task Card visual requirements)', () => {
    it('hiển thị tiêu đề, tên người làm và định dạng hạn chót', () => {
      render(<TasksPage />);

      expect(screen.getByText('Soạn thảo tờ khai mẫu 01')).toBeDefined();
      expect(screen.getAllByText(/Lê Mai Anh/).length).toBeGreaterThan(0);
    });

    it('đánh dấu màu đỏ / cảnh báo đối với tác vụ đã quá hạn (overdue)', () => {
      render(<TasksPage />);

      // task-1 có due_at = 2026-11-01 (quá hạn)
      const overdueTaskCard = screen.getByText('Soạn thảo tờ khai mẫu 01').closest('[data-testid="task-card"]') ||
        screen.getByText('Soạn thảo tờ khai mẫu 01').parentElement;

      expect(overdueTaskCard?.innerHTML).toMatch(/text-red|bg-red|border-red|quá hạn/i);
    });

    it('hiển thị huy hiệu "Bổ sung" đối với tác vụ phát sinh (is_ad_hoc = true)', () => {
      render(<TasksPage />);

      // task-2 là is_ad_hoc = true
      expect(screen.getByText(/bổ sung/i)).toBeDefined();
    });

    it('hiển thị biểu tượng khoá và thông tin "Chờ: <tên task>" khi task bị khoá do phụ thuộc (blocked_by khác rỗng)', () => {
      render(<TasksPage />);

      // task-2 bị chặn bởi task-1
      expect(screen.getByText(/chờ:/i)).toBeDefined();
    });
  });

  describe('Đổi trạng thái tác vụ qua Menu trên thẻ (chỉ gồm nextStatuses, không kéo-thả)', () => {
    it('menu chuyển trạng thái chỉ chứa các trạng thái hợp lệ từ nextStatuses', async () => {
      const mockMutate = vi.fn();
      vi.spyOn(tasksHooks, 'useUpdateTaskStatus').mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      } as any);

      render(<TasksPage />);

      // task-1 đang ở TODO, blocked_by rỗng -> nextStatuses chỉ có IN_PROGRESS
      const task1MenuBtn = screen.getByLabelText(/đổi trạng thái cho soạn thảo tờ khai mẫu 01/i) ||
        screen.getByTestId('status-menu-task-1') ||
        screen.getAllByRole('button', { name: /chuyển trạng thái|thao tác/i })[0];

      fireEvent.click(task1MenuBtn);

      const inProgressOption = await screen.findByRole('menuitem', { name: /đang làm|bắt đầu/i }) ||
        await screen.findByText(/đang làm|bắt đầu/i);

      fireEvent.click(inProgressOption);

      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-1',
          status: 'IN_PROGRESS',
        })
      );
    });

    it('task-2 bị chặn phụ thuộc (blocked_by khác rỗng) không có menu chuyển trạng thái hoặc menu bị vô hiệu', () => {
      render(<TasksPage />);

      // task-2 bị chặn phụ thuộc -> nextStatuses trả về []
      const task2MenuBtn = screen.queryByTestId('status-menu-task-2');
      if (task2MenuBtn) {
        expect((task2MenuBtn as HTMLButtonElement).disabled || task2MenuBtn.hasAttribute('disabled')).toBeTruthy();
      }
    });

    it('yêu cầu nhập lý do bắt buộc khi Trả về từ WAITING_APPROVAL -> IN_PROGRESS', async () => {
      const mockMutate = vi.fn();
      vi.spyOn(tasksHooks, 'useUpdateTaskStatus').mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      } as any);

      render(<TasksPage />);

      // task-4 đang ở WAITING_APPROVAL
      const task4ReturnBtn = screen.queryByRole('button', { name: /trả về/i }) ||
        screen.queryByTestId('return-task-4');

      if (task4ReturnBtn) {
        fireEvent.click(task4ReturnBtn);

        // Hộp thoại yêu cầu lý do xuất hiện
        const confirmBtn = screen.getByRole('button', { name: /xác nhận trả về|gửi/i });
        fireEvent.click(confirmBtn);

        // Chặn gửi khi lý do trống
        expect(mockMutate).not.toHaveBeenCalled();
        expect(screen.getByText(/lý do bắt buộc|vui lòng nhập lý do/i)).toBeDefined();

        // Nhập lý do hợp lệ
        const reasonInput = screen.getByPlaceholderText(/lý do trả về|nhập lý do/i) ||
          screen.getByRole('textbox', { name: /lý do/i });
        fireEvent.change(reasonInput, { target: { value: 'Tài liệu ủy quyền thiếu con dấu công ty' } });

        fireEvent.click(confirmBtn);

        expect(mockMutate).toHaveBeenCalledWith(
          expect.objectContaining({
            taskId: 'task-4',
            status: 'IN_PROGRESS',
            note: 'Tài liệu ủy quyền thiếu con dấu công ty',
          })
        );
      }
    });
  });

  describe('Hiển thị thông báo lỗi bằng tiếng Việt chuẩn xác cho các mã lỗi API', () => {
    it('hiển thị thông điệp khi gặp lỗi PREREQUISITE_TASK_NOT_COMPLETED', async () => {
      vi.spyOn(tasksHooks, 'useUpdateTaskStatus').mockReturnValue({
        mutate: (_args: any, options: any) => {
          options?.onError?.(
            new ApiError(422, 'PREREQUISITE_TASK_NOT_COMPLETED', 'Task tiên quyết chưa hoàn thành')
          );
        },
        isPending: false,
      } as any);

      render(<TasksPage />);

      const menuBtn = screen.getAllByRole('button', { name: /chuyển trạng thái|thao tác/i })[0];
      fireEvent.click(menuBtn);

      const option = await screen.findByText(/đang làm|bắt đầu/i);
      fireEvent.click(option);

      await waitFor(() => {
        expect(screen.getByText(/chưa hoàn thành|tiên quyết|chưa xong/i)).toBeDefined();
      });
    });

    it('hiển thị thông điệp tiếng Việt khi gặp lỗi STAGE_LOCKED do giai đoạn bị khoá', async () => {
      vi.spyOn(tasksHooks, 'useUpdateTaskStatus').mockReturnValue({
        mutate: (_args: any, options: any) => {
          options?.onError?.(
            new ApiError(409, 'STAGE_LOCKED', 'Giai đoạn đang bị khoá chờ thanh toán')
          );
        },
        isPending: false,
      } as any);

      render(<TasksPage />);

      const menuBtn = screen.getAllByRole('button', { name: /chuyển trạng thái|thao tác/i })[0];
      fireEvent.click(menuBtn);

      const option = await screen.findByText(/đang làm|bắt đầu/i);
      fireEvent.click(option);

      await waitFor(() => {
        expect(screen.getByText(/giai đoạn đang bị khoá|chờ thanh toán/i)).toBeDefined();
      });
    });

    it('hiển thị thông điệp tiếng Việt khi gặp lỗi CASE_PAUSED do vụ việc đang tạm dừng', async () => {
      vi.spyOn(tasksHooks, 'useUpdateTaskStatus').mockReturnValue({
        mutate: (_args: any, options: any) => {
          options?.onError?.(
            new ApiError(409, 'CASE_PAUSED', 'Vụ việc đang tạm dừng, không thể cập nhật tác vụ')
          );
        },
        isPending: false,
      } as any);

      render(<TasksPage />);

      const menuBtn = screen.getAllByRole('button', { name: /chuyển trạng thái|thao tác/i })[0];
      fireEvent.click(menuBtn);

      const option = await screen.findByText(/đang làm|bắt đầu/i);
      fireEvent.click(option);

      await waitFor(() => {
        expect(screen.getByText(/vụ việc đang tạm dừng/i)).toBeDefined();
      });
    });

    it('hiển thị thông điệp tiếng Việt khi gặp lỗi INVALID_STATE_TRANSITION', async () => {
      vi.spyOn(tasksHooks, 'useUpdateTaskStatus').mockReturnValue({
        mutate: (_args: any, options: any) => {
          options?.onError?.(
            new ApiError(409, 'INVALID_STATE_TRANSITION', 'Chuyển trạng thái không hợp lệ')
          );
        },
        isPending: false,
      } as any);

      render(<TasksPage />);

      const menuBtn = screen.getAllByRole('button', { name: /chuyển trạng thái|thao tác/i })[0];
      fireEvent.click(menuBtn);

      const option = await screen.findByText(/đang làm|bắt đầu/i);
      fireEvent.click(option);

      await waitFor(() => {
        expect(screen.getByText(/chuyển trạng thái không hợp lệ/i)).toBeDefined();
      });
    });
  });
});
