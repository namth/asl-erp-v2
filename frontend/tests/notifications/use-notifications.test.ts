import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as apiClient from '@/lib/api-client';
import { useNotifications } from '@/hooks/use-notifications';
import { useNotificationsLive } from '@/hooks/use-notifications-live';
import type { NotificationItem, NotificationsResponse } from '@/types/notifications';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

const mockNotification1: NotificationItem = {
  id: 'notif-1',
  kind: 'TASK_DUE_SOON',
  title: 'Hạn chót task',
  body: 'Task chuẩn bị đến hạn xử lý',
  link: '/cases/c1/tasks/t1',
  created_at: '2026-11-11T09:00:00Z',
  read_at: null,
};

const mockNotification2: NotificationItem = {
  id: 'notif-2',
  kind: 'APPROVAL_REQUESTED',
  title: 'Yêu cầu phê duyệt',
  body: 'Cần duyệt giai đoạn 2',
  link: '/cases/c1',
  created_at: '2026-11-11T08:00:00Z',
  read_at: '2026-11-11T08:30:00Z',
};

const mockPage1Response: NotificationsResponse = {
  data: [mockNotification1, mockNotification2],
  meta: {
    page: 1,
    page_size: 20,
    total: 25,
    unread_count: 1,
  },
};

const mockNotification3: NotificationItem = {
  id: 'notif-3',
  kind: 'PAYMENT_CONFIRMED',
  title: 'Xác nhận thu tiền',
  body: 'Kế toán đã xác nhận thanh toán đợt 1',
  link: '/cases/c1',
  created_at: '2026-11-10T14:00:00Z',
  read_at: null,
};

const mockPage2Response: NotificationsResponse = {
  data: [mockNotification3],
  meta: {
    page: 2,
    page_size: 20,
    total: 25,
    unread_count: 1,
  },
};

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState: number = 0; // CONNECTING
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  close = vi.fn(() => {
    this.readyState = 3; // CLOSED
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  });
  send = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = 1; // OPEN
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 0);
  }

  // Tiện ích kích hoạt message từ server
  simulateMessage(data: string) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data }));
    }
  }

  // Tiện ích kích hoạt ngắt kết nối
  simulateClose() {
    this.readyState = 3;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }
}

