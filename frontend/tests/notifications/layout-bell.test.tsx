import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardLayout from '@/app/(dashboard)/layout';
import * as authHooks from '@/hooks/use-auth';
import * as apiClient from '@/lib/api-client';

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

function createLayoutWrapper() {
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

describe('Tích hợp NotificationBell vào DashboardLayout (layout.tsx & brief mục 3, 5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: {
        id: 'u-123',
        full_name: 'Nguyễn Văn Trường',
        system_role: 'MANAGER',
        title: 'Trưởng ban SHTT',
      },
      isLoading: false,
      isError: false,
    } as any);
  });

  it('thay thế khối nút thông báo tĩnh có chấm cam cứng bằng component NotificationBell tương tác được', async () => {
    vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({
      data: [
        {
          id: 'n-1',
          kind: 'TASK_DUE_SOON',
          title: 'Hạn chót task',
          body: 'Nội dung thông báo',
          link: '/cases/c1',
          created_at: new Date().toISOString(),
          read_at: null,
        },
      ],
      meta: { page: 1, page_size: 20, total: 1, unread_count: 1 },
    } as any);

    const { wrapper } = createLayoutWrapper();

    render(
      <DashboardLayout>
        <div>Nội dung trang</div>
      </DashboardLayout>,
      { wrapper }
    );

    // Header chứa nút chuông thông báo có aria-expanded và aria-label động
    const bellButton = await screen.findByRole('button', { name: /thông báo/i });
    expect(bellButton).toBeDefined();
    expect(bellButton.getAttribute('aria-expanded')).toBe('false');

    // Không còn chấm cam cứng tĩnh không có số (span.bg-[#FF7A00] rỗng)
    const staticDot = document.querySelector('button[title="Thông báo"] > span.bg-\\[\\#FF7A00\\]:empty');
    expect(staticDot).toBeNull();

    // Hiển thị số lượng chưa đọc thật từ API trên nút chuông (số 1)
    await waitFor(() => {
      expect(screen.getByText('1')).toBeDefined();
    });
  });
});
