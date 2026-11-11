import { create } from 'zustand';
import type { ChatMessage } from '@/types/ai';

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface AiDrawerState {
  isOpen: boolean;
  sessionId: string | null;
  messages: ChatMessage[];
  openDrawer: () => void;
  closeDrawer: () => void;
  toggle: () => void;
  setIsOpen: (isOpen: boolean) => void;
  startNewChat: () => void;
  resetChat: () => void;
  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
}

export const useAiDrawerStore = create<AiDrawerState>((set) => ({
  isOpen: false,
  sessionId: null,
  messages: [],
  openDrawer: () =>
    set((state) => ({
      isOpen: true,
      sessionId: state.sessionId || generateUuid(),
    })),
  closeDrawer: () =>
    set({
      isOpen: false,
    }),
  toggle: () =>
    set((state) => {
      const nextOpen = !state.isOpen;
      return {
        isOpen: nextOpen,
        sessionId: nextOpen ? state.sessionId || generateUuid() : state.sessionId,
      };
    }),
  setIsOpen: (isOpen: boolean) =>
    set((state) => ({
      isOpen,
      sessionId: isOpen ? state.sessionId || generateUuid() : state.sessionId,
    })),
  startNewChat: () =>
    set({
      messages: [],
      sessionId: generateUuid(),
    }),
  resetChat: () =>
    set({
      messages: [],
      sessionId: generateUuid(),
    }),
  addMessage: (message: ChatMessage) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),
  setMessages: (messages: ChatMessage[]) =>
    set({
      messages,
    }),
}));
