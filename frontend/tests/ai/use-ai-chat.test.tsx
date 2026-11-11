import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAiChat } from '@/hooks/use-ai-chat';
import { useAiDrawerStore } from '@/stores/ai-drawer-store';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('Hook tích hợp API useAiChat - hooks/use-ai-chat.ts (brief mục 4 & 5)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    useAiDrawerStore.setState({
      isOpen: true,
      sessionId: 'sess-test-uuid-1234',
      messages: [],
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('gửi request POST /ai/chat hoặc /api/v1/ai/chat với header Accept: application/json và body { message, session_id }', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedInit = init;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: {
            response_text: 'Xin chào, đây là câu trả lời thử nghiệm.',
            suggested_actions: [{ label: 'Xem hồ sơ', action_url: '/cases/c1' }],
          },
        }),
      } as Response;
    });

    const { result } = renderHook(() => useAiChat(), { wrapper: createWrapper() });

    await act(async () => {
      if (typeof result.current.sendMessage === 'function') {
        await result.current.sendMessage('Chào trợ lý');
      } else if (typeof result.current.mutate === 'function') {
        result.current.mutate({ message: 'Chào trợ lý', session_id: 'sess-test-uuid-1234' });
      } else if (typeof result.current.mutateAsync === 'function') {
        await result.current.mutateAsync({ message: 'Chào trợ lý', session_id: 'sess-test-uuid-1234' });
      }
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    expect(capturedUrl).toMatch(/\/(api\/v1\/)?ai\/chat$/);
    expect(capturedInit?.method).toBe('POST');

    const headers = new Headers(capturedInit?.headers);
    expect(headers.get('Accept') || headers.get('accept')).toContain('application/json');

    const body = JSON.parse(String(capturedInit?.body || '{}'));
    expect(body.message).toBe('Chào trợ lý');
    expect(body.session_id).toBe('sess-test-uuid-1234');
  });

  it('duy trì cùng session_id qua nhiều lượt gửi tin nhắn', async () => {
    const sentSessionIds: string[] = [];

    global.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}'));
      sentSessionIds.push(body.session_id);
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: { response_text: 'Đã nhận câu hỏi', suggested_actions: [] },
        }),
      } as Response;
    });

    const { result } = renderHook(() => useAiChat(), { wrapper: createWrapper() });

    // Lượt 1
    await act(async () => {
      if (typeof result.current.sendMessage === 'function') {
        await result.current.sendMessage('Câu hỏi 1');
      } else if (typeof result.current.mutateAsync === 'function') {
        await result.current.mutateAsync({ message: 'Câu hỏi 1', session_id: 'sess-test-uuid-1234' });
      }
    });

    // Lượt 2
    await act(async () => {
      if (typeof result.current.sendMessage === 'function') {
        await result.current.sendMessage('Câu hỏi 2');
      } else if (typeof result.current.mutateAsync === 'function') {
        await result.current.mutateAsync({ message: 'Câu hỏi 2', session_id: 'sess-test-uuid-1234' });
      }
    });

    expect(sentSessionIds.length).toBe(2);
    expect(sentSessionIds[0]).toBe('sess-test-uuid-1234');
    expect(sentSessionIds[1]).toBe('sess-test-uuid-1234');
  });

  it('xử lý mã lỗi 429: hiển thị thông điệp "Bạn đã hỏi quá nhiều, thử lại sau ít phút"', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Quá giới hạn',
        },
      }),
    } as Response);

    const { result } = renderHook(() => useAiChat(), { wrapper: createWrapper() });

    try {
      await act(async () => {
        if (typeof result.current.sendMessage === 'function') {
          await result.current.sendMessage('Câu hỏi liên tục');
        } else if (typeof result.current.mutateAsync === 'function') {
          await result.current.mutateAsync({ message: 'Câu hỏi liên tục', session_id: 'sess-test-uuid-1234' });
        }
      });
    } catch {
      // Cho phép hook ném lỗi ra hoặc lưu lỗi vào store
    }

    const state = useAiDrawerStore.getState();
    const hasRateLimitMsg =
      (state.messages || []).some(
        (m: any) =>
          typeof m.content === 'string' &&
          m.content.includes('Bạn đã hỏi quá nhiều, thử lại sau ít phút')
      ) ||
      (state.messages || []).some(
        (m: any) =>
          typeof m.text === 'string' &&
          m.text.includes('Bạn đã hỏi quá nhiều, thử lại sau ít phút')
      ) ||
      (result.current.error &&
        String((result.current.error as { message?: string } | null)?.message || '').includes(
          'Bạn đã hỏi quá nhiều, thử lại sau ít phút'
        ));

    expect(hasRateLimitMsg).toBe(true);
  });
});
