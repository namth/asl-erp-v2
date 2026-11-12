'use client';

import React, { useState, useRef, useEffect, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { QueryClientContext, QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { useNotifications } from '@/hooks/use-notifications';
import { useNotificationsLive } from '@/hooks/use-notifications-live';
import { badgeText, relativeTime, isSafeInternalLink } from '@/lib/notifications';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import type { NotificationItem } from '@/types/notifications';

const fallbackQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

function NotificationBellInner() {
  const router = useRouter();
  const {
    notifications,
    unreadCount,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    fetchNextPage,
    markAsRead,
    markAllAsRead,
  } = useNotifications();

  useNotificationsLive();

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const bellButtonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Đóng bảng và hoàn trả focus về nút chuông khi nhấn phím Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        bellButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Đóng bảng và hoàn trả focus về nút chuông khi bấm ra ngoài
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        bellButtonRef.current &&
        !bellButtonRef.current.contains(target)
      ) {
        setIsOpen(false);
        bellButtonRef.current.focus();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen]);

  const handleItemClick = (item: NotificationItem) => {
    const isUnread = !item.read_at;
    if (isUnread) {
      markAsRead(item.id).catch(() => {
        // Hoàn tác lạc quan được xử lý bên trong hook
      });
    }
    setIsOpen(false);
    if (isSafeInternalLink(item.link)) {
      router.push(item.link);
    }
  };

  return (
    <div className="relative">
      <button
        ref={bellButtonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors relative"
        title="Thông báo"
        aria-label={
          unreadCount > 0
            ? `Thông báo (${badgeText(unreadCount)} chưa đọc)`
            : 'Thông báo'
        }
        aria-expanded={isOpen ? 'true' : 'false'}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#FF7A00] text-white text-[10px] font-bold flex items-center justify-center leading-none shadow-sm">
            {badgeText(unreadCount)}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          role="dialog"
          aria-label="Thông báo"
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden text-slate-800 dark:text-slate-100 flex flex-col max-h-[520px]"
        >
          {/* Header */}
          <div className="p-3.5 px-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                Thông báo
              </span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#0082B4]/10 text-[#0082B4] dark:bg-[#0082B4]/20 dark:text-cyan-300">
                  {badgeText(unreadCount)} mới
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllAsRead()}
                className="text-xs font-semibold text-[#0082B4] dark:text-cyan-400 hover:underline transition-all"
              >
                Đánh dấu tất cả đã đọc
              </button>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {isLoading && (
              <div className="p-4">
                <LoadingSkeleton lines={4} />
              </div>
            )}

            {!isLoading && isError && (
              <div className="p-4">
                <ErrorState
                  message="Không tải được thông báo"
                  onRetry={() => refetch()}
                />
              </div>
            )}

            {!isLoading && !isError && notifications.length === 0 && (
              <div className="p-4">
                <EmptyState
                  title="Bạn chưa có thông báo nào"
                  description="Khi có cập nhật mới về vụ việc hoặc phê duyệt, thông báo sẽ hiển thị tại đây."
                />
              </div>
            )}

            {!isLoading && !isError && notifications.length > 0 && (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {notifications.map((item) => {
                  const isUnread = !item.read_at;
                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleItemClick(item)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleItemClick(item);
                        }
                      }}
                      className={`p-3.5 px-4 cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                        isUnread
                          ? 'bg-blue-50/50 dark:bg-blue-950/25'
                          : 'bg-transparent'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        {isUnread && (
                          <span className="w-2 h-2 mt-1.5 rounded-full bg-[#0082B4] shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`text-xs font-semibold truncate ${
                                isUnread
                                  ? 'text-slate-900 dark:text-white'
                                  : 'text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {item.title}
                            </span>
                            <span className="text-[10px] text-slate-400 shrink-0">
                              {relativeTime(item.created_at)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 line-clamp-2 break-words">
                            {item.body}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer - Phân trang xem thêm */}
          {!isLoading && !isError && hasNextPage && (
            <div className="p-2 border-t border-slate-100 dark:border-slate-800 text-center bg-slate-50/50 dark:bg-slate-900/50">
              <button
                type="button"
                onClick={() => fetchNextPage()}
                className="w-full py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Xem thêm
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function NotificationBell() {
  const hasClient = useContext(QueryClientContext);

  if (!hasClient) {
    return (
      <QueryClientProvider client={fallbackQueryClient}>
        <NotificationBellInner />
      </QueryClientProvider>
    );
  }

  return <NotificationBellInner />;
}
