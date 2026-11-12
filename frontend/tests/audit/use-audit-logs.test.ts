import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as apiClient from '@/lib/api-client';
import {
  useAuditLogs,
  useAuditIntegrity,
  useRecheckIntegrity,
} from '@/hooks/use-audit-logs';

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

describe('Hooks nhật ký kiểm toán - use-audit-logs.ts (TanStack Query & brief mục 4, 5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('useAuditLogs hook', () => {
    it('gọi GET /audit-logs với đầy đủ query parameters (actor_id, actor_type, action, entity_name, entity_id, from, to, page, limit)', async () => {
      const mockResponse = {
        data: [
          {
            id: 1042,
            created_at: '2026-11-11T09:12:03.120Z',
            actor_type: 'USER',
            actor: {
              id: 'c1f8a29e-1f2e-4b7b-8d0a-5c2f3b9d0e1a',
              full_name: 'LS. Nguyễn Văn Trường',
              email: 'truong.nv@asllaw.vn',
            },
            action: 'USER_DEACTIVATED',
            entity_name: 'users',
            entity_id: 'u-5f0c',
            before_state: { is_active: true },
            after_state: { is_active: false, reason: 'Nghỉ việc' },
            ip_address: '10.0.0.12',
            user_agent: 'Mozilla/5.0 Chrome/130',
            row_hash: '9b1deb4d3b7d4bad9bdd2b0d7b3dcb6d5f0c1e2f3a4b',
          },
        ],
        meta: { page: 2, limit: 50, total_records: 1042, total_pages: 21 },
      };

      const apiListSpy = vi.fn().mockResolvedValue(mockResponse);
      vi.spyOn(apiClient, "apiFetchList").mockImplementation(apiListSpy);
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockResponse as any);

      const filters = {
        actor_id: 'c1f8a29e-1f2e-4b7b-8d0a-5c2f3b9d0e1a',
        actor_type: 'USER' as const,
        action: 'USER_DEACTIVATED',
        entity_name: 'users',
        entity_id: 'u-5f0c',
        from: '2026-11-01T00:00:00Z',
        to: '2026-11-11T23:59:59Z',
        page: 2,
        limit: 50,
      };

      const { result } = renderHook(() => useAuditLogs(filters), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const lastUrl = apiListSpy.mock.calls[0]?.[0] || apiSpy.mock.calls[0]?.[0];
      expect(lastUrl).toMatch(
        /\/audit-logs\?(?=.*actor_id=c1f8a29e-1f2e-4b7b-8d0a-5c2f3b9d0e1a)(?=.*actor_type=USER)(?=.*action=USER_DEACTIVATED)(?=.*entity_name=users)(?=.*entity_id=u-5f0c)(?=.*from=2026-11-01T00%3A00%3A00Z|from=2026-11-01T00:00:00Z)(?=.*to=2026-11-11T23%3A59%3A59Z|to=2026-11-11T23:59:59Z)(?=.*page=2)(?=.*limit=50)/
      );
      expect(result.current.data).toEqual(mockResponse);
    });

    it('bỏ các tham số rỗng ("", undefined, null) khỏi query string', async () => {
      const mockResponse = {
        data: [],
        meta: { page: 1, limit: 50, total_records: 0, total_pages: 0 },
      };

      const apiListSpy = vi.fn().mockResolvedValue(mockResponse);
      vi.spyOn(apiClient, "apiFetchList").mockImplementation(apiListSpy);
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockResponse as any);

      const { result } = renderHook(
        () =>
          useAuditLogs({
            action: '',
            actor_id: undefined,
            actor_type: undefined,
            entity_name: '',
            entity_id: undefined,
            from: '',
            to: undefined,
            page: 1,
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const calledUrl = apiSpy.mock.calls[0][0];
      // Không được chứa các tham số rỗng dạng "action=&" hay "actor_id="
      expect(calledUrl).not.toContain('action=');
      expect(calledUrl).not.toContain('actor_id=');
      expect(calledUrl).not.toContain('actor_type=');
      expect(calledUrl).not.toContain('entity_name=');
      expect(calledUrl).not.toContain('entity_id=');
      expect(calledUrl).not.toContain('from=');
      expect(calledUrl).not.toContain('to=');
      expect(calledUrl).toContain('page=1');
    });

    it('gọi GET /audit-logs với giá trị mặc định khi không truyền filter', async () => {
      const mockResponse = {
        items: [],
        meta: { page: 1, limit: 50, total_records: 0, total_pages: 0 },
      };
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockResponse as any);

      const { result } = renderHook(() => useAuditLogs(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(apiSpy).toHaveBeenCalledWith(expect.stringMatching(/\/audit-logs/));
    });
  });

  describe('useAuditIntegrity hook', () => {
    it('gọi GET /audit-logs/integrity để kiểm tra trạng thái toàn vẹn chuỗi băm', async () => {
      const mockIntegrity = {
        status: 'OK',
        checked_rows: 1042,
        verified_at: '2026-11-11T02:00:04Z',
        first_broken_id: null,
      };

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockIntegrity as any);

      const { result } = renderHook(() => useAuditIntegrity(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith(expect.stringMatching(/\/audit-logs\/integrity(?!\?recheck=true)/));
      expect(result.current.data).toEqual(mockIntegrity);
    });
  });

  describe('useRecheckIntegrity hook', () => {
    it('gọi GET /audit-logs/integrity?recheck=true khi kích hoạt kiểm tra lại ngay', async () => {
      const mockRecheckResult = {
        status: 'OK',
        checked_rows: 1045,
        verified_at: '2026-11-11T09:30:00Z',
        first_broken_id: null,
      };

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockRecheckResult as any);

      const { result } = renderHook(() => useRecheckIntegrity(), {
        wrapper: createWrapper(),
      });

      // Hook có thể dạng useMutation hoặc trigger function
      if ('mutateAsync' in result.current) {
        const data = await (result.current as any).mutateAsync();
        expect(data).toEqual(mockRecheckResult);
      } else if ('trigger' in result.current) {
        const data = await (result.current as any).trigger();
        expect(data).toEqual(mockRecheckResult);
      } else if (typeof result.current === 'function') {
        const data = await (result.current as any)();
        expect(data).toEqual(mockRecheckResult);
      } else {
        await waitFor(() => expect((result.current as any).isSuccess).toBe(true));
      }

      expect(apiSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\/audit-logs\/integrity\?recheck=true/)
      );
    });

    it('ném lỗi RATE_LIMITED (429) khi gọi recheck quá 1 lần trong 5 phút', async () => {
      const apiError = new apiClient.ApiError(429, 'RATE_LIMITED', 'Vừa kiểm tra, thử lại sau ít phút');
      vi.spyOn(apiClient, 'apiFetch').mockRejectedValue(apiError);

      const { result } = renderHook(() => useRecheckIntegrity(), {
        wrapper: createWrapper(),
      });

      if ('mutateAsync' in result.current) {
        await expect((result.current as any).mutateAsync()).rejects.toThrow('Vừa kiểm tra, thử lại sau ít phút');
      } else if (typeof result.current === 'function') {
        await expect((result.current as any)()).rejects.toThrow('Vừa kiểm tra, thử lại sau ít phút');
      }
    });
  });
});
