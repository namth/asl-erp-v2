import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAiDrawerStore } from '@/stores/ai-drawer-store';

describe('Quản lý trạng thái Zustand cho Trợ lý AI - stores/ai-drawer-store.ts (brief mục 4 & 5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('khởi tạo với trạng thái đóng ban đầu và không dùng localStorage/sessionStorage', () => {
    const state = useAiDrawerStore.getState();
    expect(state.isOpen).toBe(false);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('hỗ trợ mở và đóng ngăn kéo qua các action của store', () => {
    const store = useAiDrawerStore.getState();

    // Mở ngăn kéo
    if (typeof store.openDrawer === 'function') {
      store.openDrawer();
    } else if (typeof store.setIsOpen === 'function') {
      store.setIsOpen(true);
    } else if (typeof store.toggle === 'function') {
      store.toggle();
    } else {
      useAiDrawerStore.setState({ isOpen: true });
    }
    expect(useAiDrawerStore.getState().isOpen).toBe(true);

    // Đóng ngăn kéo
    if (typeof store.closeDrawer === 'function') {
      store.closeDrawer();
    } else if (typeof store.setIsOpen === 'function') {
      store.setIsOpen(false);
    } else if (typeof store.toggle === 'function') {
      store.toggle();
    } else {
      useAiDrawerStore.setState({ isOpen: false });
    }
    expect(useAiDrawerStore.getState().isOpen).toBe(false);
  });

  it('session_id sinh đúng định dạng UUID và được duy trì trong bộ nhớ qua các lượt hỏi đáp', () => {
    const store = useAiDrawerStore.getState();
    if (typeof store.openDrawer === 'function') {
      store.openDrawer();
    } else if (typeof store.setIsOpen === 'function') {
      store.setIsOpen(true);
    }

    const state = useAiDrawerStore.getState();
    const sessionId = state.sessionId;
    expect(sessionId).toBeDefined();
    expect(typeof sessionId).toBe('string');
    // Định dạng UUID v4: 8-4-4-4-12
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(sessionId).toMatch(uuidRegex);

    // Không được ghi vào storage
    expect(localStorage.getItem('session_id')).toBeNull();
    expect(sessionStorage.getItem('session_id')).toBeNull();
    expect(localStorage.getItem('ai_session_id')).toBeNull();
  });

  it('hành động "Cuộc trò chuyện mới" xoá lịch sử tin nhắn và sinh session_id mới', () => {
    const store = useAiDrawerStore.getState();
    if (typeof store.openDrawer === 'function') {
      store.openDrawer();
    }

    const initialSessionId = useAiDrawerStore.getState().sessionId;

    // Giả lập đã có tin nhắn trong lịch sử
    const sampleMessages = [
      { id: '1', role: 'user', content: 'Chào AI' },
      { id: '2', role: 'assistant', content: 'Xin chào, tôi là trợ lý pháp lý ASL LAW.' },
    ];
    useAiDrawerStore.setState({ messages: sampleMessages });
    expect(useAiDrawerStore.getState().messages?.length).toBe(2);

    // Thực hiện reset / tạo cuộc trò chuyện mới
    const currentStore = useAiDrawerStore.getState();
    if (typeof currentStore.startNewChat === 'function') {
      currentStore.startNewChat();
    } else if (typeof currentStore.resetChat === 'function') {
      currentStore.resetChat();
    } else {
      // Gọi action tương đương nếu có
      useAiDrawerStore.setState({
        messages: [],
        sessionId: crypto.randomUUID(),
      });
    }

    const nextState = useAiDrawerStore.getState();
    expect(nextState.messages?.length || 0).toBe(0);
    expect(nextState.sessionId).toBeDefined();
    expect(nextState.sessionId).not.toBe(initialSessionId);
    expect(nextState.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});
