import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { ApiError } from '@/lib/api-client';
import fs from 'fs';
import path from 'path';

// Kiểu hợp đồng của apiFetchList theo brief mục 3 & 5
type ListMeta = {
  page: number;
  limit: number;
  total_records: number;
  total_pages: number;
};

type ApiFetchListFn = <T = unknown>(
  path: string,
  init?: RequestInit
) => Promise<{ data: T[]; meta: ListMeta }>;

function getApiFetchList(): ApiFetchListFn {
  const fn = (apiClient as Record<string, unknown>).apiFetchList as ApiFetchListFn | undefined;
  if (typeof fn !== 'function') {
    throw new Error('apiFetchList chưa được export từ @/lib/api-client');
  }
  return fn;
}

describe('TASK-040: Tiêu chí 1 — Hợp đồng apiFetchList (brief mục 5.1)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: '',
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('apiFetchList được export dưới dạng hàm từ @/lib/api-client', () => {
    const fn = (apiClient as Record<string, unknown>).apiFetchList;
    expect(typeof fn).toBe('function');
  });

  it('thành công: trả về cả data (mảng) và meta từ phản hồi { success: true, data: [...], meta: {...} }', async () => {
    const apiFetchList = getApiFetchList();
    const mockItems = [
      { id: 'case-01', code: 'ASL-2026-TM-0001' },
      { id: 'case-02', code: 'ASL-2026-LD-0002' },
    ];
    const mockMeta: ListMeta = {
      page: 1,
      limit: 20,
      total_records: 45,
      total_pages: 3,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: mockItems,
        meta: mockMeta,
      }),
    });

    const result = await apiFetchList<typeof mockItems[0]>('/cases');

    expect(result).toBeDefined();
    expect(result.data).toEqual(mockItems);
    expect(result.meta).toEqual(mockMeta);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/cases',
      expect.objectContaining({
        credentials: 'include',
      })
    );
  });

  it('giữ nguyên query parameters trong URL (vd: /cases?page=2&limit=50)', async () => {
    const apiFetchList = getApiFetchList();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [],
        meta: { page: 2, limit: 50, total_records: 0, total_pages: 0 },
      }),
    });

    await apiFetchList('/cases?page=2&limit=50');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/cases?page=2&limit=50',
      expect.anything()
    );
  });

  it('POST/PUT/PATCH/DELETE gửi kèm X-CSRF-Token lấy từ cookie csrf_token', async () => {
    const apiFetchList = getApiFetchList();
    document.cookie = 'csrf_token=csrf_secret_test_040';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [],
        meta: { page: 1, limit: 20, total_records: 0, total_pages: 0 },
      }),
    });

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      await apiFetchList('/crm/clients', {
        method,
        body: JSON.stringify({ test: 1 }),
      });
      const lastCall = (global.fetch as any).mock.calls.at(-1);
      const headers = new Headers(lastCall[1]?.headers);
      expect(headers.get('X-CSRF-Token')).toBe('csrf_secret_test_040');
    }
  });

  it('GET không gửi kèm X-CSRF-Token', async () => {
    const apiFetchList = getApiFetchList();
    document.cookie = 'csrf_token=csrf_secret_test_040';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [],
        meta: { page: 1, limit: 20, total_records: 0, total_pages: 0 },
      }),
    });

    await apiFetchList('/cases', { method: 'GET' });

    const callArgs = (global.fetch as any).mock.calls[0];
    const headers = new Headers(callArgs[1]?.headers);
    expect(headers.has('X-CSRF-Token')).toBe(false);
  });

  it('lỗi HTTP (ok: false) hoặc success: false: ném ApiError đúng code, status, message, details', async () => {
    const apiFetchList = getApiFetchList();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Tham số limit không hợp lệ',
          details: { field: 'limit', reason: 'Vượt quá 100' },
        },
      }),
    });

    await expect(apiFetchList('/cases?limit=999')).rejects.toThrow(ApiError);

    try {
      await apiFetchList('/cases?limit=999');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(422);
      expect(apiErr.code).toBe('VALIDATION_ERROR');
      expect(apiErr.message).toBe('Tham số limit không hợp lệ');
      expect(apiErr.details).toEqual({ field: 'limit', reason: 'Vượt quá 100' });
    }
  });

  it('401 TOKEN_REVOKED (hoặc UNAUTHENTICATED): gọi /auth/refresh 1 lần rồi thử lại thành công', async () => {
    const apiFetchList = getApiFetchList();
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      callCount++;
      if (url === '/api/v1/cases' && callCount === 1) {
        return {
          ok: false,
          status: 401,
          json: async () => ({
            success: false,
            error: { code: 'TOKEN_REVOKED', message: 'Token đã bị thu hồi' },
          }),
        };
      }
      if (url === '/api/v1/auth/refresh') {
        expect(init?.method).toBe('POST');
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { refreshed: true } }),
        };
      }
      if (url === '/api/v1/cases' && callCount === 3) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: [{ id: 'case-01' }],
            meta: { page: 1, limit: 20, total_records: 1, total_pages: 1 },
          }),
        };
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    const result = await apiFetchList<{ id: string }>('/cases');
    expect(result.data).toEqual([{ id: 'case-01' }]);
    expect(result.meta.total_records).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('401 khi refresh thất bại: ném lỗi gốc, không lặp vô hạn', async () => {
    const apiFetchList = getApiFetchList();
    let refreshCallCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/v1/cases') {
        return {
          ok: false,
          status: 401,
          json: async () => ({
            success: false,
            error: { code: 'TOKEN_REVOKED', message: 'Token đã bị thu hồi' },
          }),
        };
      }
      if (url === '/api/v1/auth/refresh') {
        refreshCallCount++;
        return {
          ok: false,
          status: 401,
          json: async () => ({
            success: false,
            error: { code: 'REFRESH_TOKEN_EXPIRED', message: 'Phiên đăng nhập hết hạn' },
          }),
        };
      }
      throw new Error(`Unexpected url ${url}`);
    });

    await expect(apiFetchList('/cases')).rejects.toThrow(ApiError);
    expect(refreshCallCount).toBe(1);
  });

  it('401 trên endpoint /auth/*: không gọi refresh', async () => {
    const apiFetchList = getApiFetchList();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'Chưa đăng nhập' },
      }),
    });

    await expect(apiFetchList('/auth/users')).rejects.toThrow(ApiError);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('TASK-040: Tiêu chí 4 — Chống hồi quy .items trong frontend/src (brief mục 5.4)', () => {
  it('không còn chỗ đọc .items từ phản hồi API của endpoint trả mảng', () => {
    const srcDir = path.resolve(__dirname, '../src');

    // Các file đã biết lệch cần loại bỏ việc đọc .items
    const targets = [
      'app/(dashboard)/cases/page.tsx',
      'app/(dashboard)/crm/clients/page.tsx',
      'app/(dashboard)/admin/users/page.tsx',
      'app/(dashboard)/admin/departments/page.tsx',
      'app/(dashboard)/admin/audit-logs/page.tsx',
      'app/(dashboard)/accounting/page.tsx',
      'app/(dashboard)/finance/page.tsx',
      'app/(dashboard)/page.tsx',
      'hooks/use-my-tasks.ts',
    ];

    const violations: string[] = [];

    for (const rel of targets) {
      const fullPath = path.join(srcDir, rel);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        // Bỏ qua comment
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
          return;
        }

        // Bỏ qua menu items (section.items, menu.items)
        if (line.includes('section.items') || line.includes('menu.items')) {
          return;
        }

        // Kiểm tra đọc .items từ dữ liệu API
        const itemRegex = /(?:data|usersData|auditData|inboxData|commissionsData|casesData|myTasksData)\??\.items\b/;
        if (itemRegex.test(line)) {
          violations.push(`${rel}:${index + 1}: ${trimmed}`);
        }
      });
    }

    expect(
      violations,
      `Vẫn còn đọc .items từ phản hồi API trong:\n${violations.join('\n')}`
    ).toEqual([]);
  });
});
