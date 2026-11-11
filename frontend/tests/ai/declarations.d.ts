declare module '@/lib/ai-links' {
  export function isSafeInternalUrl(url?: string | null): boolean;
}

declare module '@/types/ai' {
  export interface AiSuggestedAction {
    label: string;
    action_url: string;
  }

  export interface AiChatRequest {
    message: string;
    session_id: string;
  }

  export interface AiChatResponse {
    response_text: string;
    suggested_actions?: AiSuggestedAction[];
  }

  export interface ChatMessage {
    id?: string;
    role: 'user' | 'assistant' | 'system';
    text?: string;
    content?: string;
    response_text?: string;
    suggested_actions?: AiSuggestedAction[];
    isError?: boolean;
    isPending?: boolean;
    timestamp?: string | number;
  }
}

declare module '@/stores/ai-drawer-store' {
  export interface AiDrawerState {
    isOpen: boolean;
    sessionId: string | null;
    messages?: any[];
    openDrawer?: () => void;
    closeDrawer?: () => void;
    toggle?: () => void;
    setIsOpen?: (isOpen: boolean) => void;
    startNewChat?: () => void;
    resetChat?: () => void;
    [key: string]: any;
  }

  export const useAiDrawerStore: {
    getState: () => AiDrawerState;
    setState: (partial: Partial<AiDrawerState> | ((state: AiDrawerState) => Partial<AiDrawerState>)) => void;
    subscribe: (listener: (state: AiDrawerState) => void) => () => void;
    (): AiDrawerState;
    <T>(selector: (state: AiDrawerState) => T): T;
  };
}

declare module '@/hooks/use-ai-chat' {
  export interface UseAiChatResult {
    sendMessage?: (msg: string) => void | Promise<any>;
    mutate?: (payload: { message: string; session_id?: string }) => void;
    mutateAsync?: (payload: { message: string; session_id?: string }) => Promise<any>;
    isPending?: boolean;
    isLoading?: boolean;
    error?: any;
    isError?: boolean;
    retryLastMessage?: () => void;
    [key: string]: any;
  }

  export function useAiChat(options?: any): UseAiChatResult;
}

declare module '@/components/ai/ai-chat-drawer' {
  import type React from 'react';
  export const AiChatDrawer: React.FC<any>;
  export default AiChatDrawer;
}

declare module '@/components/ai/ai-chat-button' {
  import type React from 'react';
  export const AiChatButton: React.FC<any>;
  export default AiChatButton;
}
