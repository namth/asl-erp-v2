'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, Send, RotateCcw, Plus, Sparkles, AlertCircle } from 'lucide-react';
import { useAiDrawerStore } from '@/stores/ai-drawer-store';
import { useAiChat } from '@/hooks/use-ai-chat';
import { isSafeInternalUrl } from '@/lib/ai-links';
import type { AiSuggestedAction } from '@/types/ai';

function AiChatDrawerPanel() {
  const router = useRouter();
  const messages = useAiDrawerStore((state) => state.messages || []);
  const closeDrawer = useAiDrawerStore((state) => state.closeDrawer);
  const startNewChat = useAiDrawerStore((state) => state.startNewChat);

  const { sendMessage, retryLastMessage, isPending } = useAiChat();

  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDrawer?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeDrawer]);

  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isPending]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || trimmed.length > 2000 || isPending) {
      return;
    }
    setInput('');
    try {
      if (sendMessage) {
        await sendMessage(trimmed);
      }
    } catch {
      // Loi duoc xu ly qua hook va luu vao store
    }
  };

  const handleQuickPrompt = async (promptText: string) => {
    if (isPending) return;
    try {
      if (sendMessage) {
        await sendMessage(promptText);
      }
    } catch {
      // Loi duoc xu ly qua hook va luu vao store
    }
  };

  const isTooLong = input.length > 2000;
  const isSendDisabled = !input.trim() || isTooLong || isPending;

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const lastAssistantText =
    lastAssistant?.response_text || lastAssistant?.content || lastAssistant?.text || '';
  const showTypingIndicator = isPending && !lastAssistantText.trim();

  return (
    <div
      role="dialog"
      aria-label="Trợ lý AI"
      aria-modal="true"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          closeDrawer?.();
        }
      }}
      className="fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] md:w-[540px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col outline-none"
    >
      {/* Drawer Header */}
      <div className="h-16 px-4 bg-gradient-to-r from-[#002D54] to-[#004D7A] text-white flex items-center justify-between flex-shrink-0 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-amber-300" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight">ASL Chat</h2>
            <div className="text-[10px] text-cyan-200 font-medium">Hệ thống Điều hành</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => startNewChat?.()}
            className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
            title="Cuộc trò chuyện mới"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Cuộc trò chuyện mới</span>
          </button>

          <button
            type="button"
            onClick={() => closeDrawer?.()}
            aria-label="Đóng"
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Đóng ngăn kéo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 space-y-5 my-auto">
            <div className="w-14 h-14 rounded-2xl bg-cyan-50 dark:bg-cyan-950/40 text-[#0082B4] dark:text-cyan-400 flex items-center justify-center shadow-inner">
              <Sparkles className="w-7 h-7" />
            </div>

            <div className="space-y-1.5 max-w-sm">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                Xin chào!
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Tôi có thể hỗ trợ bạn tra cứu quy định pháp lý, soạn thảo điều khoản hoặc hướng dẫn quy trình công việc.
              </p>
            </div>

            <div className="w-full space-y-2 pt-2 text-left">
              <button
                type="button"
                onClick={() =>
                  handleQuickPrompt('Soạn thảo điều khoản phạt vi phạm và bồi thường thiệt hại hợp đồng')
                }
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-[#0082B4] dark:hover:border-cyan-500 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-cyan-50/50 dark:hover:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 transition-all text-left font-medium block"
              >
                Soạn thảo điều khoản phạt vi phạm và bồi thường thiệt hại hợp đồng
              </button>

              <button
                type="button"
                onClick={() =>
                  handleQuickPrompt('Kiểm tra thời hạn thẩm định đơn nhãn hiệu tại Cục SHTT')
                }
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-[#0082B4] dark:hover:border-cyan-500 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-cyan-50/50 dark:hover:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 transition-all text-left font-medium block"
              >
                Kiểm tra thời hạn thẩm định đơn nhãn hiệu tại Cục SHTT
              </button>

              <button
                type="button"
                onClick={() =>
                  handleQuickPrompt('Tra cứu điều kiện chuyển nhượng phần vốn góp nhà đầu tư nước ngoài')
                }
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-[#0082B4] dark:hover:border-cyan-500 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-cyan-50/50 dark:hover:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 transition-all text-left font-medium block"
              >
                Tra cứu điều kiện chuyển nhượng phần vốn góp nhà đầu tư nước ngoài
              </button>

              <button
                type="button"
                onClick={() =>
                  handleQuickPrompt('Rà soát điều khoản bảo mật và giải quyết tranh chấp trọng tài')
                }
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-[#0082B4] dark:hover:border-cyan-500 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-cyan-50/50 dark:hover:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 transition-all text-left font-medium block"
              >
                Rà soát điều khoản bảo mật và giải quyết tranh chấp trọng tài
              </button>
            </div>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isUser = msg.role === 'user';
            const rawContent = msg.response_text || msg.content || msg.text || '';
            const rawActions = (msg.suggested_actions || []) as AiSuggestedAction[];
            const safeActions = rawActions.filter((action: AiSuggestedAction) =>
              isSafeInternalUrl(action.action_url)
            );

            if (isUser) {
              return (
                <div key={msg.id || index} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-none bg-gradient-to-r from-[#002D54] to-[#004D7A] text-white p-3.5 shadow-sm">
                    <div className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                      {rawContent}
                    </div>
                  </div>
                </div>
              );
            }

            if (msg.isPending && !rawContent.trim() && !msg.isError) {
              return null;
            }

            return (
              <div key={msg.id || index} className="flex flex-col items-start gap-2">
                <div
                  className={`max-w-[90%] rounded-2xl rounded-tl-none p-3.5 shadow-sm border ${
                    msg.isError
                      ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300'
                      : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {msg.isError && (
                    <div className="flex items-center gap-1.5 font-bold text-xs text-red-600 dark:text-red-400 mb-1">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Thông báo lỗi</span>
                    </div>
                  )}

                  <div className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                    {rawContent}
                  </div>

                  {/* Safe Suggested Action Buttons */}
                  {safeActions.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-slate-200/80 dark:border-slate-700/80 flex flex-wrap gap-2">
                      {safeActions.map((action: AiSuggestedAction, actionIdx: number) => (
                        <button
                          key={actionIdx}
                          type="button"
                          onClick={() => {
                            router.push(action.action_url);
                            closeDrawer?.();
                          }}
                          className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-700 hover:bg-cyan-50 dark:hover:bg-slate-600 text-[#0082B4] dark:text-cyan-300 border border-slate-200 dark:border-slate-600 text-xs font-semibold transition-colors shadow-xs"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Retry Button on Error (excluding rate-limit messages) */}
                  {msg.isError && (
                    <div className="mt-2.5 pt-2 border-t border-red-100 dark:border-red-900/40">
                      <button
                        type="button"
                        onClick={() => {
                          retryLastMessage?.();
                        }}
                        className="px-3 py-1 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Thử lại</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Pending Typing Indicator Bubble */}
        {showTypingIndicator && (
          <div className="flex items-start gap-2.5">
            <div className="rounded-2xl rounded-tl-none p-3 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs flex items-center gap-2 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#0082B4] animate-ping" />
              <span>Đang soạn câu trả lời…</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 bg-slate-50 dark:bg-slate-900/90 border-t border-slate-200 dark:border-slate-800 flex-shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="space-y-2"
        >
          <div className="relative rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 focus-within:border-[#0082B4] focus-within:ring-1 focus-within:ring-[#0082B4] transition-all">
            <textarea
              ref={textareaRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!isSendDisabled) {
                    handleSend();
                  }
                }
              }}
              placeholder="Nhập câu hỏi cho Trợ lý AI..."
              className="w-full bg-transparent resize-none border-none outline-none text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400"
            />

            <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-700/50 mt-1">
              <div className="text-[11px]">
                <span className={isTooLong ? 'text-red-500 font-bold' : 'text-slate-400'}>
                  {isTooLong ? `${input.length}/2000 (vượt quá)` : `${input.length}/2000`}
                </span>
              </div>

              <button
                type="submit"
                disabled={isSendDisabled}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  isSendDisabled
                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                    : 'bg-[#002D54] hover:bg-[#001D38] text-white shadow-sm'
                }`}
              >
                <span>Gửi</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AiChatDrawer() {
  const isOpen = useAiDrawerStore((state) => state.isOpen);

  if (!isOpen) {
    return null;
  }

  return <AiChatDrawerPanel />;
}

export default AiChatDrawer;
