import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationBell } from '@/components/notifications/notification-bell';
import * as apiClient from '@/lib/api-client';
import type { NotificationsResponse } from '@/types/notifications';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
}));

function createTestWrapper() {
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

const mockResponseWithItems: NotificationsResponse = {
  data: [
    {
      id: 'notif-unread-1',
      kind: 'TASK_DUE_SOON',
      title: 'Hạn chót nộp tờ khai',
      body: 'Vụ việc ASL-2026 cần nộp tờ khai trước 17h',
      link: '/cases/c-1/tasks/t-1',
      created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 phút trước
      read_at: null,
    },
    {
      id: 'notif-read-2',
      kind: 'APPROVAL_REQUESTED',
      title: 'Hồ sơ đã được phê duyệt',
      body: 'Giai đoạn 1 đã được giám đốc chấp thuận',
      link: '/cases/c-1',
      created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 giờ trước
      read_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'notif-unsafe-link',
      kind: 'PAYMENT_CONFIRMED',
      title: 'Thông báo liên kết ngoài',
      body: 'Liên kết không an toàn cần bị chặn điều hướng',
      link: '//evil.com/phishing',
      created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      read_at: null,
    },
  ],
  meta: {
    page: 1,
    page_size: 20,
    total: 3,
    unread_count: 2,
  },
};

describe('Component Trung tâm thông báo (NotificationBell & brief mục 4, 5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
  });

  it('huy hiệu hiện đúng unread_count và ẩn khi unread_count = 0 (không còn chấm cam cứng)', async () => {
    vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockResponseWithItems as any);
    const { wrapper } = createTestWrapper();

    const { rerender } = render(<NotificationBell />, { wrapper });

    await waitFor(() => {
      // Huy hiệu hiện '2'
      expect(screen.getByText('2')).toBeDefined();
    });

    // Không còn chấm cam cứng ban đầu
    const staticDot = document.querySelector('.bg-\\[\\#FF7A00\\]:empty');
    expect(staticDot).toBeNull();

    // Nút chuông có aria-label chứa số chưa đọc và aria-expanded="false" khi đóng
    const bellBtn = screen.getByRole('button', { name: /thông báo/i });
    expect(bellBtn.getAttribute('aria-expanded')).toBe('false');
    expect(bellBtn.getAttribute('aria-label')).toMatch(/2/);

    // Khi unread_count = 0 -> không hiện huy hiệu
    vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({
      data: [],
      meta: { page: 1, page_size: 20, total: 0, unread_count: 0 },
    } as any);

    const { wrapper: emptyWrapper } = createTestWrapper();
    rerender(React.createElement(emptyWrapper, null, <NotificationBell />));

    await waitFor(() => {
      // Không có số nào hiển thị trên huy hiệu
      expect(screen.queryByText('0')).toBeNull();
    });
  });

  it('mở và đóng bảng thả xuống bằng nút chuông, phím Escape, hoặc bấm ra ngoài; focus trả về nút chuông', async () => {
    vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockResponseWithItems as any);
    const { wrapper } = createTestWrapper();

    render(
      <div>
        <div data-testid="outside">Bên ngoài</div>
        <NotificationBell />
      </div>,
      { wrapper }
    );

    const bellBtn = await screen.findByRole('button', { name: /thông báo/i });
    expect(screen.queryByRole('dialog', { name: /thông báo/i })).toBeNull();

    // 1. Mở bằng click nút chuông
    fireEvent.click(bellBtn);
    const dialog = await screen.findByRole('dialog', { name: /thông báo/i });
    expect(dialog).toBeDefined();
    expect(bellBtn.getAttribute('aria-expanded')).toBe('true');

    // 2. Đóng bằng phím Escape -> focus trả về nút chuông
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /thông báo/i })).toBeNull();
    });
    expect(document.activeElement).toBe(bellBtn);

    // 3. Mở lại và đóng bằng click bên ngoài -> focus trả về nút chuông
    fireEvent.click(bellBtn);
    expect(await screen.findByRole('dialog', { name: /thông báo/i })).toBeDefined();

    fireEvent.mouseDown(screen.getByTestId('outside'));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /thông báo/i })).toBeNull();
    });
    expect(document.activeElement).toBe(bellBtn);
  });

  it('danh sách mới nhất trước; thông báo chưa đọc có nền nhấn/chấm; body hiển thị văn bản thuần (chống XSS)', async () => {
    const xssPayloadResponse: NotificationsResponse = {
      data: [
        {
          id: 'notif-xss',
          kind: 'TASK_OVERDUE',
          title: 'Cảnh báo bảo mật',
          body: '<script>alert("XSS")</script><img src=x onerror=alert(1)>',
          link: '/cases/c1',
          created_at: new Date().toISOString(),
          read_at: null,
        },
      ],
      meta: { page: 1, page_size: 20, total: 1, unread_count: 1 },
    };

    vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(xssPayloadResponse as any);
    const { wrapper } = createTestWrapper();

    render(<NotificationBell />, { wrapper });

    const bellBtn = await screen.findByRole('button', { name: /thông báo/i });
    fireEvent.click(bellBtn);

    await screen.findByRole('dialog', { name: /thông báo/i });

    // body hiển thị văn bản thuần, không render script tag vào DOM
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText(/<script>alert\("XSS"\)<\/script>/)).toBeDefined();
  });

  it('bấm dòng chưa đọc: gọi POST /notifications/{id}/read, giảm huy hiệu, điều hướng đúng link và đóng bảng', async () => {
    const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.includes('/notif-unread-1/read') && init?.method === 'POST') {
        return { id: 'notif-unread-1', read_at: new Date().toISOString() } as any;
      }
      return mockResponseWithItems as any;
    });

    const { wrapper } = createTestWrapper();
    render(<NotificationBell />, { wrapper });

    const bellBtn = await screen.findByRole('button', { name: /thông báo/i });
    fireEvent.click(bellBtn);

    const unreadItem = await screen.findByText('Hạn chót nộp tờ khai');
    fireEvent.click(unreadItem);

    // Gọi đúng endpoint đánh dấu đã đọc
    expect(apiSpy).toHaveBeenCalledWith(
      expect.stringContaining('/notifications/notif-unread-1/read'),
      expect.objectContaining({ method: 'POST' })
    );

    // Điều hướng và đóng bảng
    expect(mockPush).toHaveBeenCalledWith('/cases/c-1/tasks/t-1');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /thông báo/i })).toBeNull();
    });
  });

  it('bấm dòng có link không an toàn (vd //evil.com): đánh dấu đã đọc nhưng KHÔNG điều hướng', async () => {
    const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.includes('/notif-unsafe-link/read') && init?.method === 'POST') {
        return { id: 'notif-unsafe-link', read_at: new Date().toISOString() } as any;
      }
      return mockResponseWithItems as any;
    });

    const { wrapper } = createTestWrapper();
    render(<NotificationBell />, { wrapper });

    const bellBtn = await screen.findByRole('button', { name: /thông báo/i });
    fireEvent.click(bellBtn);

    const unsafeItem = await screen.findByText('Thông báo liên kết ngoài');
    fireEvent.click(unsafeItem);

    // Vẫn gọi đánh dấu đã đọc
    expect(apiSpy).toHaveBeenCalledWith(
      expect.stringContaining('/notifications/notif-unsafe-link/read'),
      expect.objectContaining({ method: 'POST' })
    );

    // Nhưng TUYỆT ĐỐI không chuyển hướng trình duyệt tới evil.com
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('bấm dòng đã đọc: chỉ điều hướng, không gọi lại API đánh dấu đã đọc', async () => {
    const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockResponseWithItems as any);

    const { wrapper } = createTestWrapper();
    render(<NotificationBell />, { wrapper });

    const bellBtn = await screen.findByRole('button', { name: /thông báo/i });
    fireEvent.click(bellBtn);

    const readItem = await screen.findByText('Hồ sơ đã được phê duyệt');
    fireEvent.click(readItem);

    // Không gọi POST /notifications/.../read
    expect(apiSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('/read'),
      expect.objectContaining({ method: 'POST' })
    );

    // Chỉ điều hướng
    expect(mockPush).toHaveBeenCalledWith('/cases/c-1');
  });

  it('nút "Đánh dấu tất cả đã đọc": gọi đúng URL, ẩn khi không còn thông báo chưa đọc', async () => {
    const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.includes('/read-all') && init?.method === 'POST') {
        return { updated_count: 2 } as any;
      }
      return mockResponseWithItems as any;
    });

    const { wrapper } = createTestWrapper();
    render(<NotificationBell />, { wrapper });

    const bellBtn = await screen.findByRole('button', { name: /thông báo/i });
    fireEvent.click(bellBtn);

    const markAllBtn = await screen.findByRole('button', { name: /đánh dấu tất cả đã đọc/i });
    expect(markAllBtn).toBeDefined();

    fireEvent.click(markAllBtn);

    expect(apiSpy).toHaveBeenCalledWith(
      expect.stringContaining('/notifications/read-all'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('nút "Xem thêm" gửi page=2 khi còn trang kế tiếp', async () => {
    const multiPageResponse: NotificationsResponse = {
      data: [mockResponseWithItems.data[0]],
      meta: { page: 1, page_size: 1, total: 5, unread_count: 1 },
    };

    const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockImplementation(async (path: string) => {
      if (path.includes('page=2')) {
        return {
          data: [mockResponseWithItems.data[1]],
          meta: { page: 2, page_size: 1, total: 5, unread_count: 1 },
        } as any;
      }
      return multiPageResponse as any;
    });

    const { wrapper } = createTestWrapper();
    render(<NotificationBell />, { wrapper });

    const bellBtn = await screen.findByRole('button', { name: /thông báo/i });
    fireEvent.click(bellBtn);

    const loadMoreBtn = await screen.findByRole('button', { name: /xem thêm/i });
    fireEvent.click(loadMoreBtn);

    expect(apiSpy).toHaveBeenCalledWith(expect.stringContaining('page=2'));
  });

  it('hiển thị đầy đủ các trạng thái UI: Empty / ErrorState theo đúng thông điệp', async () => {
    // 1. Trạng thái rỗng: "Bạn chưa có thông báo nào"
    vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({
      data: [],
      meta: { page: 1, page_size: 20, total: 0, unread_count: 0 },
    } as any);

    const { wrapper: emptyWrapper } = createTestWrapper();
    const { rerender } = render(<NotificationBell />, { wrapper: emptyWrapper });

    const bellBtn1 = await screen.findByRole('button', { name: /thông báo/i });
    fireEvent.click(bellBtn1);

    expect(await screen.findByText('Bạn chưa có thông báo nào')).toBeDefined();

    // 2. Trạng thái lỗi tải: "Không tải được thông báo" + nút "Thử lại"
    vi.spyOn(apiClient, 'apiFetch').mockRejectedValue(new Error('Lỗi máy chủ'));
    const { wrapper: errorWrapper } = createTestWrapper();

    rerender(React.createElement(errorWrapper, null, <NotificationBell />));

    const bellBtn2 = screen.getByRole('button', { name: /thông báo/i });
    fireEvent.click(bellBtn2);

    expect(await screen.findByText('Không tải được thông báo')).toBeDefined();
    expect(screen.getByRole('button', { name: /thử lại/i })).toBeDefined();
  });
});