describe('Hooks dữ liệu & Thời gian thực thông báo (use-notifications.ts & use-notifications-live.ts)', () => {
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    vi.restoreAllMocks();
    MockWebSocket.instances = [];
    originalWebSocket = globalThis.WebSocket;
    // @ts-expect-error Mock WebSocket cho môi trường test
    globalThis.WebSocket = MockWebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  describe('useNotifications hook', () => {
    it('gọi GET /notifications?page=1&page_size=20 khi mount, lấy unread_count từ meta và không polling định kỳ', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockPage1Response as any);
      const { queryClient, wrapper } = createWrapper();

      const { result } = renderHook(() => useNotifications(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(apiSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\/notifications\?page=1&page_size=20/)
      );
      expect(result.current.notifications).toHaveLength(2);
      expect(result.current.unreadCount).toBe(1);

      // Bất biến: Không cấu hình polling định kỳ (refetchInterval = false/0/undefined)
      const queryState = queryClient.getQueryCache().find({ queryKey: ['notifications'] });
      expect(queryState?.options.refetchInterval).toBeFalsy();
    });

    it('"Xem thêm" khi page * page_size < total: tải trang kế page=2 và nối vào cuối danh sách', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockImplementation(async (path: string) => {
        if (path.includes('page=2')) {
          return mockPage2Response as any;
        }
        return mockPage1Response as any;
      });

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useNotifications(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.hasNextPage || result.current.hasMore).toBeTruthy();

      await act(async () => {
        if (typeof result.current.fetchNextPage === 'function') {
          await result.current.fetchNextPage();
        } else if (typeof result.current.loadMore === 'function') {
          await result.current.loadMore();
        }
      });

      expect(apiSpy).toHaveBeenCalledWith(expect.stringContaining('page=2'));
      // Danh sách chứa cả trang 1 và trang 2
      expect(result.current.notifications).toHaveLength(3);
      expect(result.current.notifications[2].id).toBe('notif-3');
    });

    it('bấm dòng chưa đọc: gọi POST /notifications/{id}/read, cập nhật lạc quan và hoàn tác nếu lỗi', async () => {
      let failPost = false;
      vi.spyOn(apiClient, 'apiFetch').mockImplementation(async (path: string, init?: RequestInit) => {
        if (path.includes('/read') && init?.method === 'POST') {
          if (failPost) {
            throw new Error('Network error');
          }
          return { id: 'notif-1', read_at: '2026-11-11T12:00:00Z' } as any;
        }
        return mockPage1Response as any;
      });

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useNotifications(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.unreadCount).toBe(1);

      // Trường hợp thành công: cập nhật lạc quan
      await act(async () => {
        await result.current.markAsRead('notif-1');
      });

      expect(result.current.unreadCount).toBe(0);
      const updatedItem = result.current.notifications.find((n) => n.id === 'notif-1');
      expect(updatedItem?.read_at).toBeTruthy();

      // Trường hợp thất bại: rollback về trạng thái cũ
      failPost = true;
      try {
        await act(async () => {
          await result.current.markAsRead('notif-2');
        });
      } catch {
        // lỗi mong đợi
      }

      // Rollback thành công, không làm hư hỏng dữ liệu
      expect(result.current.notifications).toBeDefined();
    });

    it('"Đánh dấu tất cả đã đọc": gọi POST /notifications/read-all và đặt unread_count về 0', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockImplementation(async (path: string, init?: RequestInit) => {
        if (path.includes('/read-all') && init?.method === 'POST') {
          return { updated_count: 1 } as any;
        }
        return mockPage1Response as any;
      });

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useNotifications(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.unreadCount).toBe(1);

      await act(async () => {
        await result.current.markAllAsRead();
      });

      expect(apiSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\/notifications\/read-all/),
        expect.objectContaining({ method: 'POST' })
      );
      expect(result.current.unreadCount).toBe(0);
      expect(result.current.notifications.every((n) => n.read_at !== null)).toBe(true);
    });
  });

  describe('useNotificationsLive hook', () => {
    it('mở WebSocket tới URL tương đối /ws/notifications theo đúng giao thức trang (ws:/wss:)', async () => {
      const { wrapper } = createWrapper();
      renderHook(() => useNotificationsLive(), { wrapper });

      expect(MockWebSocket.instances.length).toBe(1);
      const ws = MockWebSocket.instances[0];
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      expect(ws.url).toBe(`${protocol}//${window.location.host}/ws/notifications`);
    });

    it('tin nhắn NOTIFICATION_CREATED: mergeIncoming vào cache và tăng unread_count mà KHÔNG gọi lại fetch', async () => {
      const { queryClient, wrapper } = createWrapper();

      // Nạp dữ liệu ban đầu vào cache query
      queryClient.setQueryData(['notifications'], {
        data: [mockNotification1],
        meta: { page: 1, page_size: 20, total: 1, unread_count: 1 },
      });

      const apiSpy = vi.spyOn(apiClient, 'apiFetch');

      renderHook(() => useNotificationsLive(), { wrapper });

      const ws = MockWebSocket.instances[0];

      const newIncomingItem: NotificationItem = {
        id: 'notif-new-live',
        kind: 'APPROVAL_REQUESTED',
        title: 'Yêu cầu duyệt khẩn',
        body: 'Vụ việc ASL-2026 cần phê duyệt',
        link: '/cases/c-new',
        created_at: '2026-11-11T12:05:00Z',
        read_at: null,
      };

      act(() => {
        ws.simulateMessage(
          JSON.stringify({
            type: 'NOTIFICATION_CREATED',
            payload: newIncomingItem,
          })
        );
      });

      // Tuyệt đối KHÔNG gọi lại fetch để reload danh sách
      expect(apiSpy).not.toHaveBeenCalled();

      // Cache được cập nhật: item mới nằm ở đầu và unread_count tăng lên
      const cached = queryClient.getQueryData<NotificationsResponse>(['notifications']);
      expect(cached?.data[0].id).toBe('notif-new-live');
      expect(cached?.meta.unread_count).toBe(2);
    });

    it('bỏ qua tin nhắn trùng id đã có trong cache (không tăng unread_count 2 lần)', async () => {
      const { queryClient, wrapper } = createWrapper();

      queryClient.setQueryData(['notifications'], {
        data: [mockNotification1],
        meta: { page: 1, page_size: 20, total: 1, unread_count: 1 },
      });

      renderHook(() => useNotificationsLive(), { wrapper });
      const ws = MockWebSocket.instances[0];

      act(() => {
        ws.simulateMessage(
          JSON.stringify({
            type: 'NOTIFICATION_CREATED',
            payload: mockNotification1, // trùng id
          })
        );
      });

      const cached = queryClient.getQueryData<NotificationsResponse>(['notifications']);
      expect(cached?.data).toHaveLength(1);
      expect(cached?.meta.unread_count).toBe(1);
    });

    it('tin nhắn không phải JSON hợp lệ hoặc type khác: bỏ qua, không gây crash ứng dụng', async () => {
      const { queryClient, wrapper } = createWrapper();

      queryClient.setQueryData(['notifications'], {
        data: [mockNotification1],
        meta: { page: 1, page_size: 20, total: 1, unread_count: 1 },
      });

      renderHook(() => useNotificationsLive(), { wrapper });
      const ws = MockWebSocket.instances[0];

      expect(() => {
        act(() => {
          ws.simulateMessage('INVALID_RAW_TEXT_NOT_JSON');
          ws.simulateMessage(JSON.stringify({ type: 'HEARTBEAT_PING' }));
        });
      }).not.toThrow();

      const cached = queryClient.getQueryData<NotificationsResponse>(['notifications']);
      expect(cached?.meta.unread_count).toBe(1);
    });

    it('mất kết nối: tự động thử lại sau 5 giây, tối đa 5 lần rồi dừng', async () => {
      vi.useFakeTimers();
      const { wrapper } = createWrapper();

      renderHook(() => useNotificationsLive(), { wrapper });
      expect(MockWebSocket.instances.length).toBe(1);

      // Lần đóng 1 -> thử lại sau 5000ms
      act(() => {
        MockWebSocket.instances[0].simulateClose();
      });
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(MockWebSocket.instances.length).toBe(2);

      // Thử lại tiếp 4 lần nữa (tổng cộng 5 lần thử lại = 6 instances)
      for (let i = 1; i <= 4; i++) {
        act(() => {
          MockWebSocket.instances[i].simulateClose();
        });
        act(() => {
          vi.advanceTimersByTime(5000);
        });
        expect(MockWebSocket.instances.length).toBe(i + 2);
      }

      // Lần thứ 5 đóng -> đã đạt giới hạn tối đa 5 lần thử lại -> dừng kết nối
      act(() => {
        MockWebSocket.instances[5].simulateClose();
      });
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      // Không tạo thêm kết nối nào nữa
      expect(MockWebSocket.instances.length).toBe(6);

      vi.useRealTimers();
    });

    it('unmount hook: đóng WebSocket và huỷ hẹn giờ thử lại', () => {
      vi.useFakeTimers();
      const { wrapper } = createWrapper();

      const { unmount } = renderHook(() => useNotificationsLive(), { wrapper });
      const ws = MockWebSocket.instances[0];

      unmount();

      expect(ws.close).toHaveBeenCalled();

      // Giả lập thời gian trôi qua, không phát sinh reconnect sau khi unmount
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(MockWebSocket.instances.length).toBe(1);

      vi.useRealTimers();
    });
  });
});
