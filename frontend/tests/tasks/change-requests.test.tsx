import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import ChangeRequestModal from '@/components/cases/tasks/change-request-modal';
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
  useParams: () => ({ id: 'case-flexible-01' }),
  usePathname: () => '/cases/case-flexible-01/tasks',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Đề xuất yêu cầu bổ sung tác vụ (DEC-07, brief mục 4, 5 & §3.4)', () => {
  const currentUser = {
    id: 'u-atty-1',
    email: 'mai.anh@asllaw.vn',
    full_name: 'Lê Mai Anh',
    system_role: 'ATTORNEY',
  };

  const sampleStages = [
    { id: 's-1', name: 'Giai đoạn 1: Chuẩn bị hồ sơ' },
    { id: 's-2', name: 'Giai đoạn 2: Nộp đơn' },
  ];

  const sampleMembers = [
    { id: 'u-atty-1', full_name: 'Lê Mai Anh' },
    { id: 'u-mgr-1', full_name: 'LS. Nguyễn Văn Trường' },
  ];

  const sampleChangeRequests = [
    {
      id: 'cr-101',
      case_id: 'case-flexible-01',
      kind: 'ADD_TASK',
      reason: 'Bổ sung dịch thuật tài liệu tiếng Nhật',
      status: 'PENDING',
      proposal: {
        stage_id: 's-1',
        title: 'Dịch thuật công chứng tài liệu tiếng Nhật',
        assigned_to: 'u-atty-1',
        due_at: '2026-11-25T17:00:00Z',
        complexity_weight: 2,
      },
      requested_by: { id: 'u-atty-1', full_name: 'Lê Mai Anh' },
      created_at: '2026-11-11T12:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: currentUser,
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(tasksHooks, 'useTasks').mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(tasksHooks, 'useChangeRequests').mockReturnValue({
      data: sampleChangeRequests,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(tasksHooks, 'useCreateChangeRequest').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);
  });

  describe('Hiển thị nút "Đề xuất thêm tác vụ" theo chế độ vụ việc (FLEXIBLE vs STRICT)', () => {
    it('hiển thị nút "Đề xuất thêm tác vụ" khi vụ việc ở chế độ FLEXIBLE (Linh hoạt)', () => {
      render(
        <TasksPage
          caseDetails={{
            id: 'case-flexible-01',
            workflow_mode: 'FLEXIBLE',
            status: 'ACTIVE',
          } as any}
        />
      );

      expect(
        screen.getByRole('button', { name: /đề xuất thêm tác vụ|đề xuất bổ sung/i })
      ).toBeDefined();
    });

    it('ẨN hoàn toàn nút "Đề xuất thêm tác vụ" khi vụ việc ở chế độ STRICT (Khung cứng)', () => {
      render(
        <TasksPage
          caseDetails={{
            id: 'case-strict-01',
            workflow_mode: 'STRICT',
            status: 'ACTIVE',
          } as any}
        />
      );

      expect(
        screen.queryByRole('button', { name: /đề xuất thêm tác vụ|đề xuất bổ sung/i })
      ).toBeNull();
    });
  });

  describe('Form nhập đề xuất bổ sung tác vụ (ChangeRequestModal)', () => {
    it('chặn gửi đề xuất khi thiếu lý do bắt buộc (reason) hoặc thiếu tiêu đề', async () => {
      const mockCreate = vi.fn();
      vi.spyOn(tasksHooks, 'useCreateChangeRequest').mockReturnValue({
        mutate: mockCreate,
        isPending: false,
      } as any);

      render(
        <ChangeRequestModal
          isOpen={true}
          onClose={vi.fn()}
          caseId="case-flexible-01"
          stages={sampleStages}
          members={sampleMembers}
        />
      );

      const submitBtn = screen.getByRole('button', { name: /gửi đề xuất|xác nhận|gửi/i });
      fireEvent.click(submitBtn);

      expect(mockCreate).not.toHaveBeenCalled();
      expect(screen.getByText(/lý do bắt buộc|vui lòng nhập lý do/i)).toBeDefined();
    });

    it('gửi đúng body theo hợp đồng API: kind = ADD_TASK, reason, proposal { stage_id, title, assigned_to, due_at, complexity_weight }', async () => {
      const mockCreate = vi.fn();
      vi.spyOn(tasksHooks, 'useCreateChangeRequest').mockReturnValue({
        mutate: mockCreate,
        isPending: false,
      } as any);

      render(
        <ChangeRequestModal
          isOpen={true}
          onClose={vi.fn()}
          caseId="case-flexible-01"
          stages={sampleStages}
          members={sampleMembers}
        />
      );

      const titleInput = screen.getByLabelText(/tiêu đề tác vụ|tên tác vụ/i) ||
        screen.getByPlaceholderText(/nhập tiêu đề/i);
      const reasonInput = screen.getByLabelText(/lý do đề xuất|lý do/i) ||
        screen.getByPlaceholderText(/nhập lý do/i);
      const stageSelect = screen.getByLabelText(/giai đoạn/i);
      const weightSelect = screen.getByLabelText(/trọng số độ phức tạp|trọng số/i);

      fireEvent.change(titleInput, { target: { value: 'Thu thập giấy uỷ quyền bổ sung' } });
      fireEvent.change(reasonInput, { target: { value: 'Khách hàng thay đổi người đại diện theo pháp luật' } });
      fireEvent.change(stageSelect, { target: { value: 's-1' } });
      fireEvent.change(weightSelect, { target: { value: '3' } });

      const submitBtn = screen.getByRole('button', { name: /gửi đề xuất|xác nhận|gửi/i });
      fireEvent.click(submitBtn);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'ADD_TASK',
          reason: 'Khách hàng thay đổi người đại diện theo pháp luật',
          proposal: expect.objectContaining({
            stage_id: 's-1',
            title: 'Thu thập giấy uỷ quyền bổ sung',
            complexity_weight: 3,
          }),
        }),
        expect.anything()
      );
    });

    it('sau khi gửi thành công hiển thị thông điệp "Đã gửi, chờ Quản lý duyệt" và cập nhật danh sách', async () => {
      vi.spyOn(tasksHooks, 'useCreateChangeRequest').mockReturnValue({
        mutate: (_args: any, options: any) => {
          options?.onSuccess?.();
        },
        isPending: false,
      } as any);

      render(
        <ChangeRequestModal
          isOpen={true}
          onClose={vi.fn()}
          caseId="case-flexible-01"
          stages={sampleStages}
          members={sampleMembers}
        />
      );

      const titleInput = screen.getByLabelText(/tiêu đề tác vụ|tên tác vụ/i) ||
        screen.getByPlaceholderText(/nhập tiêu đề/i);
      const reasonInput = screen.getByLabelText(/lý do đề xuất|lý do/i) ||
        screen.getByPlaceholderText(/nhập lý do/i);

      fireEvent.change(titleInput, { target: { value: 'Công chứng bản dịch bổ sung' } });
      fireEvent.change(reasonInput, { target: { value: 'Toà án có thông báo mới' } });

      const submitBtn = screen.getByRole('button', { name: /gửi đề xuất|xác nhận|gửi/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/đã gửi, chờ quản lý duyệt/i)).toBeDefined();
      });
    });

    it('hiển thị thông báo rõ ràng khi server phản hồi 403 STRICT_GOVERNANCE_VIOLATION', async () => {
      vi.spyOn(tasksHooks, 'useCreateChangeRequest').mockReturnValue({
        mutate: (_args: any, options: any) => {
          options?.onError?.(
            new ApiError(403, 'STRICT_GOVERNANCE_VIOLATION', 'Không thể bổ sung tác vụ trong quy trình khung cứng')
          );
        },
        isPending: false,
      } as any);

      render(
        <ChangeRequestModal
          isOpen={true}
          onClose={vi.fn()}
          caseId="case-flexible-01"
          stages={sampleStages}
          members={sampleMembers}
        />
      );

      const titleInput = screen.getByLabelText(/tiêu đề tác vụ|tên tác vụ/i) ||
        screen.getByPlaceholderText(/nhập tiêu đề/i);
      const reasonInput = screen.getByLabelText(/lý do đề xuất|lý do/i) ||
        screen.getByPlaceholderText(/nhập lý do/i);

      fireEvent.change(titleInput, { target: { value: 'Công chứng bản dịch bổ sung' } });
      fireEvent.change(reasonInput, { target: { value: 'Toà án có thông báo mới' } });

      const submitBtn = screen.getByRole('button', { name: /gửi đề xuất|xác nhận|gửi/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/quy trình khung cứng|vi phạm quy tắc khung cứng|không thể bổ sung/i)
        ).toBeDefined();
      });
    });
  });
});
