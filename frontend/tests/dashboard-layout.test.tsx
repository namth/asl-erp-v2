import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import DashboardLayout from '@/app/(dashboard)/layout';
import DashboardPage from '@/app/(dashboard)/page';
import * as authHooks from '@/hooks/use-auth';
import { useSidebarStore } from '@/stores/sidebar-store';

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
  redirect: (url: string) => mockPush(url),
}));

describe('Khung giao diện Dashboard & Phân quyền Sidebar (SCR-02)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
    useSidebarStore.setState({ isCollapsed: false });
  });

  it('chưa đăng nhập: chuyển hướng về /login', async () => {
    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      error: new Error('UNAUTHENTICATED'),
    } as any);

    render(
      <DashboardLayout>
        <div>Nội dung dashboard</div>
      </DashboardLayout>
    );

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });

  it('đã đăng nhập: hiển thị họ tên, vai trò trên Header và Sidebar theo vai trò', async () => {
    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: {
        id: 'u-123',
        full_name: 'LS. Nguyễn Văn Trường',
        system_role: 'MANAGER',
        title: 'Trưởng ban SHTT',
      },
      isLoading: false,
      isError: false,
    } as any);

    render(
      <DashboardLayout>
        <div>Nội dung dashboard</div>
      </DashboardLayout>
    );

    // Header hiển thị tên và vai trò / chức danh
    expect(screen.getByText(/LS\. Nguyễn Văn Trường/i)).toBeDefined();
    expect(screen.getByText(/Trưởng ban SHTT|Quản lý|MANAGER/i)).toBeDefined();

    // Sidebar có các mục của MANAGER
    expect(screen.getByText(/Bàn làm việc|Hồ sơ vụ việc|Cơ hội/i)).toBeDefined();
  });

  it('sidebar có thể thu gọn / mở rộng qua sidebar-store', async () => {
    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: {
        id: 'u-123',
        full_name: 'Quản trị viên',
        system_role: 'ADMIN',
      },
      isLoading: false,
      isError: false,
    } as any);

    render(
      <DashboardLayout>
        <div>Nội dung</div>
      </DashboardLayout>
    );

    expect(useSidebarStore.getState().isCollapsed).toBe(false);

    // Tìm nút toggle sidebar
    const toggleBtn = screen.getByRole('button', { name: /thu gọn|sidebar|toggle/i }) || screen.getByTestId('sidebar-toggle');
    if (toggleBtn) {
      fireEvent.click(toggleBtn);
      expect(useSidebarStore.getState().isCollapsed).toBe(true);
    } else {
      // Gọi trực tiếp action store
      useSidebarStore.getState().toggle();
      expect(useSidebarStore.getState().isCollapsed).toBe(true);
    }
  });

  it('dashboard page hiển thị Bàn làm việc ở trạng thái Trống (Empty state)', () => {
    render(<DashboardPage />);

    expect(screen.getByText(/bàn làm việc/i)).toBeDefined();
    // Chứa thông điệp trạng thái trống
    expect(screen.getByText(/chưa có|trống|bắt đầu/i)).toBeDefined();
  });
});
