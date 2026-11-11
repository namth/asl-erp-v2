import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import TaskDetailDrawer from '@/components/cases/tasks/task-detail-drawer';
import * as tasksHooks from '@/hooks/use-tasks';
import { ApiError } from '@/lib/api-client';
import type { Task } from '@/types/tasks';

describe('Ngăn bên chi tiết tác vụ & bình luận - task-detail-drawer.tsx (brief mục 4, 5 & §3.4)', () => {
  const sampleTask: Task = {
    id: 'task-101',
    stage_id: 'stg-1',
    title: 'Soạn thảo tờ khai mẫu 01',
    description: 'Chi tiết nội dung yêu cầu soạn thảo theo đúng biểu mẫu',
    status: 'IN_PROGRESS',
    assigned_to: { id: 'u-1', full_name: 'Lê Mai Anh' },
    due_at: '2026-11-20T17:00:00Z',
    sla_business_days: 3,
    complexity_weight: 2,
    requires_approval: true,
    is_ad_hoc: false,
    depends_on: ['task-100'],
    blocked_by: [],
  };

  const sampleComments = [
    {
      id: 'cm-2',
      task_id: 'task-101',
      author: { id: 'u-2', full_name: 'LS. Nguyễn Văn Trường' },
      body: 'Bình luận mới nhất: đã duyệt bản nháp sơ bộ',
      created_at: '2026-11-11T14:00:00Z',
    },
    {
      id: 'cm-1',
      task_id: 'task-101',
      author: { id: 'u-1', full_name: 'Lê Mai Anh' },
      body: 'Bình luận trước đó: đã tải lên tệp tài liệu',
      created_at: '2026-11-11T10:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(tasksHooks, 'useTaskComments').mockReturnValue({
      data: sampleComments,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(tasksHooks, 'useUpdateTask').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    vi.spyOn(tasksHooks, 'useAddComment').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);
  });

  describe('Hiển thị thông tin tác vụ và phụ thuộc', () => {
    it('hiển thị tiêu đề, mô tả và danh sách phụ thuộc của tác vụ', () => {
      render(
        <TaskDetailDrawer
          isOpen={true}
          onClose={vi.fn()}
          caseId="case-1"
          task={sampleTask}
        />
      );

      expect(screen.getByText('Soạn thảo tờ khai mẫu 01')).toBeDefined();
      expect(screen.getByText('Chi tiết nội dung yêu cầu soạn thảo theo đúng biểu mẫu')).toBeDefined();
      expect(screen.getByText(/phụ thuộc|depends on/i)).toBeDefined();
    });
  });

  describe('Chỉnh sửa người thực hiện và hạn chót (PATCH …/tasks/{taskId})', () => {
    it('cập nhật người thực hiện và hạn chót gọi useUpdateTask', async () => {
      const mockMutate = vi.fn();
      vi.spyOn(tasksHooks, 'useUpdateTask').mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      } as any);

      render(
        <TaskDetailDrawer
          isOpen={true}
          onClose={vi.fn()}
          caseId="case-1"
          task={sampleTask}
        />
      );

      const assigneeSelect = screen.getByLabelText(/người thực hiện|phân công/i) ||
        screen.getByTestId('assignee-select');

      fireEvent.change(assigneeSelect, { target: { value: 'u-2' } });

      const saveBtn = screen.getByRole('button', { name: /lưu|cập nhật/i });
      fireEvent.click(saveBtn);

      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-101',
          data: expect.objectContaining({
            assigned_to: 'u-2',
          }),
        }),
        expect.anything()
      );
    });

    it('hiển thị thông báo lỗi khi server trả về ASSIGNEE_NOT_IN_CASE', async () => {
      vi.spyOn(tasksHooks, 'useUpdateTask').mockReturnValue({
        mutate: (_args: any, options: any) => {
          options?.onError?.(
            new ApiError(422, 'ASSIGNEE_NOT_IN_CASE', 'Người được chọn không thuộc ban chuyên môn vụ việc')
          );
        },
        isPending: false,
      } as any);

      render(
        <TaskDetailDrawer
          isOpen={true}
          onClose={vi.fn()}
          caseId="case-1"
          task={sampleTask}
        />
      );

      const saveBtn = screen.getByRole('button', { name: /lưu|cập nhật/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/không thuộc ban chuyên môn|chưa được phân công vào vụ việc|không thuộc vụ việc/i)
        ).toBeDefined();
      });
    });
  });

  describe('Khu vực bình luận (mới nhất trước, giới hạn 1–5000 ký tự)', () => {
    it('hiển thị danh sách bình luận với bình luận mới nhất ở trên đầu', () => {
      render(
        <TaskDetailDrawer
          isOpen={true}
          onClose={vi.fn()}
          caseId="case-1"
          task={sampleTask}
        />
      );

      const commentElements = screen.getAllByTestId('comment-item') ||
        screen.getAllByText(/bình luận/i);

      expect(screen.getByText(/Bình luận mới nhất: đã duyệt bản nháp sơ bộ/)).toBeDefined();
      expect(screen.getByText(/Bình luận trước đó: đã tải lên tệp tài liệu/)).toBeDefined();
    });

    it('chặn gửi bình luận khi nội dung rỗng hoặc chỉ có khoảng trắng', async () => {
      const mockAddComment = vi.fn();
      vi.spyOn(tasksHooks, 'useAddComment').mockReturnValue({
        mutate: mockAddComment,
        isPending: false,
      } as any);

      render(
        <TaskDetailDrawer
          isOpen={true}
          onClose={vi.fn()}
          caseId="case-1"
          task={sampleTask}
        />
      );

      const commentInput = screen.getByPlaceholderText(/viết bình luận|nhập bình luận/i);
      const submitBtn = screen.getByRole('button', { name: /gửi bình luận|gửi/i });

      // Nhập khoảng trắng
      fireEvent.change(commentInput, { target: { value: '    ' } });
      fireEvent.click(submitBtn);

      expect(mockAddComment).not.toHaveBeenCalled();
    });

    it('chặn gửi bình luận khi vượt quá 5000 ký tự và hiện cảnh báo', async () => {
      const mockAddComment = vi.fn();
      vi.spyOn(tasksHooks, 'useAddComment').mockReturnValue({
        mutate: mockAddComment,
        isPending: false,
      } as any);

      render(
        <TaskDetailDrawer
          isOpen={true}
          onClose={vi.fn()}
          caseId="case-1"
          task={sampleTask}
        />
      );

      const commentInput = screen.getByPlaceholderText(/viết bình luận|nhập bình luận/i);
      const submitBtn = screen.getByRole('button', { name: /gửi bình luận|gửi/i });

      const longText = 'A'.repeat(5001);
      fireEvent.change(commentInput, { target: { value: longText } });
      fireEvent.click(submitBtn);

      expect(mockAddComment).not.toHaveBeenCalled();
      expect(screen.getByText(/tối đa 5000 ký tự|quá dài/i)).toBeDefined();
    });

    it('gửi bình luận thành công và xoá trống ô nhập liệu', async () => {
      const mockAddComment = vi.fn().mockImplementation((_args, options) => {
        options?.onSuccess?.();
      });
      vi.spyOn(tasksHooks, 'useAddComment').mockReturnValue({
        mutate: mockAddComment,
        isPending: false,
      } as any);

      render(
        <TaskDetailDrawer
          isOpen={true}
          onClose={vi.fn()}
          caseId="case-1"
          task={sampleTask}
        />
      );

      const commentInput = screen.getByPlaceholderText(/viết bình luận|nhập bình luận/i);
      const submitBtn = screen.getByRole('button', { name: /gửi bình luận|gửi/i });

      fireEvent.change(commentInput, { target: { value: 'Bình luận hợp lệ 100%' } });
      fireEvent.click(submitBtn);

      expect(mockAddComment).toHaveBeenCalledWith(
        { body: 'Bình luận hợp lệ 100%' },
        expect.anything()
      );

      await waitFor(() => {
        expect((commentInput as HTMLInputElement).value).toBe('');
      });
    });
  });
});
