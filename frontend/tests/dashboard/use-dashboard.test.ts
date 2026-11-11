import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as apiClient from '@/lib/api-client';
import { useMyTasks } from '@/hooks/use-my-tasks';
import { useCommissionDefaults, useUpdateCommissionDefaults } from '@/hooks/use-settings';

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

describe('Hooks dữ liệu cho Dashboard & Cài đặt (brief mục 3, 4, 5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('useMyTasks hook (GET /me/tasks)', () => {
    it('gọi GET /me/tasks mặc định khi không truyền bộ lọc', async () => {
      const mockResponse = {
        items: [
          {
            id: 'task-1',
            title: 'Soạn thảo hợp đồng dịch vụ pháp lý',
            status: 'TODO',
            due_at: '2026-11-15T10:00:00Z',
            is_overdue: false,
            case: { id: 'c-1', case_code: 'ASL-2026-MNA-001', title: 'Thẩm định M&A' },
            stage: { name: 'Thẩm định', status: 'IN_PROGRESS' },
            blocked_by_count: 0,
          },
        ],
        summary: {
          todo: 1,
          in_progress: 2,
          waiting_approval: 0,
          overdue: 0,
        },
        meta: { total: 1, page: 1, limit: 20, total_pages: 1 },
      };

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockResponse as any);

      const { result } = renderHook(() => useMyTasks(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(apiSpy).toHaveBeenCalledWith(expect.stringMatching(/^\/me\/tasks(\?.*)?$/));
      expect(result.current.data).toEqual(mockResponse);
    });

    it('truyền đúng query parameters khi lọc theo due (overdue/today/week), status và page', async () => {
      const mockResponse = {
        items: [],
        summary: { todo: 0, in_progress: 0, waiting_approval: 0, overdue: 0 },
      };

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockResponse as any);

      const { result } = renderHook(
        () => useMyTasks({ due: 'overdue', status: 'TODO', page: 2 }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const calledUrl = apiSpy.mock.calls[0][0];
      expect(calledUrl).toContain('/me/tasks?');
      expect(calledUrl).toContain('due=overdue');
      expect(calledUrl).toContain('status=TODO');
      expect(calledUrl).toContain('page=2');
    });
  });

  describe('useCommissionDefaults & useUpdateCommissionDefaults hooks (GET/PUT /settings/commission-defaults)', () => {
    const mockDefaults = [
      {
        matter_type_id: 'mt-1',
        name: 'Nhãn hiệu quốc tế',
        code: 'TRADEMARK',
        default_originator_rate: '15.00',
        default_management_rate: '10.00',
        default_supervisor_share_pct: '30.00',
        default_execution_rate: '25.00',
      },
    ];

    it('useCommissionDefaults gọi GET /settings/commission-defaults để tải cấu hình', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockDefaults as any);

      const { result } = renderHook(() => useCommissionDefaults(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(apiSpy).toHaveBeenCalledWith('/settings/commission-defaults');
      expect(result.current.data).toEqual(mockDefaults);
    });

    it('useUpdateCommissionDefaults gọi PUT /settings/commission-defaults gửi toàn bộ bảng cấu hình với tỷ lệ là chuỗi', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ success: true } as any);

      const { result } = renderHook(() => useUpdateCommissionDefaults(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync(mockDefaults);

      expect(apiSpy).toHaveBeenCalledWith(
        '/settings/commission-defaults',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(mockDefaults),
        })
      );
    });
  });
});
