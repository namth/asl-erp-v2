import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as apiClient from '@/lib/api-client';
import { useFloorplan, useFloorplanLive } from '@/hooks/use-floorplan';
import type { FloorplanData } from '@/types/floorplan';

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

const mockFloorplanData: FloorplanData = {
  department: {
    id: 'dept-ip-01',
    name: 'Phòng Sở Hữu Trí Tuệ',
    leader: {
      id: 'usr-01',
      name: 'LS. Nguyễn Văn An',
      title: 'Trưởng Ban SHTT',
      avatar_url: '/avatars/usr-01.png',
    },
  },
  stats: {
    total_staff: 8,
    working_count: 6,
    resting_count: 2,
    pending_approvals_count: 3,
  },
  approval_queue: [],
  workstations: [],
};

// Mock WebSocket
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
    // Tự động kết nối thành công sau 0ms
    setTimeout(() => {
      this.readyState = 1; // OPEN
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 0);
  }
}

describe('Hooks dữ liệu Văn phòng số (use-floorplan.ts & brief mục 4, 5)', () => {
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

  describe('useFloorplan(departmentId)', () => {
    it('gọi GET /operations/floorplan không kèm query param khi là Trưởng phòng (không truyền departmentId)', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockFloorplanData as any);
      const { wrapper } = createWrapper();

      const { result } = renderHook(() => useFloorplan(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith('/operations/floorplan');
      expect(result.current.data?.department.id).toBe('dept-ip-01');
    });

    it('gọi GET /operations/floorplan?department_id= khi Giám đốc chọn phòng ban cụ thể', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockFloorplanData as any);
      const { wrapper } = createWrapper();

      const { result } = renderHook(() => useFloorplan('dept-litigation-02'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith('/operations/floorplan?department_id=dept-litigation-02');
    });

    it('xử lý lỗi 403 NEED_TO_KNOW_DENIED khi không có quyền xem phòng ban khác', async () => {
      vi.spyOn(apiClient, 'apiFetch').mockRejectedValue(
        new apiClient.ApiError(403, 'NEED_TO_KNOW_DENIED', 'Không thuộc phạm vi quyền hạn của bạn')
      );
      const { wrapper } = createWrapper();

      const { result } = renderHook(() => useFloorplan('dept-confidential-03'), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBeInstanceOf(apiClient.ApiError);
      expect((result.current.error as apiClient.ApiError).code).toBe('NEED_TO_KNOW_DENIED');
    });
  });

  describe('useFloorplanLive({ departmentId, enabled, onEvent }) (WebSocket Real-time)', () => {
    it('khởi tạo WebSocket với URL tương đối và giao thức đúng (ws:/wss: theo trang)', async () => {
      const { wrapper } = createWrapper();

      renderHook(() => useFloorplanLive({ departmentId: 'dept-ip-01', enabled: true }), {
        wrapper,
      });

      await waitFor(() => expect(MockWebSocket.instances.length).toBe(1));

      const wsInstance = MockWebSocket.instances[0];
      expect(wsInstance.url).toMatch(/^wss?:\/\/.*\/ws\/operations\/floorplan\?department_id=dept-ip-01/);
    });

    it('nhận tin nhắn JSON từ WebSocket và cập nhật query cache mà KHÔNG gọi lại apiFetch (TC-FL-07)', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch');
      const { queryClient, wrapper } = createWrapper();

      // Khởi tạo cache trước
      queryClient.setQueryData(['operations', 'floorplan', 'dept-ip-01'], mockFloorplanData);

      renderHook(() => useFloorplanLive({ departmentId: 'dept-ip-01', enabled: true }), {
        wrapper,
      });

      await waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
      const wsInstance = MockWebSocket.instances[0];

      // Gửi event qua WebSocket
      const liveEvent = {
        type: 'EVENT_TASK_STATUS_UPDATED',
        payload: {
          user_id: 'usr-03',
          in_progress_count: 5,
          todo_count: 1,
        },
      };

      act(() => {
        if (wsInstance.onmessage) {
          wsInstance.onmessage(new MessageEvent('message', { data: JSON.stringify(liveEvent) }));
        }
      });

      // Kiểm tra: apiFetch KHÔNG bị gọi lại
      expect(apiSpy).not.toHaveBeenCalled();
    });

    it('khi mất kết nối (onclose/onerror), cung cấp trạng thái isConnected = false và hàm reconnect', async () => {
      const { wrapper } = createWrapper();

      const { result } = renderHook(
        () => useFloorplanLive({ departmentId: 'dept-ip-01', enabled: true }),
        { wrapper }
      );

      await waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
      const wsInstance = MockWebSocket.instances[0];

      // Giả lập mất kết nối
      act(() => {
        if (wsInstance.onclose) {
          wsInstance.onclose(new CloseEvent('close'));
        }
      });

      await waitFor(() => expect(result.current.isConnected).toBe(false));

      // Thử gọi hàm kết nối lại
      act(() => {
        result.current.reconnect();
      });

      await waitFor(() => expect(MockWebSocket.instances.length).toBe(2));
    });

    it('tắt công tắc enabled = false sẽ chủ động đóng WebSocket hiện tại', async () => {
      const { wrapper } = createWrapper();

      const { rerender } = renderHook(
        ({ enabled }) => useFloorplanLive({ departmentId: 'dept-ip-01', enabled }),
        {
          wrapper,
          initialProps: { enabled: true },
        }
      );

      await waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
      const wsInstance = MockWebSocket.instances[0];

      // Tắt công tắc Live Sync
      rerender({ enabled: false });

      expect(wsInstance.close).toHaveBeenCalled();
    });

    it('đổi phòng ban (departmentId) sẽ đóng socket cũ và kết nối socket mới tương ứng', async () => {
      const { wrapper } = createWrapper();

      const { rerender } = renderHook(
        ({ deptId }) => useFloorplanLive({ departmentId: deptId, enabled: true }),
        {
          wrapper,
          initialProps: { deptId: 'dept-ip-01' },
        }
      );

      await waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
      const firstSocket = MockWebSocket.instances[0];

      // Đổi phòng ban
      rerender({ deptId: 'dept-litigation-02' });

      expect(firstSocket.close).toHaveBeenCalled();
      await waitFor(() => expect(MockWebSocket.instances.length).toBe(2));
      expect(MockWebSocket.instances[1].url).toContain('department_id=dept-litigation-02');
    });

    it('khi component unmount sẽ dọn dẹp và đóng WebSocket', async () => {
      const { wrapper } = createWrapper();

      const { unmount } = renderHook(
        () => useFloorplanLive({ departmentId: 'dept-ip-01', enabled: true }),
        { wrapper }
      );

      await waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
      const wsInstance = MockWebSocket.instances[0];

      unmount();

      expect(wsInstance.close).toHaveBeenCalled();
    });
  });
});
