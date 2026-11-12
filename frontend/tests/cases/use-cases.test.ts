import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as apiClient from '@/lib/api-client';
import {
  useCases,
  useCase,
  useCaseStages,
  useAssignments,
  useSetAssignments,
  useChangeCaseStatus,
} from '@/hooks/use-cases';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('Hooks dữ liệu Vụ việc - use-cases.ts (TanStack Query & brief mục 4, 5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('useCases hook', () => {
    it('gọi GET /cases với đầy đủ query parameters (q, status, department_id, mine=true, page, limit=20)', async () => {
      const mockResponse = {
        data: [
          {
            id: 'case-001',
            case_code: 'ASL-2026-TM-0045',
            title: 'Đăng ký nhãn hiệu quốc tế ASL GATEWAY',
            client_name: 'Công ty Cổ phần Công nghệ ASL Gate',
            status: 'ACTIVE',
            workflow_mode: 'STRICT',
            current_stage: {
              id: 'stg-1',
              name: 'Nộp đơn và thẩm định hình thức',
              status: 'WAITING_PAYMENT',
            },
            progress_pct: 45,
            due_at_nearest: '2026-11-20T00:00:00Z',
            my_role_in_case: 'CASE_MANAGER',
          },
        ],
        meta: { page: 2, limit: 20, total_records: 25, total_pages: 2 },
      };

      const apiListSpy = vi.fn().mockResolvedValue(mockResponse);
      vi.spyOn(apiClient, "apiFetchList").mockImplementation(apiListSpy);
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockResponse as any);

      const { result } = renderHook(
        () =>
          useCases({
            q: 'ASL GATEWAY',
            status: 'ACTIVE',
            department_id: 'dept-ip',
            mine: true,
            page: 2,
            limit: 20,
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const lastCalledUrl = apiListSpy.mock.calls[0]?.[0] || apiSpy.mock.calls[0]?.[0];
      expect(lastCalledUrl).toMatch(
        /\/cases\?(?=.*q=ASL(\+|%20)GATEWAY)(?=.*status=ACTIVE)(?=.*department_id=dept-ip)(?=.*mine=true)(?=.*page=2)(?=.*limit=20)/
      );
      expect(result.current.data).toEqual(mockResponse);
    });

    it('bỏ qua các tham số rỗng (q="", status="") và chỉ gửi tham số có giá trị', async () => {
      const mockResponse = {
        data: [],
        meta: { page: 1, limit: 20, total_records: 0, total_pages: 0 },
      };
      const apiListSpy = vi.fn().mockResolvedValue(mockResponse);
      vi.spyOn(apiClient, "apiFetchList").mockImplementation(apiListSpy);
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockResponse as any);

      const { result } = renderHook(
        () =>
          useCases({
            q: '',
            status: '',
            department_id: 'dept-corporate',
            page: 1,
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const calledUrl = apiListSpy.mock.calls[0]?.[0] || apiSpy.mock.calls[0]?.[0];
      expect(calledUrl).toMatch(/\/cases\?(?=.*department_id=dept-corporate)(?=.*page=1)/);
      // Không được chứa q= hoặc status=
      expect(calledUrl).not.toContain('q=');
      expect(calledUrl).not.toContain('status=');
    });

    it('gọi GET /cases với giá trị mặc định khi không truyền filter', async () => {
      const mockResponse = {
        data: [],
        meta: { page: 1, limit: 20, total_records: 0, total_pages: 0 },
      };
      const apiListSpy = vi.fn().mockResolvedValue(mockResponse);
      vi.spyOn(apiClient, "apiFetchList").mockImplementation(apiListSpy);
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockResponse as any);

      const { result } = renderHook(() => useCases(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      const calledUrl = apiListSpy.mock.calls[0]?.[0] || apiSpy.mock.calls[0]?.[0];
      expect(calledUrl).toMatch(/\/cases(\?.*)?$/);
    });
  });

  describe('useCase hook', () => {
    it('gọi GET /cases/{id} ở phạm vi chuyên môn thông thường (không truyền view)', async () => {
      const mockCase = {
        id: 'case-001',
        case_code: 'ASL-2026-TM-0045',
        title: 'Đăng ký nhãn hiệu quốc tế ASL GATEWAY',
        status: 'ACTIVE',
        workflow_mode: 'STRICT',
        is_legacy: false,
        contract_value: '150000000',
        client: {
          id: 'client-1',
          name: 'Công ty Cổ phần Công nghệ ASL Gate',
          tax_code: '0109988776',
        },
        current_stage: {
          id: 'stg-1',
          name: 'Nộp đơn và thẩm định hình thức',
          order_index: 2,
          status: 'WAITING_PAYMENT',
          blocking_milestone_id: 'ms-1',
        },
        progress_pct: 45,
        assignments: [
          { user_id: 'u1', full_name: 'Phạm Quốc Tuấn', role_in_case: 'SUPERVISOR' },
          { user_id: 'u2', full_name: 'Nguyễn Văn Trường', role_in_case: 'CASE_MANAGER' },
          { user_id: 'u3', full_name: 'Lê Mai Anh', role_in_case: 'EXECUTOR' },
        ],
        custom_data: {
          application_no: '4-2026-12345',
          filing_date: '2026-10-15',
          classes: ['09', '42'],
        },
      };

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockCase as any);

      const { result } = renderHook(() => useCase('case-001'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(apiSpy).toHaveBeenCalledWith('/cases/case-001');
      expect(result.current.data).toEqual(mockCase);
    });

    it('gọi GET /cases/{id}?view=progress khi truyền view: "progress"', async () => {
      const mockProgressCase = {
        id: 'case-001',
        case_code: 'ASL-2026-TM-0045',
        title: 'Đăng ký nhãn hiệu quốc tế ASL GATEWAY',
        status: 'ACTIVE',
        progress_pct: 45,
        billing_milestones: [
          { id: 'ms-1', name: 'Đợt 1', amount: '45000000', status: 'PAID_CONFIRMED' },
          { id: 'ms-2', name: 'Đợt 2', amount: '60000000', status: 'AWAITING_PAYMENT' },
        ],
      };

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockProgressCase as any);

      const { result } = renderHook(() => useCase('case-001', { view: 'progress' }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(apiSpy).toHaveBeenCalledWith('/cases/case-001?view=progress');
      expect(result.current.data).toEqual(mockProgressCase);
    });

    it('xử lý lỗi 403 NEED_TO_KNOW_DENIED khi không thuộc phạm vi vụ việc', async () => {
      const forbiddenError = new apiClient.ApiError(
        403,
        'NEED_TO_KNOW_DENIED',
        'Bạn không thuộc phạm vi vụ việc này'
      );
      vi.spyOn(apiClient, 'apiFetch').mockRejectedValue(forbiddenError);

      const { result } = renderHook(() => useCase('case-restricted'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBeInstanceOf(apiClient.ApiError);
      expect((result.current.error as apiClient.ApiError).code).toBe('NEED_TO_KNOW_DENIED');
    });
  });

  describe('useCaseStages hook', () => {
    it('gọi GET /cases/{id}/stages trả về danh sách giai đoạn theo order_index', async () => {
      const mockStages = [
        {
          id: 'stg-1',
          name: 'Tiếp nhận & tư vấn sơ bộ',
          order_index: 1,
          status: 'COMPLETED',
          requires_approval: false,
          task_counts: { todo: 0, in_progress: 0, waiting_approval: 0, completed: 3 },
        },
        {
          id: 'stg-2',
          name: 'Nộp đơn & thẩm định hình thức',
          order_index: 2,
          status: 'WAITING_PAYMENT',
          requires_approval: true,
          blocking_milestone: {
            id: 'ms-2',
            name: 'Đợt 2 - Có thông báo đơn hợp lệ',
            status: 'AWAITING_PAYMENT',
          },
          task_counts: { todo: 2, in_progress: 1, waiting_approval: 0, completed: 0 },
        },
        {
          id: 'stg-3',
          name: 'Thẩm định nội dung & cấp văn bằng',
          order_index: 3,
          status: 'LOCKED',
          requires_approval: true,
          task_counts: { todo: 4, in_progress: 0, waiting_approval: 0, completed: 0 },
        },
      ];

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockStages as any);

      const { result } = renderHook(() => useCaseStages('case-001'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(apiSpy).toHaveBeenCalledWith('/cases/case-001/stages');
      expect(result.current.data).toEqual(mockStages);
      expect(result.current.data?.[1].blocking_milestone?.name).toBe('Đợt 2 - Có thông báo đơn hợp lệ');
    });
  });

  describe('useAssignments & useSetAssignments hooks', () => {
    it('useAssignments gọi GET /cases/{id}/assignments', async () => {
      const mockAssignments = [
        { user_id: 'u1', full_name: 'Phạm Quốc Tuấn', role_in_case: 'SUPERVISOR' },
        { user_id: 'u2', full_name: 'Nguyễn Văn Trường', role_in_case: 'CASE_MANAGER' },
        { user_id: 'u3', full_name: 'Lê Mai Anh', role_in_case: 'EXECUTOR' },
      ];

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockAssignments as any);

      const { result } = renderHook(() => useAssignments('case-001'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(apiSpy).toHaveBeenCalledWith('/cases/case-001/assignments');
      expect(result.current.data).toEqual(mockAssignments);
    });

    it('useSetAssignments gọi PUT /cases/{id}/assignments với payload assignments chuẩn', async () => {
      const payload = {
        assignments: [
          { user_id: 'u2', role_in_case: 'CASE_MANAGER' },
          { user_id: 'u1', role_in_case: 'SUPERVISOR' },
          { user_id: 'u4', role_in_case: 'EXECUTOR' },
        ],
      };

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ success: true } as any);

      const { result } = renderHook(() => useSetAssignments('case-001'), { wrapper: createWrapper() });

      await result.current.mutateAsync(payload);

      expect(apiSpy).toHaveBeenCalledWith('/cases/case-001/assignments', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    });

    it('useSetAssignments xử lý lỗi 409 ASSIGNEE_HAS_OPEN_TASKS kèm danh sách task cần bàn giao', async () => {
      const openTasksError = new apiClient.ApiError(
        409,
        'ASSIGNEE_HAS_OPEN_TASKS',
        'Gỡ phân công người còn task đang xử lý hoặc chờ duyệt',
        { task_ids: ['task-101', 'task-102'] }
      );
      vi.spyOn(apiClient, 'apiFetch').mockRejectedValue(openTasksError);

      const { result } = renderHook(() => useSetAssignments('case-001'), { wrapper: createWrapper() });

      await expect(
        result.current.mutateAsync({
          assignments: [{ user_id: 'u2', role_in_case: 'CASE_MANAGER' }],
        })
      ).rejects.toMatchObject({
        code: 'ASSIGNEE_HAS_OPEN_TASKS',
        details: { task_ids: ['task-101', 'task-102'] },
      });
    });
  });

  describe('useChangeCaseStatus hook', () => {
    it('gọi POST /cases/{id}/status để chuyển sang ACTIVE', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ success: true } as any);

      const { result } = renderHook(() => useChangeCaseStatus('case-001'), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync({ status: 'ACTIVE' });

      expect(apiSpy).toHaveBeenCalledWith('/cases/case-001/status', {
        method: 'POST',
        body: JSON.stringify({ status: 'ACTIVE' }),
      });
    });

    it('gọi POST /cases/{id}/status với lý do bắt buộc khi PAUSED hoặc TERMINATED', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ success: true } as any);

      const { result } = renderHook(() => useChangeCaseStatus('case-001'), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync({
        status: 'PAUSED',
        reason: 'Khách hàng yêu cầu tạm hoãn để bổ sung tài liệu uỷ quyền',
      });

      expect(apiSpy).toHaveBeenCalledWith('/cases/case-001/status', {
        method: 'POST',
        body: JSON.stringify({
          status: 'PAUSED',
          reason: 'Khách hàng yêu cầu tạm hoãn để bổ sung tài liệu uỷ quyền',
        }),
      });
    });
  });
});
