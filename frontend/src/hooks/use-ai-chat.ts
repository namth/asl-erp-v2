import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { useAiDrawerStore } from '@/stores/ai-drawer-store';
import type { AiChatRequest, AiChatResponse, ChatMessage } from '@/types/ai';

interface ErrorWithStatus {
  status?: number;
  code?: string;
  message?: string;
}

function getErrorDetails(err: unknown): { isRateLimit: boolean; message: string } {
  const e = err as ErrorWithStatus | undefined;
  const isRateLimit =
    e?.status === 429 ||
    e?.code === 'RATE_LIMIT_EXCEEDED' ||
    Boolean(e?.message && e.message.includes('429'));

  let message = 'Đã có lỗi xảy ra khi kết nối máy chủ.';
  if (isRateLimit) {
    message = 'Bạn đã hỏi quá nhiều, thử lại sau ít phút';
  } else if (e?.message && e.message !== 'Failed to fetch' && !e.message.includes('Fetch')) {
    message = e.message;
  }

  return { isRateLimit, message };
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'id-' + Math.random().toString(36).substring(2, 9);
}

export interface UseAiChatResult {
  sendMessage: (msg: string) => Promise<AiChatResponse | undefined>;
  mutate: (payload: { message: string; session_id?: string }) => void;
  mutateAsync: (payload: { message: string; session_id?: string }) => Promise<AiChatResponse>;
  isPending: boolean;
  isLoading: boolean;
  error: unknown;
  isError: boolean;
  retryLastMessage: () => Promise<AiChatResponse | undefined>;
}

export function useAiChat(options?: Record<string, unknown>): UseAiChatResult {
  void options;

  const mutation = useMutation<AiChatResponse, Error, AiChatRequest>({
    mutationFn: async (payload: AiChatRequest) => {
      try {
        return await apiFetch<AiChatResponse>('/ai/chat', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
      } catch (err: unknown) {
        const { isRateLimit } = getErrorDetails(err);
        if (isRateLimit) {
          const rateLimitErr = new Error('Bạn đã hỏi quá nhiều, thử lại sau ít phút');
          Object.assign(rateLimitErr, { status: 429 });
          throw rateLimitErr;
        }
        throw err;
      }
    },
  });

  const sendMessage = async (messageText: string): Promise<AiChatResponse | undefined> => {
    const trimmed = (messageText || '').trim();
    if (!trimmed) {
      return;
    }

    const currentStore = useAiDrawerStore.getState();
    let currentSessionId = currentStore.sessionId;
    if (!currentSessionId) {
      currentSessionId = generateId();
      useAiDrawerStore.setState({ sessionId: currentSessionId });
    }

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: trimmed,
      text: trimmed,
      timestamp: Date.now(),
    };

    useAiDrawerStore.setState((prev) => ({
      messages: [...(prev.messages || []), userMsg],
    }));

    try {
      const data = await mutation.mutateAsync({
        message: trimmed,
        session_id: currentSessionId,
      });

      const botMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: data.response_text,
        text: data.response_text,
        response_text: data.response_text,
        suggested_actions: data.suggested_actions,
        timestamp: Date.now(),
      };

      useAiDrawerStore.setState((prev) => ({
        messages: [...(prev.messages || []), botMsg],
      }));

      return data;
    } catch (err: unknown) {
      const { message: errorText } = getErrorDetails(err);

      const errorMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: errorText,
        text: errorText,
        response_text: errorText,
        isError: true,
        timestamp: Date.now(),
      };

      useAiDrawerStore.setState((prev) => ({
        messages: [...(prev.messages || []), errorMsg],
      }));

      return undefined;
    }
  };

  const retryLastMessage = async (): Promise<AiChatResponse | undefined> => {
    const currentMessages = useAiDrawerStore.getState().messages || [];
    const lastUserMsg = [...currentMessages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) {
      return;
    }

    const content = lastUserMsg.content || lastUserMsg.text || '';
    if (!content) {
      return;
    }

    // Xoa tin nhan loi cuoi cung neu co de thu lai
    const lastMsg = currentMessages[currentMessages.length - 1];
    if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isError) {
      useAiDrawerStore.setState({
        messages: currentMessages.slice(0, -1),
      });
    }

    let currentSessionId = useAiDrawerStore.getState().sessionId;
    if (!currentSessionId) {
      currentSessionId = generateId();
      useAiDrawerStore.setState({ sessionId: currentSessionId });
    }

    try {
      const data = await mutation.mutateAsync({
        message: content,
        session_id: currentSessionId,
      });

      const botMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: data.response_text,
        text: data.response_text,
        response_text: data.response_text,
        suggested_actions: data.suggested_actions,
        timestamp: Date.now(),
      };

      useAiDrawerStore.setState((prev) => ({
        messages: [...(prev.messages || []), botMsg],
      }));

      return data;
    } catch (err: unknown) {
      const { message: errorText } = getErrorDetails(err);

      const errorMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: errorText,
        text: errorText,
        response_text: errorText,
        isError: true,
        timestamp: Date.now(),
      };

      useAiDrawerStore.setState((prev) => ({
        messages: [...(prev.messages || []), errorMsg],
      }));

      return undefined;
    }
  };

  return {
    sendMessage,
    retryLastMessage,
    mutate: (payload) => {
      if (payload.session_id) {
        useAiDrawerStore.setState({ sessionId: payload.session_id });
      }
      sendMessage(payload.message).catch(() => {});
    },
    mutateAsync: async (payload) => {
      if (payload.session_id) {
        useAiDrawerStore.setState({ sessionId: payload.session_id });
      }
      const res = await sendMessage(payload.message);
      return res!;
    },
    isPending: mutation.isPending,
    isLoading: mutation.isPending,
    error: mutation.error,
    isError: mutation.isError,
  };
}
