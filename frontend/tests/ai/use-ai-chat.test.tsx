/**
 * Hợp đồng hook useAiChat — bản stream SSE (TASK-051).
 * Backend: docs/07-api-contracts.md mục `POST /api/v1/ai/chat/stream` (sự kiện delta / done / error).
 * - Hook gọi `/ai/chat/stream` qua `apiStream` (frontend/src/lib/api-stream.ts) — dùng chung base URL, CSRF,
 *   credentials và làm mới phiên 401 như `apiFetch`.
 * - Mỗi câu hỏi tạo đúng MỘT tin assistant, chữ được nối dần theo từng `delta` (isPending=true khi đang chạy).
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAiChat } from '@/hooks/use-ai-chat';
import { useAiDrawerStore } from '@/stores/ai-drawer-store';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const enc = new TextEncoder();

function ev(name: string, data: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Response SSE có thể đẩy từng mảnh byte theo ý test. */
function controlledSse() {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
    },
  });
  return {
    response: new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    push: (s: string) => ctrl.enqueue(enc.encode(s)),
    close: () => ctrl.close(),
  };
}

function sseResponse(chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const s of chunks) c.enqueue(enc.encode(s));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function assistants() {
  return (useAiDrawerStore.getState().messages || []).filter((m) => m.role === 'assistant');
}

function textOf(m: { content?: string; text?: string; response_text?: string } | undefined): string {
  return m?.content ?? m?.text ?? m?.response_text ?? '';
}

