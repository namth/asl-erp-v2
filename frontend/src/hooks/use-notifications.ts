import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { NotificationItem, NotificationsResponse } from '@/types/notifications';

export function useNotifications() {
  const queryClient = useQueryClient();
  const [, setTick] = useState<number>(0);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<NotificationsResponse>({
    queryKey: ['notifications'],
    queryFn: () => apiFetch<NotificationsResponse>('/notifications?page=1&page_size=20'),
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });

  const cachedData = queryClient.getQueryData<NotificationsResponse>(['notifications']);
  const activeData = cachedData ?? data;

  const notifications: NotificationItem[] = activeData?.data ?? [];
  const unreadCount: number = activeData?.meta?.unread_count ?? 0;
  const page: number = activeData?.meta?.page ?? 1;
  const pageSize: number = activeData?.meta?.page_size ?? 20;
  const total: number = activeData?.meta?.total ?? 0;

  const hasNextPage: boolean = page * pageSize < total;
  const hasMore: boolean = hasNextPage;

  const fetchNextPage = async (): Promise<void> => {
    if (!hasNextPage) return;
    const nextPage = page + 1;
    const res = await apiFetch<NotificationsResponse>(
      `/notifications?page=${nextPage}&page_size=${pageSize}`
    );

    queryClient.setQueryData<NotificationsResponse>(['notifications'], (prev) => {
      if (!prev) return res;
      const existingIds = new Set(prev.data.map((item) => item.id));
      const newItems = res.data.filter((item) => !existingIds.has(item.id));
      return {
        data: [...prev.data, ...newItems],
        meta: {
          ...res.meta,
          unread_count: res.meta.unread_count ?? prev.meta.unread_count,
        },
      };
    });
    setTick((t) => t + 1);
  };

  const loadMore = fetchNextPage;

  const markAsRead = async (id: string): Promise<void> => {
    const previous = queryClient.getQueryData<NotificationsResponse>(['notifications']);

    queryClient.setQueryData<NotificationsResponse>(['notifications'], (prev) => {
      if (!prev) return prev;
      let wasUnread = false;
      const updatedData = prev.data.map((item) => {
        if (item.id === id) {
          if (!item.read_at) {
            wasUnread = true;
          }
          return {
            ...item,
            read_at: item.read_at || new Date().toISOString(),
          };
        }
        return item;
      });

      return {
        ...prev,
        data: updatedData,
        meta: {
          ...prev.meta,
          unread_count: wasUnread
            ? Math.max(0, prev.meta.unread_count - 1)
            : prev.meta.unread_count,
        },
      };
    });
    setTick((t) => t + 1);

    try {
      await apiFetch(`/notifications/${id}/read`, { method: 'POST' });
    } catch (err) {
      if (previous) {
        queryClient.setQueryData(['notifications'], previous);
        setTick((t) => t + 1);
      }
      throw err;
    }
  };

  const markAllAsRead = async (): Promise<void> => {
    const previous = queryClient.getQueryData<NotificationsResponse>(['notifications']);

    queryClient.setQueryData<NotificationsResponse>(['notifications'], (prev) => {
      if (!prev) return prev;
      const nowIso = new Date().toISOString();
      const updatedData = prev.data.map((item) => ({
        ...item,
        read_at: item.read_at || nowIso,
      }));

      return {
        ...prev,
        data: updatedData,
        meta: {
          ...prev.meta,
          unread_count: 0,
        },
      };
    });
    setTick((t) => t + 1);

    try {
      await apiFetch('/notifications/read-all', { method: 'POST' });
    } catch (err) {
      if (previous) {
        queryClient.setQueryData(['notifications'], previous);
        setTick((t) => t + 1);
      }
      throw err;
    }
  };

  return {
    notifications,
    unreadCount,
    isLoading,
    isError,
    error,
    refetch,
    hasNextPage,
    hasMore,
    fetchNextPage,
    loadMore,
    markAsRead,
    markAllAsRead,
  };
}
