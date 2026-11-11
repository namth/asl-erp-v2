import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, ApiError } from '@/lib/api-client';

describe('api-client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    // Reset cookie
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: '',
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('thành công: trả về data từ phong bì phản hồi { success: true, data }', async () => {
    const mockData = { id: '123', name: 'Công ty ASL' };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: mockData }),
    });

    const result = await apiFetch<typeof mockData>('/cases');

    expect(result).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/cases',
      expect.objectContaining({
        credentials: 'include',
      })
    );
  });

  it('GET không gửi kèm X-CSRF-Token', async () => {
    document.cookie = 'csrf_token=dummy_csrf_secret';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { status: 'healthy' } }),
    });

    await apiFetch('/health', { method: 'GET' });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const callArgs = (global.fetch as any).mock.calls[0];
    const headers = new Headers(callArgs[1]?.headers);
    expect(headers.has('X-CSRF-Token')).toBe(false);
  });

  it('POST/PUT/PATCH/DELETE gửi kèm X-CSRF-Token lấy từ cookie csrf_token', async () => {
    document.cookie = 'csrf_token=test_token_abc123';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { created: true } }),
    });

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      await apiFetch('/crm/clients', {
        method,
        body: JSON.stringify({ name: 'ASL Gate' }),
      });
      const lastCall = (global.fetch as any).mock.calls.at(-1);
      const headers = new Headers(lastCall[1]?.headers);
      expect(headers.get('X-CSRF-Token')).toBe('test_token_abc123');
    }
  });

  it('ném ApiError đúng status, code, message, details khi server trả mã lỗi', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dữ liệu không hợp lệ',
          details: { field: 'email', reason: 'Email không đúng định dạng' },
        },
      }),
    });

    await expect(apiFetch('/users')).rejects.toThrow(ApiError);

    try {
      await apiFetch('/users');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(422);
      expect(apiErr.code).toBe('VALIDATION_ERROR');
      expect(apiErr.message).toBe('Dữ liệu không hợp lệ');
      expect(apiErr.details).toEqual({
        field: 'email',
        reason: 'Email không đúng định dạng',
      });
    }
  });

  it('401 TOKEN_REVOKED (hoặc UNAUTHENTICATED): gọi /auth/refresh một lần rồi thử lại thành công', async () => {
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
          json: async () => ({ success: true, data: [{ id: 'case-1' }] }),
        };
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    const data = await apiFetch<Array<{ id: string }>>('/cases');
    expect(data).toEqual([{ id: 'case-1' }]);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('401 khi refresh thất bại: ném lỗi gốc, không lặp vô hạn', async () => {
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
            error: { code: 'TOKEN_REVOKED', message: 'Refresh token cũng đã bị thu hồi' },
          }),
        };
      }
      throw new Error(`Unexpected url ${url}`);
    });

    await expect(apiFetch('/cases')).rejects.toThrow(ApiError);
    // Phải gọi refresh đúng 1 lần, không lặp vô tận
    expect(refreshCallCount).toBe(1);
  });

  it('401 trên chính các endpoint /auth/*: không gọi refresh', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'Email hoặc mật khẩu không đúng' },
      }),
    });

    await expect(
      apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'a@asllaw.vn' }) })
    ).rejects.toThrow(ApiError);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