describe('useAiChat — stream SSE /ai/chat/stream', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    document.cookie = 'csrf_token=csrf-abc; path=/';
    useAiDrawerStore.setState({ isOpen: true, sessionId: 'sess-test-uuid-1234', messages: [] });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('gọi POST /ai/chat/stream với Accept text/event-stream, CSRF, credentials và body { message, session_id }', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return sseResponse([ev('delta', { text: 'Chào' }), ev('done', { session_id: 'sess-test-uuid-1234', suggested_actions: [] })]);
    }) as typeof fetch;

    const { result } = renderHook(() => useAiChat(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.sendMessage('Chào trợ lý');
    });

    expect(calls.length).toBe(1);
    expect(calls[0].url).toMatch(/\/(api\/v1\/)?ai\/chat\/stream$/);
    const init = calls[0].init!;
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    const headers = new Headers(init.headers);
    expect(headers.get('Accept')).toContain('text/event-stream');
    expect(headers.get('X-CSRF-Token')).toBe('csrf-abc');
    expect(JSON.parse(String(init.body))).toEqual({ message: 'Chào trợ lý', session_id: 'sess-test-uuid-1234' });
  });

  it('nối chữ dần vào MỘT tin assistant, isPending trong lúc stream, gắn suggested_actions khi done', async () => {
    const s = controlledSse();
    global.fetch = vi.fn(async () => s.response) as typeof fetch;

    const { result } = renderHook(() => useAiChat(), { wrapper: createWrapper() });
    let done!: Promise<unknown>;
    act(() => {
      done = result.current.sendMessage('Hôm nay có việc gì?');
    });

    s.push(ev('delta', { text: 'Bạn có ' }));
    await waitFor(() => {
      expect(assistants().length).toBe(1);
      expect(textOf(assistants()[0])).toBe('Bạn có ');
    });
    expect(assistants()[0].isPending).toBe(true);
    expect(result.current.isPending).toBe(true);

    s.push(ev('delta', { text: '2 việc gấp.' }));
    await waitFor(() => expect(textOf(assistants()[0])).toBe('Bạn có 2 việc gấp.'));
    expect(assistants().length).toBe(1);

    s.push(ev('done', { session_id: 'sess-test-uuid-1234', suggested_actions: [{ label: 'Mở ASL-1', action_url: '/cases/c1' }] }));
    s.close();
    let ret: unknown;
    await act(async () => {
      ret = await done;
    });

    const msgs = assistants();
    expect(msgs.length).toBe(1);
    expect(textOf(msgs[0])).toBe('Bạn có 2 việc gấp.');
    expect(msgs[0].isPending).toBeFalsy();
    expect(msgs[0].isError).toBeFalsy();
    expect(msgs[0].suggested_actions).toEqual([{ label: 'Mở ASL-1', action_url: '/cases/c1' }]);
    expect(ret).toEqual({ response_text: 'Bạn có 2 việc gấp.', suggested_actions: [{ label: 'Mở ASL-1', action_url: '/cases/c1' }] });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    const roles = (useAiDrawerStore.getState().messages || []).map((m) => m.role);
    expect(roles).toEqual(['user', 'assistant']);
  });

  it('ghép đúng khi sự kiện bị cắt ngang giữa các mảnh byte và dùng CRLF', async () => {
    const raw =
      'event: delta\r\ndata: {"text":"Xin "}\r\n\r\n' +
      ev('delta', { text: 'chào bạn — tiếng Việt có dấu' }) +
      ev('done', { session_id: 's', suggested_actions: [] });
    const bytes = enc.encode(raw);
    const cuts = [3, 17, 30, 31, 55, 80, bytes.length];
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        let prev = 0;
        for (const cut of cuts) {
          c.enqueue(bytes.slice(prev, Math.min(cut, bytes.length)));
          prev = Math.min(cut, bytes.length);
        }
        c.close();
      },
    });
    global.fetch = vi.fn(async () => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })) as typeof fetch;

    const { result } = renderHook(() => useAiChat(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.sendMessage('x');
    });
    expect(assistants().length).toBe(1);
    expect(textOf(assistants()[0])).toBe('Xin chào bạn — tiếng Việt có dấu');
    expect(assistants()[0].isError).toBeFalsy();
  });

  it('sự kiện error giữa chừng: tin assistant chuyển sang lỗi với thông điệp máy chủ', async () => {
    global.fetch = vi.fn(async () =>
      sseResponse([ev('delta', { text: 'Đang tra cứu… ' }), ev('error', { code: 'AI_UNAVAILABLE', message: 'Nhà cung cấp LLM không phản hồi' })]),
    ) as typeof fetch;

    const { result } = renderHook(() => useAiChat(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.sendMessage('Việc gấp?');
    });
    const msgs = assistants();
    expect(msgs.length).toBe(1);
    expect(msgs[0].isError).toBe(true);
    expect(msgs[0].isPending).toBeFalsy();
    expect(textOf(msgs[0])).toContain('Nhà cung cấp LLM không phản hồi');
    await waitFor(() => expect(result.current.isPending).toBe(false));
  });

  it('stream đóng mà không có done/error: báo lỗi kết nối, không treo isPending', async () => {
    global.fetch = vi.fn(async () => sseResponse([ev('delta', { text: 'Dở dang' })])) as typeof fetch;
    const { result } = renderHook(() => useAiChat(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.sendMessage('x');
    });
    expect(assistants().length).toBe(1);
    expect(assistants()[0].isError).toBe(true);
    expect(assistants()[0].isPending).toBeFalsy();
    await waitFor(() => expect(result.current.isPending).toBe(false));
  });

  it('503 AI_UNAVAILABLE dạng JSON (trước khi stream): hiện thông điệp máy chủ', async () => {
    global.fetch = vi.fn(async () =>
      jsonResponse(503, { success: false, error: { code: 'AI_UNAVAILABLE', message: 'Trợ lý AI chưa cấu hình khoá LLM' } }),
    ) as typeof fetch;
    const { result } = renderHook(() => useAiChat(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.sendMessage('x');
    });
    expect(assistants().length).toBe(1);
    expect(assistants()[0].isError).toBe(true);
    expect(textOf(assistants()[0])).toContain('Trợ lý AI chưa cấu hình khoá LLM');
  });

  it('429: hiện "Bạn đã hỏi quá nhiều, thử lại sau ít phút"', async () => {
    global.fetch = vi.fn(async () =>
      jsonResponse(429, { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Quá giới hạn' } }),
    ) as typeof fetch;
    const { result } = renderHook(() => useAiChat(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.sendMessage('Câu hỏi liên tục');
    });
    expect(assistants().length).toBe(1);
    expect(assistants()[0].isError).toBe(true);
    expect(textOf(assistants()[0])).toContain('Bạn đã hỏi quá nhiều, thử lại sau ít phút');
  });

  it('401 hết phiên: gọi /auth/refresh rồi thử lại stream một lần', async () => {
    const urls: string[] = [];
    let streamCalls = 0;
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      urls.push(u);
      if (u.endsWith('/auth/refresh')) return jsonResponse(200, { success: true, data: {} });
      streamCalls += 1;
      if (streamCalls === 1) {
        return jsonResponse(401, { success: false, error: { code: 'UNAUTHENTICATED', message: 'Hết phiên' } });
      }
      return sseResponse([ev('delta', { text: 'OK' }), ev('done', { session_id: 's', suggested_actions: [] })]);
    }) as typeof fetch;

    const { result } = renderHook(() => useAiChat(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.sendMessage('x');
    });
    expect(streamCalls).toBe(2);
    expect(urls.some((u) => u.endsWith('/auth/refresh'))).toBe(true);
    expect(assistants().length).toBe(1);
    expect(textOf(assistants()[0])).toBe('OK');
    expect(assistants()[0].isError).toBeFalsy();
  });

  it('giữ cùng session_id qua nhiều lượt', async () => {
    const sent: string[] = [];
    global.fetch = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body || '{}')).session_id);
      return sseResponse([ev('delta', { text: 'Đã nhận' }), ev('done', { session_id: 'sess-test-uuid-1234', suggested_actions: [] })]);
    }) as typeof fetch;
    const { result } = renderHook(() => useAiChat(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.sendMessage('Câu hỏi 1');
    });
    await act(async () => {
      await result.current.sendMessage('Câu hỏi 2');
    });
    expect(sent).toEqual(['sess-test-uuid-1234', 'sess-test-uuid-1234']);
    expect(assistants().map(textOf)).toEqual(['Đã nhận', 'Đã nhận']);
  });

  it('retryLastMessage: bỏ tin lỗi cuối, gửi lại câu hỏi cuối và stream câu trả lời mới', async () => {
    let n = 0;
    global.fetch = vi.fn(async () => {
      n += 1;
      if (n === 1) return sseResponse([ev('error', { code: 'AI_UNAVAILABLE', message: 'Lỗi tạm thời' })]);
      return sseResponse([ev('delta', { text: 'Lần hai ổn' }), ev('done', { session_id: 's', suggested_actions: [] })]);
    }) as typeof fetch;
    const { result } = renderHook(() => useAiChat(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.sendMessage('Hỏi lại được không?');
    });
    expect(assistants()[0].isError).toBe(true);
    await act(async () => {
      await result.current.retryLastMessage();
    });
    const msgs = useAiDrawerStore.getState().messages || [];
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(textOf(msgs[1])).toBe('Lần hai ổn');
    expect(msgs[1].isError).toBeFalsy();
  });
});
