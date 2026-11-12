import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { mergeIncoming } from '@/lib/notifications';
import type { NotificationItem, NotificationsResponse } from '@/types/notifications';

export function useNotificationsLive() {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef<number>(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUnmountedRef = useRef<boolean>(false);

  useEffect(() => {
    isUnmountedRef.current = false;
    retryCountRef.current = 0;

    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
      return;
    }

    const connect = () => {
      if (isUnmountedRef.current) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws/notifications`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onmessage = (ev: MessageEvent) => {
          try {
            const parsed = JSON.parse(ev.data);
            if (parsed && parsed.type === 'NOTIFICATION_CREATED' && parsed.payload) {
              const incoming = parsed.payload as NotificationItem;

              queryClient.setQueryData<NotificationsResponse>(['notifications'], (prev) => {
                if (!prev) {
                  return {
                    data: [incoming],
                    meta: {
                      page: 1,
                      page_size: 20,
                      total: 1,
                      unread_count: incoming.read_at ? 0 : 1,
                    },
                  };
                }

                const alreadyExists = prev.data.some((item) => item.id === incoming.id);
                if (alreadyExists) {
                  return prev;
                }

                const merged = mergeIncoming(prev.data, incoming);
                return {
                  ...prev,
                  data: merged,
                  meta: {
                    ...prev.meta,
                    total: prev.meta.total + 1,
                    unread_count: incoming.read_at
                      ? prev.meta.unread_count
                      : prev.meta.unread_count + 1,
                  },
                };
              });
            }
          } catch {
            // Tin nhắn không phải JSON hợp lệ hoặc type khác -> bỏ qua an toàn
          }
        };

        ws.onclose = () => {
          if (isUnmountedRef.current) return;
          if (retryCountRef.current < 5) {
            retryCountRef.current += 1;
            retryTimeoutRef.current = setTimeout(() => {
              if (!isUnmountedRef.current) {
                connect();
              }
            }, 5000);
          }
        };

        ws.onerror = () => {
          // Xử lý thông qua onclose
        };
      } catch {
        // Lỗi khởi tạo socket
      }
    };

    connect();

    return () => {
      isUnmountedRef.current = true;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // Bỏ qua lỗi đóng kết nối khi huỷ hook
        }
        wsRef.current = null;
      }
    };
  }, [queryClient]);
}
