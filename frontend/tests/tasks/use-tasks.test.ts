import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as apiClient from '@/lib/api-client';
import {
  useTasks,
  useUpdateTaskStatus,
  useUpdateTask,
  useTaskComments,
  useAddComment,
  useChangeRequests,
  useCreateChangeRequest,
} from '@/hooks/use-tasks';
import {
  useApprovals,
  useDecideApproval,
} from '@/hooks/use-approvals';

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

describe('Hooks quản lý tác vụ & phê duyệt (use-tasks.ts, use-approvals.ts & docs/07 §3.4)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('useTasks', () => {
    it('gọi GET /cases/{id}/tasks kèm query parameters lọc stage_id, status, assigned_to', async () => {
      const mockTasks = [
        {
          id: 't-101',
          stage_id: 's-1',
          title: 'Soạn thảo đơn yêu cầu',
          status: 'TODO',
          assigned_to: { id: 'u-1', full_name: 'Nguyễn Văn Trường' },
          due_at: '2026-11-20T17:00:00Z',
          sla_business_days: 3,
          complexity_weight: 2,
          requires_approval: true,
          is_ad_hoc: false,
          depends_on: [],
          blocked_by: [],
        },
      ];

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockTasks as any);

      const { result } = renderHook(
        () => useTasks('case-abc-123', { stage_id: 's-1', status: 'TODO', assigned_to: 'u-1' }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /\/cases\/case-abc-123\/tasks\?.*stage_id=s-1.*status=TODO.*assigned_to=u-1/
        )
      );
      expect(result.current.data).toEqual(mockTasks);
    });
  });

  describe('useUpdateTaskStatus', () => {
    it('gọi PATCH /cases/{id}/tasks/{taskId}/status với body { status, note }', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ success: true } as any);

      const { result } = renderHook(() => useUpdateTaskStatus('case-abc-123'), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        taskId: 't-101',
        status: 'WAITING_APPROVAL',
        note: 'Đã hoàn tất soạn thảo, gửi duyệt',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith(
        '/cases/case-abc-123/tasks/t-101/status',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            status: 'WAITING_APPROVAL',
            note: 'Đã hoàn tất soạn thảo, gửi duyệt',
          }),
        })
      );
    });
  });

  describe('useUpdateTask', () => {
    it('gọi PATCH /cases/{id}/tasks/{taskId} cập nhật người làm và hạn chót', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ success: true } as any);

      const { result } = renderHook(() => useUpdateTask('case-abc-123'), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        taskId: 't-101',
        data: {
          assigned_to: 'u-2',
          due_at: '2026-11-25T17:00:00Z',
          description: 'Cần dịch song ngữ Anh - Việt',
        },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith(
        '/cases/case-abc-123/tasks/t-101',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            assigned_to: 'u-2',
            due_at: '2026-11-25T17:00:00Z',
            description: 'Cần dịch song ngữ Anh - Việt',
          }),
        })
      );
    });
  });

  describe('useTaskComments & useAddComment', () => {
    it('useTaskComments gọi GET /cases/{id}/tasks/{taskId}/comments', async () => {
      const mockComments = [
        {
          id: 'cm-2',
          task_id: 't-101',
          author: { id: 'u-admin', full_name: 'Quản Trị Viên' },
          body: 'Bình luận mới nhất',
          created_at: '2026-11-11T10:00:00Z',
        },
        {
          id: 'cm-1',
          task_id: 't-101',
          author: { id: 'u-1', full_name: 'Nguyễn Văn Trường' },
          body: 'Bình luận trước đó',
          created_at: '2026-11-11T09:00:00Z',
        },
      ];

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockComments as any);

      const { result } = renderHook(() => useTaskComments('case-abc-123', 't-101'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith('/cases/case-abc-123/tasks/t-101/comments');
      expect(result.current.data).toEqual(mockComments);
    });

    it('useAddComment gọi POST /cases/{id}/tasks/{taskId}/comments với body { body }', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ success: true } as any);

      const { result } = renderHook(() => useAddComment('case-abc-123', 't-101'), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ body: 'Tài liệu đã được đối tác xác nhận.' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith(
        '/cases/case-abc-123/tasks/t-101/comments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ body: 'Tài liệu đã được đối tác xác nhận.' }),
        })
      );
    });
  });

  describe('useChangeRequests & useCreateChangeRequest', () => {
    it('useChangeRequests gọi GET /cases/{id}/change-requests', async () => {
      const mockRequests = [
        {
          id: 'cr-01',
          case_id: 'case-abc-123',
          kind: 'ADD_TASK',
          reason: 'Bổ sung dịch thuật hợp đồng công chứng',
          status: 'PENDING',
          proposal: {
            stage_id: 's-1',
            title: 'Dịch công chứng hợp đồng',
            assigned_to: 'u-1',
            due_at: '2026-11-20T17:00:00Z',
            complexity_weight: 2,
          },
          requested_by: { id: 'u-1', full_name: 'Nguyễn Văn Trường' },
          created_at: '2026-11-11T09:30:00Z',
        },
      ];

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockRequests as any);

      const { result } = renderHook(() => useChangeRequests('case-abc-123'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith('/cases/case-abc-123/change-requests');
      expect(result.current.data).toEqual(mockRequests);
    });

    it('useCreateChangeRequest gọi POST /cases/{id}/change-requests với chuẩn DEC-07', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ success: true } as any);

      const { result } = renderHook(() => useCreateChangeRequest('case-abc-123'), {
        wrapper: createWrapper(),
      });

      const payload = {
        kind: 'ADD_TASK' as const,
        reason: 'Toà án yêu cầu giám định bổ sung tài sản',
        proposal: {
          stage_id: 's-2',
          title: 'Thu thập hồ sơ giám định tài sản',
          assigned_to: 'u-2',
          due_at: '2026-11-28T17:00:00Z',
          complexity_weight: 3,
        },
      };

      result.current.mutate(payload);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith(
        '/cases/case-abc-123/change-requests',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
        })
      );
    });
  });

  describe('useApprovals & useDecideApproval', () => {
    it('useApprovals gọi GET /approvals?status=PENDING&type=...', async () => {
      const mockApprovals = [
        {
          id: 'appr-01',
          type: 'TASK',
          case: { id: 'c-1', case_code: 'ASL-2026-TM-0045', title: 'Đăng ký nhãn hiệu' },
          subject: { id: 't-1', title: 'Soạn đơn đăng ký' },
          requested_by: { id: 'u-1', full_name: 'Lê Mai Anh' },
          requested_at: '2026-11-11T08:00:00Z',
          note: 'Đã hoàn thiện tờ khai',
        },
      ];

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockApprovals as any);

      const { result } = renderHook(() => useApprovals('TASK'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\/approvals\?.*status=PENDING.*type=TASK/)
      );
      expect(result.current.data).toEqual(mockApprovals);
    });

    it('useDecideApproval gọi POST /approvals/{id}/decide với APPROVE', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ success: true } as any);

      const { result } = renderHook(() => useDecideApproval(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: 'appr-01', action: 'APPROVE' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith(
        '/approvals/appr-01/decide',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'APPROVE' }),
        })
      );
    });

    it('useDecideApproval gọi POST /approvals/{id}/decide với REJECT kèm lý do', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ success: true } as any);

      const { result } = renderHook(() => useDecideApproval(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        id: 'appr-01',
        action: 'REJECT',
        comment: 'Thiếu chữ ký xác nhận của đại diện pháp luật',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith(
        '/approvals/appr-01/decide',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            action: 'REJECT',
            comment: 'Thiếu chữ ký xác nhận của đại diện pháp luật',
          }),
        })
      );
    });
  });
});
