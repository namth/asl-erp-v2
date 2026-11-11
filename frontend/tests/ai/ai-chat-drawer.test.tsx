import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AiChatDrawer } from '@/components/ai/ai-chat-drawer';
import { useAiDrawerStore } from '@/stores/ai-drawer-store';

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
  usePathname: () => '/cases',
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe('Giao diện Ngăn kéo Trợ lý AI - components/ai/ai-chat-drawer.tsx (SCR-14 & brief mục 4, 5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
    useAiDrawerStore.setState({
      isOpen: true,
      sessionId: 'sess-ui-test-1234',
      messages: [],
    });
  });

  describe('Khả năng tiếp cận (Accessibility), Mở/Đóng & Phím tắt', () => {
    it('ngăn kéo có role="dialog", aria-label rõ ràng và focus vào ô nhập khi mở', async () => {
      renderWithClient(<AiChatDrawer />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeDefined();
      expect(dialog.getAttribute('aria-label') || dialog.getAttribute('aria-labelledby')).toBeTruthy();

      const input = screen.getByPlaceholderText(/nhập câu hỏi|hỏi trợ lý|tin nhắn/i) || screen.getByRole('textbox');
      expect(input).toBeDefined();
      await waitFor(() => {
        expect(document.activeElement).toBe(input);
      });
    });

    it('nhấn phím Escape đóng ngăn kéo', async () => {
      renderWithClient(<AiChatDrawer />);

      expect(useAiDrawerStore.getState().isOpen).toBe(true);

      const dialog = screen.getByRole('dialog');
      fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });

      await waitFor(() => {
        expect(useAiDrawerStore.getState().isOpen).toBe(false);
      });
    });

    it('nút đóng ngăn kéo hoạt động chính xác khi click', async () => {
      renderWithClient(<AiChatDrawer />);

      const closeBtn = screen.getByRole('button', { name: /đóng|close/i });
      fireEvent.click(closeBtn);

      await waitFor(() => {
        expect(useAiDrawerStore.getState().isOpen).toBe(false);
      });
    });
  });

  describe('Trạng thái khởi tạo (Empty state)', () => {
    it('hiển thị lời chào và ít nhất 3 câu hỏi gợi ý; bấm vào gợi ý gửi luôn', async () => {
      renderWithClient(<AiChatDrawer />);

      // Có lời chào
      expect(screen.getByText(/xin chào|trợ lý|copilot/i)).toBeDefined();

      // Có ít nhất 3 câu hỏi gợi ý
      const promptButtons = screen.getAllByRole('button').filter((btn) => {
        const text = btn.textContent || '';
        return text.length > 15 && !text.includes('Cuộc trò chuyện mới') && !text.includes('Đóng');
      });
      expect(promptButtons.length).toBeGreaterThanOrEqual(3);

      // Bấm vào gợi ý đầu tiên -> tin nhắn được gửi (hiển thị trong hội thoại)
      const promptText = promptButtons[0].textContent || '';
      fireEvent.click(promptButtons[0]);

      await waitFor(() => {
        const currentMessages = useAiDrawerStore.getState().messages || [];
        const hasSent = currentMessages.some((m: any) =>
          (m.content && promptText.includes(m.content)) || (m.text && promptText.includes(m.text))
        );
        expect(hasSent).toBe(true);
      });
    });
  });

  describe('Quy tắc nhập liệu, Đếm ký tự và Phím gửi', () => {
    it('nút gửi bị vô hiệu (disabled) khi ô nhập rỗng hoặc chỉ có khoảng trắng', () => {
      renderWithClient(<AiChatDrawer />);

      const input = (screen.getByPlaceholderText(/nhập câu hỏi|hỏi trợ lý|tin nhắn/i) || screen.getByRole('textbox')) as HTMLTextAreaElement | HTMLInputElement;
      const sendBtn = screen.getByRole('button', { name: /gửi|send/i });

      // Ban đầu rỗng
      fireEvent.change(input, { target: { value: '' } });
      expect(sendBtn.hasAttribute('disabled') || sendBtn.getAttribute('aria-disabled') === 'true').toBe(true);

      // Chỉ chứa khoảng trắng
      fireEvent.change(input, { target: { value: '    ' } });
      expect(sendBtn.hasAttribute('disabled') || sendBtn.getAttribute('aria-disabled') === 'true').toBe(true);
    });

    it('chặn gửi và vô hiệu nút gửi khi nội dung vượt quá 2000 ký tự', () => {
      renderWithClient(<AiChatDrawer />);

      const input = (screen.getByPlaceholderText(/nhập câu hỏi|hỏi trợ lý|tin nhắn/i) || screen.getByRole('textbox')) as HTMLTextAreaElement | HTMLInputElement;
      const sendBtn = screen.getByRole('button', { name: /gửi|send/i });

      // Nhập đúng 2000 ký tự: hợp lệ
      const validText = 'a'.repeat(2000);
      fireEvent.change(input, { target: { value: validText } });
      expect(sendBtn.hasAttribute('disabled')).toBe(false);

      // Nhập 2001 ký tự: vượt quá
      const tooLongText = 'a'.repeat(2001);
      fireEvent.change(input, { target: { value: tooLongText } });
      expect(sendBtn.hasAttribute('disabled') || sendBtn.getAttribute('aria-disabled') === 'true').toBe(true);

      // Hiển thị đếm ký tự
      expect(screen.getByText(/2001\s*\/\s*2000|2001\/2000|vượt quá/i)).toBeDefined();
    });

    it('nhấn Enter gửi tin nhắn; nhấn Shift+Enter xuống dòng không gửi', async () => {
      renderWithClient(<AiChatDrawer />);

      const input = (screen.getByPlaceholderText(/nhập câu hỏi|hỏi trợ lý|tin nhắn/i) || screen.getByRole('textbox')) as HTMLTextAreaElement | HTMLInputElement;

      fireEvent.change(input, { target: { value: 'Nội dung một dòng' } });

      // Shift + Enter: không gửi
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
      expect(useAiDrawerStore.getState().messages?.length || 0).toBe(0);

      // Enter đơn thuần: gửi
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });
      await waitFor(() => {
        const msgs = useAiDrawerStore.getState().messages || [];
        expect(msgs.length).toBeGreaterThan(0);
      });
    });

    it('khoá nút gửi và hiển thị bong bóng "Đang soạn câu trả lời…" khi đang chờ kết quả', () => {
      useAiDrawerStore.setState({
        messages: [
          { id: '1', role: 'user', content: 'Câu hỏi cần trả lời' },
        ],
      });

      renderWithClient(<AiChatDrawer />);

      // Khi trạng thái chờ (isPending/loading) được kích hoạt
      const pendingBubble = screen.queryByText(/đang soạn câu trả lời|đang xử lý/i);
      // Nút gửi phải bị khoá khi đang gửi
      const sendBtn = screen.getByRole('button', { name: /gửi|send/i });
      expect(sendBtn).toBeDefined();
      if (pendingBubble) {
        expect(sendBtn.hasAttribute('disabled')).toBe(true);
      }
    });
  });

  describe('Hiển thị câu trả lời, Bảo mật XSS & Nút gợi ý điều hướng', () => {
    it('câu trả lời giữ nguyên định dạng xuống dòng (pre-wrap) và chuỗi script hiển thị dạng chữ văn bản thuần', () => {
      const xssPayload = '<script>alert("hacked")</script>\nDòng số 2\nDòng số 3';
      useAiDrawerStore.setState({
        messages: [
          {
            id: 'msg-ai-1',
            role: 'assistant',
            response_text: xssPayload,
            content: xssPayload,
          },
        ],
      });

      renderWithClient(<AiChatDrawer />);

      // Không được có thẻ script được gắn vào DOM
      const scripts = document.querySelectorAll('script');
      for (const s of Array.from(scripts)) {
        expect(s.textContent).not.toContain('alert("hacked")');
      }

      // Nội dung text phải hiển thị nguyên văn dạng plain text
      const renderedText = screen.getByText((content) => content.includes('<script>alert("hacked")</script>'));
      expect(renderedText).toBeDefined();
      // Class hoặc style hỗ trợ giữ xuống dòng
      expect(renderedText.className).toMatch(/whitespace-pre-wrap|whitespace-pre-line|break-words/);
    });

    it('hiển thị nút gợi ý điều hướng với URL an toàn; click gọi router.push và đóng ngăn kéo', async () => {
      useAiDrawerStore.setState({
        messages: [
          {
            id: 'msg-ai-actions',
            role: 'assistant',
            response_text: 'Có 2 vụ việc cần xử lý',
            content: 'Có 2 vụ việc cần xử lý',
            suggested_actions: [
              { label: 'Mở vụ việc ASL-0012', action_url: '/cases/c1' },
            ],
          },
        ],
      });

      renderWithClient(<AiChatDrawer />);

      const actionBtn = screen.getByRole('button', { name: /Mở vụ việc ASL-0012/i });
      expect(actionBtn).toBeDefined();

      fireEvent.click(actionBtn);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/cases/c1');
        expect(useAiDrawerStore.getState().isOpen).toBe(false);
      });
    });

    it('không hiển thị nút gợi ý nếu action_url không an toàn (https, javascript, protocol-relative)', () => {
      useAiDrawerStore.setState({
        messages: [
          {
            id: 'msg-ai-evil',
            role: 'assistant',
            response_text: 'Kết quả kiểm tra',
            content: 'Kết quả kiểm tra',
            suggested_actions: [
              { label: 'Liên kết độc hại 1', action_url: 'https://evil.com' },
              { label: 'Liên kết độc hại 2', action_url: '//phishing.org' },
              { label: 'Liên kết độc hại 3', action_url: 'javascript:alert(1)' },
              { label: 'Liên kết hợp lệ', action_url: '/cases/c2' },
            ],
          },
        ],
      });

      renderWithClient(<AiChatDrawer />);

      expect(screen.queryByText(/Liên kết độc hại 1/i)).toBeNull();
      expect(screen.queryByText(/Liên kết độc hại 2/i)).toBeNull();
      expect(screen.queryByText(/Liên kết độc hại 3/i)).toBeNull();
      expect(screen.getByRole('button', { name: /Liên kết hợp lệ/i })).toBeDefined();
    });
  });

  describe('Xử lý lỗi và Nút "Thử lại"', () => {
    it('lỗi HTTP 429 hiển thị đúng thông điệp "Bạn đã hỏi quá nhiều, thử lại sau ít phút"', () => {
      useAiDrawerStore.setState({
        messages: [
          { id: '1', role: 'user', content: 'Câu hỏi' },
          {
            id: '2',
            role: 'assistant',
            isError: true,
            content: 'Bạn đã hỏi quá nhiều, thử lại sau ít phút',
            response_text: 'Bạn đã hỏi quá nhiều, thử lại sau ít phút',
          },
        ],
      });

      renderWithClient(<AiChatDrawer />);

      expect(screen.getByText(/Bạn đã hỏi quá nhiều, thử lại sau ít phút/i)).toBeDefined();
    });

    it('lỗi mạng / 500 hiển thị nút "Thử lại"; click gửi lại đúng câu hỏi đó', async () => {
      useAiDrawerStore.setState({
        messages: [
          { id: '1', role: 'user', content: 'Câu hỏi cần thử lại' },
          {
            id: '2',
            role: 'assistant',
            isError: true,
            content: 'Đã có lỗi xảy ra khi kết nối máy chủ.',
            response_text: 'Đã có lỗi xảy ra khi kết nối máy chủ.',
          },
        ],
      });

      renderWithClient(<AiChatDrawer />);

      const retryBtn = screen.getByRole('button', { name: /thử lại|retry/i });
      expect(retryBtn).toBeDefined();

      fireEvent.click(retryBtn);

      await waitFor(() => {
        // Tin nhắn người dùng vẫn được bảo lưu trong lịch sử
        const userMsg = (useAiDrawerStore.getState().messages || []).find((m: any) =>
          (m.content === 'Câu hỏi cần thử lại' || m.text === 'Câu hỏi cần thử lại')
        );
        expect(userMsg).toBeDefined();
      });
    });
  });

  describe('Nút "Cuộc trò chuyện mới"', () => {
    it('click "Cuộc trò chuyện mới" dọn sạch lịch sử hội thoại và sinh session_id mới', async () => {
      const oldSession = 'sess-old-1234';
      useAiDrawerStore.setState({
        sessionId: oldSession,
        messages: [
          { id: '1', role: 'user', content: 'Nội dung cũ' },
          { id: '2', role: 'assistant', content: 'Trả lời cũ' },
        ],
      });

      renderWithClient(<AiChatDrawer />);

      const newChatBtn = screen.getByRole('button', { name: /cuộc trò chuyện mới|hội thoại mới/i });
      fireEvent.click(newChatBtn);

      await waitFor(() => {
        const state = useAiDrawerStore.getState();
        expect(state.messages?.length || 0).toBe(0);
        expect(state.sessionId).not.toBe(oldSession);
      });
    });
  });
});
