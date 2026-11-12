import { useMutation } from '@tanstack/react-query';
import { apiStream } from '@/lib/api-stream';
import { useAiDrawerStore } from '@/stores/ai-drawer-store';
import type {
  AiChatResponse,
  AiSuggestedAction,
  ChatMessage,
} from '@/types/ai';

interface StreamMutationPayload {
  message: string;
  session_id: string;
  assistantId: string;
}

function formatErrorMessage(err: unknown): string {
  const e = err as { status?: number; code?: string; message?: string } | undefined;
  if (
    e?.status === 429 ||
    e?.code === 'RATE_LIMIT_EXCEEDED' ||
    Boolean(e?.message && e.message.includes('429'))
  ) {
    return 'Bạn đã hỏi quá nhiều, thử lại sau ít phút';
  }
  if (e?.message === 'STREAM_CLOSED_WITHOUT_DONE') {
    return 'Kết nối bị gián đoạn, vui lòng thử lại.';
  }
  if (e?.message && e.message !== 'Failed to fetch' && !e.message.includes('Fetch')) {
    return e.message;
  }
  return 'Kết nối bị gián đoạn, vui lòng thử lại.';
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

  const mutation = useMutation<AiChatResponse, Error, StreamMutationPayload>({
    mutationFn: async ({ message, session_id, assistantId }) => {
      let accumulatedText = '';
      let suggestedActions: AiSuggestedAction[] | undefined;
      let hasDone = false;
      let errorMsg: string | null = null;

      try {
        await apiStream(
          '/ai/chat/stream',
          {
            method: 'POST',
            headers: {
              Accept: 'text/event-stream',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message, session_id }),
          },
          (event, data) => {
            if (event === 'delta') {
              const d = data as { text?: string } | undefined;
              const delta = d?.text ?? '';
              accumulatedText += delta;
              useAiDrawerStore.setState((prev) => ({
                messages: (prev.messages || []).map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: accumulatedText,
                        text: accumulatedText,
                        response_text: accumulatedText,
                      }
                    : m
                ),
              }));
            } else if (event === 'done') {
              hasDone = true;
              const d = data as
                | { session_id?: string; suggested_actions?: AiSuggestedAction[] }
                | undefined;
              if (d?.session_id) {
                useAiDrawerStore.setState({ sessionId: d.session_id });
              }
              suggestedActions = d?.suggested_actions || [];
              useAiDrawerStore.setState((prev) => ({
                messages: (prev.messages || []).map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: accumulatedText,
                        text: accumulatedText,
                        response_text: accumulatedText,
                        suggested_actions: suggestedActions,
                        isPending: false,
                        isError: false,
                      }
                    : m
                ),
              }));
            } else if (event === 'error') {
              const d = data as { code?: string; message?: string } | undefined;
              errorMsg = d?.message || d?.code || 'Đã có lỗi xảy ra';
            }
          }
        );

        if (errorMsg) {
          throw new Error(errorMsg);
        }

        if (!hasDone) {
          throw new Error('STREAM_CLOSED_WITHOUT_DONE');
        }

        return {
          response_text: accumulatedText,
          suggested_actions: suggestedActions,
        };
      } catch (err: unknown) {
        const finalErrorMessage = formatErrorMessage(err);
        useAiDrawerStore.setState((prev) => ({
          messages: (prev.messages || []).map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: finalErrorMessage,
                  text: finalErrorMessage,
                  response_text: finalErrorMessage,
                  isPending: false,
                  isError: true,
                }
              : m
          ),
        }));
        throw err instanceof Error ? err : new Error(finalErrorMessage);
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

    const assistantId = generateId();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      text: '',
      response_text: '',
      isPending: true,
      timestamp: Date.now(),
    };

    useAiDrawerStore.setState((prev) => ({
      messages: [...(prev.messages || []), userMsg, assistantMsg],
    }));

    try {
      return await mutation.mutateAsync({
        message: trimmed,
        session_id: currentSessionId,
        assistantId,
      });
    } catch {
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

    let msgs = currentMessages;
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isError) {
      msgs = msgs.slice(0, -1);
    }

    let currentSessionId = useAiDrawerStore.getState().sessionId;
    if (!currentSessionId) {
      currentSessionId = generateId();
      useAiDrawerStore.setState({ sessionId: currentSessionId });
    }

    const assistantId = generateId();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      text: '',
      response_text: '',
      isPending: true,
      timestamp: Date.now(),
    };

    useAiDrawerStore.setState({
      messages: [...msgs, assistantMsg],
    });

    try {
      return await mutation.mutateAsync({
        message: content,
        session_id: currentSessionId,
        assistantId,
      });
    } catch {
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
