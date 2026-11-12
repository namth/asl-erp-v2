import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardLayout from '@/app/(dashboard)/layout';
import { getMenu, MenuItem } from '@/lib/menu';
import * as authHooks from '@/hooks/use-auth';
import * as apiClient from '@/lib/api-client';
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

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const managerUser = {
  id: 'u-mgr-1',
  email: 'truong.nv@asllaw.vn',
  full_name: 'LS. Nguyễn Văn Trường',
  system_role: 'MANAGER',
  title: 'Trưởng ban SHTT',
};

const adminUser = {
  id: 'u-admin-1',
  email: 'admin@asllaw.vn',
  full_name: 'Quản trị viên Hệ thống',
  system_role: 'ADMIN',
  title: 'Quản trị viên',
};

const accountantUser = {
  id: 'u-acc-1',
  email: 'lan.tt@asllaw.vn',
  full_name: 'Trần Thị Lan',
  system_role: 'ACCOUNTANT',
  title: 'Kế toán viên',
};

async function loadMenuCountsHook() {
  try {
    const hookPath = '../src/hooks/use-menu-counts';
    const mod = await import(/* @vite-ignore */ hookPath);
    return mod.useMenuCounts;
  } catch {
    return null;
  }
}

describe('TASK-042: Huy hiệu menu đếm thật từ API thay số cứng', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
    useSidebarStore.setState({ isCollapsed: false });
  });

  describe('1. Đặc tả & Hợp đồng menu.ts (Tiêu chí 1 & Brief mục 4)', () => {
    const roles = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'ATTORNEY'] as const;

    it('Tiêu chí 1: Không còn bất kỳ badge số cứng nào trong menu.ts cho mọi vai trò', () => {
      roles.forEach((role) => {
        const sections = getMenu(role);
        sections.forEach((section) => {
          section.items.forEach((item: MenuItem) => {
            if (item.badge !== undefined && item.badge !== null) {
              const isNumeric = /^\d+$/.test(item.badge.trim());
              expect(
                isNumeric,
                `Vai trò ${role}, mục "${item.label}" vẫn còn badge số cứng: "${item.badge}"`
              ).toBe(false);
            }
          });
        });
      });
    });

    it('Các mục menu cần đếm số lượng khai báo đúng countKey: approvals, cases, tasks', () => {
      const managerSections = getMenu('MANAGER');
      const allItems = managerSections.flatMap((s) => s.items) as Array<MenuItem & { countKey?: string }>;

      const approvalsItem = allItems.find((i) => i.url === '/approvals' || i.href === '/approvals');
      expect(approvalsItem, 'Mục Duyệt nhanh (/approvals) phải tồn tại trong menu MANAGER').toBeDefined();
      expect(approvalsItem?.countKey, 'Mục /approvals phải có countKey = "approvals"').toBe('approvals');
      expect(approvalsItem?.badgeClass).toContain('bg-red-500');

      const casesItem = allItems.find((i) => i.url === '/cases' || i.href === '/cases');
      expect(casesItem, 'Mục Vụ việc (/cases) phải tồn tại trong menu MANAGER').toBeDefined();
      expect(casesItem?.countKey, 'Mục /cases phải có countKey = "cases"').toBe('cases');
      expect(casesItem?.badgeClass).toContain('bg-blue-100');

      const tasksItem = allItems.find((i) => i.url === '/tasks' || i.href === '/tasks');
      expect(tasksItem, 'Mục Tác vụ (/tasks) phải tồn tại trong menu MANAGER').toBeDefined();
      expect(tasksItem?.countKey, 'Mục /tasks phải có countKey = "tasks"').toBe('tasks');
      expect(tasksItem?.badgeClass).toContain('bg-amber-100');
    });

    it('Mục Vụ việc của Kế toán (ACCOUNTANT) khai báo countKey = "cases"', () => {
      const accountantSections = getMenu('ACCOUNTANT');
      const allItems = accountantSections.flatMap((s) => s.items) as Array<MenuItem & { countKey?: string }>;

      const casesItem = allItems.find((i) => i.url === '/cases' || i.href === '/cases');
      expect(casesItem, 'Mục Vụ việc liên quan (/cases) phải có trong menu ACCOUNTANT').toBeDefined();
      expect(casesItem?.countKey).toBe('cases');
    });

    it('Tiêu chí 5: Huy hiệu chữ tĩnh ("Mới", "TRỰC QUAN", "MÔ PHỎNG") vẫn được giữ nguyên', () => {
      const adminSections = getMenu('ADMIN');
      const adminItems = adminSections.flatMap((s) => s.items);

      const aiItem = adminItems.find((i) => i.url === '/ai-assistant' || i.href === '/ai-assistant');
      expect(aiItem?.badge).toBe('Mới');

      const floorplanItem = adminItems.find((i) => i.url === '/operations/floorplan' || i.href === '/operations/floorplan');
      expect(floorplanItem?.badge).toBe('TRỰC QUAN');

      const archItem = adminItems.find((i) => i.url === '/architecture' || i.href === '/architecture');
      expect(archItem?.badge).toBe('MÔ PHỎNG');
    });
  });

  describe('2. Hook useMenuCounts(role) (Brief mục 4, Tiêu chí 4)', () => {
    it('frontend/src/hooks/use-menu-counts.ts export hàm hook useMenuCounts', async () => {
      const useMenuCounts = await loadMenuCountsHook();
      expect(useMenuCounts, 'Cần tạo và export hook useMenuCounts trong frontend/src/hooks/use-menu-counts.ts').toBeDefined();
      expect(typeof useMenuCounts).toBe('function');
    });

    it('useMenuCounts gọi đúng API tính số đếm cho MANAGER và tôn trọng phân quyền cho ADMIN / ACCOUNTANT', async () => {
      const useMenuCounts = await loadMenuCountsHook();
      if (!useMenuCounts) {
        expect(useMenuCounts, 'Hook useMenuCounts chưa được hiện thực').toBeDefined();
        return;
      }

      const apiFetchSpy = vi.spyOn(apiClient, 'apiFetch').mockImplementation(async (path: string) => {
        if (path.includes('/approvals')) {
          return [{ id: 'appr-1' }, { id: 'appr-2' }, { id: 'appr-3' }] as any;
        }
        return [] as any;
      });

      const apiFetchListSpy = vi.spyOn(apiClient, 'apiFetchList').mockImplementation(async (path: string) => {
        if (path.includes('/cases')) {
          return {
            data: [{ id: 'case-1' }],
            meta: { page: 1, limit: 1, total_records: 120, total_pages: 120 },
          } as any;
        }
        if (path.includes('/me/tasks')) {
          return {
            data: [],
            meta: {
              page: 1,
              limit: 10,
              total_records: 3,
              total_pages: 1,
              summary: { todo: 2, in_progress: 1, waiting_approval: 0, overdue: 0 },
            },
          } as any;
        }
        return { data: [], meta: { page: 1, limit: 10, total_records: 0, total_pages: 0 } } as any;
      });

      // Role MANAGER: gọi đủ 3 API
      const { result: managerResult } = renderHook(() => useMenuCounts('MANAGER'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(managerResult.current).toBeDefined();
        const counts = managerResult.current.counts || managerResult.current;
        expect(counts.approvals).toBe(3);
        expect(counts.cases).toBe(120);
        expect(counts.tasks).toBe(3);
      });

      // Role ADMIN: Tiêu chí 4 - không gọi /cases, /me/tasks
      apiFetchSpy.mockClear();
      apiFetchListSpy.mockClear();

      const { result: adminResult } = renderHook(() => useMenuCounts('ADMIN'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(adminResult.current).toBeDefined();
      });

      const adminCaseCalls = apiFetchListSpy.mock.calls.filter(([p]) => String(p).includes('/cases'));
      const adminTaskCalls = apiFetchListSpy.mock.calls.filter(([p]) => String(p).includes('/me/tasks'));
      expect(adminCaseCalls.length, 'ADMIN không được gọi API /cases').toBe(0);
      expect(adminTaskCalls.length, 'ADMIN không được gọi API /me/tasks').toBe(0);

      // Role ACCOUNTANT: Tiêu chí 4 - không gọi /approvals
      apiFetchSpy.mockClear();
      apiFetchListSpy.mockClear();

      const { result: accountantResult } = renderHook(() => useMenuCounts('ACCOUNTANT'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(accountantResult.current).toBeDefined();
      });

      const accountantApprovalCalls = apiFetchSpy.mock.calls.filter(([p]) => String(p).includes('/approvals'));
      expect(accountantApprovalCalls.length, 'ACCOUNTANT không được gọi API /approvals').toBe(0);
    });
  });

  describe('3. Render Huy hiệu trên Sidebar - DashboardLayout (Tiêu chí 2, 3, 4, 5)', () => {
    it('Tiêu chí 2: Mock API approvals 3, cases 120, me/tasks (2+1) -> Duyệt "3", Vụ việc "99+", Tác vụ "3"', async () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: managerUser,
        isLoading: false,
        isError: false,
      } as any);

      vi.spyOn(apiClient, 'apiFetch').mockImplementation(async (path: string) => {
        if (path.includes('/approvals')) {
          return [{ id: 'appr-1' }, { id: 'appr-2' }, { id: 'appr-3' }] as any;
        }
        return [] as any;
      });

      vi.spyOn(apiClient, 'apiFetchList').mockImplementation(async (path: string) => {
        if (path.includes('/cases')) {
          return {
            data: [{ id: 'case-1' }],
            meta: { page: 1, limit: 1, total_records: 120, total_pages: 120 },
          } as any;
        }
        if (path.includes('/me/tasks')) {
          return {
            data: [],
            meta: {
              page: 1,
              limit: 10,
              total_records: 3,
              total_pages: 1,
              summary: { todo: 2, in_progress: 1, waiting_approval: 0, overdue: 0 },
            },
          } as any;
        }
        return { data: [], meta: { page: 1, limit: 10, total_records: 0, total_pages: 0 } } as any;
      });

      const { container } = render(
        <DashboardLayout>
          <div>Nội dung trang</div>
        </DashboardLayout>,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        const approvalsLink = container.querySelector('a[href="/approvals"]');
        expect(approvalsLink, 'Phải có link Duyệt nhanh /approvals').not.toBeNull();
        expect(within(approvalsLink as HTMLElement).getByText('3')).toBeDefined();

        const casesLink = container.querySelector('a[href="/cases"]');
        expect(casesLink, 'Phải có link Hồ sơ vụ việc /cases').not.toBeNull();
        expect(within(casesLink as HTMLElement).getByText('99+')).toBeDefined();

        const tasksLink = container.querySelector('a[href="/tasks"]');
        expect(tasksLink, 'Phải có link Tác vụ thực hiện /tasks').not.toBeNull();
        expect(within(tasksLink as HTMLElement).getByText('3')).toBeDefined();
      });
    });

    it('Chống lách test: Số đếm cụ thể khác nhau (approvals: 7, cases: 45, tasks: 4+5=9) render đúng số', async () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: managerUser,
        isLoading: false,
        isError: false,
      } as any);

      vi.spyOn(apiClient, 'apiFetch').mockImplementation(async (path: string) => {
        if (path.includes('/approvals')) {
          return Array.from({ length: 7 }, (_, i) => ({ id: `appr-${i + 1}` })) as any;
        }
        return [] as any;
      });

      vi.spyOn(apiClient, 'apiFetchList').mockImplementation(async (path: string) => {
        if (path.includes('/cases')) {
          return {
            data: [{ id: 'case-1' }],
            meta: { page: 1, limit: 1, total_records: 45, total_pages: 45 },
          } as any;
        }
        if (path.includes('/me/tasks')) {
          return {
            data: [],
            meta: {
              page: 1,
              limit: 10,
              total_records: 9,
              total_pages: 1,
              summary: { todo: 4, in_progress: 5, waiting_approval: 0, overdue: 0 },
            },
          } as any;
        }
        return { data: [], meta: { page: 1, limit: 10, total_records: 0, total_pages: 0 } } as any;
      });

      const { container } = render(
        <DashboardLayout>
          <div>Nội dung trang</div>
        </DashboardLayout>,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        const approvalsLink = container.querySelector('a[href="/approvals"]');
        expect(within(approvalsLink as HTMLElement).getByText('7')).toBeDefined();

        const casesLink = container.querySelector('a[href="/cases"]');
        expect(within(casesLink as HTMLElement).getByText('45')).toBeDefined();

        const tasksLink = container.querySelector('a[href="/tasks"]');
        expect(within(tasksLink as HTMLElement).getByText('9')).toBeDefined();
      });
    });

    it('Tiêu chí 3: Số đếm bằng 0 thì KHÔNG hiển thị huy hiệu số cho các mục đó', async () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: managerUser,
        isLoading: false,
        isError: false,
      } as any);

      vi.spyOn(apiClient, 'apiFetch').mockImplementation(async (path: string) => {
        if (path.includes('/approvals')) {
          return [] as any; // 0 phần tử
        }
        return [] as any;
      });

      vi.spyOn(apiClient, 'apiFetchList').mockImplementation(async (path: string) => {
        if (path.includes('/cases')) {
          return {
            data: [],
            meta: { page: 1, limit: 1, total_records: 0, total_pages: 0 },
          } as any;
        }
        if (path.includes('/me/tasks')) {
          return {
            data: [],
            meta: {
              page: 1,
              limit: 10,
              total_records: 0,
              total_pages: 0,
              summary: { todo: 0, in_progress: 0, waiting_approval: 0, overdue: 0 },
            },
          } as any;
        }
        return { data: [], meta: { page: 1, limit: 10, total_records: 0, total_pages: 0 } } as any;
      });

      const { container } = render(
        <DashboardLayout>
          <div>Nội dung trang</div>
        </DashboardLayout>,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        const approvalsLink = container.querySelector('a[href="/approvals"]');
        expect(approvalsLink).not.toBeNull();
        expect(within(approvalsLink as HTMLElement).queryByText('0')).toBeNull();

        const casesLink = container.querySelector('a[href="/cases"]');
        expect(casesLink).not.toBeNull();
        expect(within(casesLink as HTMLElement).queryByText('0')).toBeNull();

        const tasksLink = container.querySelector('a[href="/tasks"]');
        expect(tasksLink).not.toBeNull();
        expect(within(tasksLink as HTMLElement).queryByText('0')).toBeNull();
      });
    });

    it('Tiêu chí 3: Khi API lỗi 500 ở một mục thì ẩn huy hiệu mục đó, không làm hỏng sidebar, các mục khác hiện bình thường', async () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: managerUser,
        isLoading: false,
        isError: false,
      } as any);

      // Approvals bị lỗi 500
      vi.spyOn(apiClient, 'apiFetch').mockImplementation(async (path: string) => {
        if (path.includes('/approvals')) {
          throw new apiClient.ApiError(500, 'INTERNAL_ERROR', 'Lỗi máy chủ nội bộ');
        }
        return [] as any;
      });

      // Cases và Tasks vẫn thành công
      vi.spyOn(apiClient, 'apiFetchList').mockImplementation(async (path: string) => {
        if (path.includes('/cases')) {
          return {
            data: [{ id: 'c-1' }],
            meta: { page: 1, limit: 1, total_records: 25, total_pages: 25 },
          } as any;
        }
        if (path.includes('/me/tasks')) {
          return {
            data: [],
            meta: {
              page: 1,
              limit: 10,
              total_records: 4,
              total_pages: 1,
              summary: { todo: 3, in_progress: 1, waiting_approval: 0, overdue: 0 },
            },
          } as any;
        }
        return { data: [], meta: { page: 1, limit: 10, total_records: 0, total_pages: 0 } } as any;
      });

      const { container } = render(
        <DashboardLayout>
          <div>Nội dung trang</div>
        </DashboardLayout>,
        { wrapper: createWrapper() }
      );

      // Sidebar vẫn render bình thường, không crash
      expect(screen.getByText('Không gian cá nhân')).toBeDefined();

      await waitFor(() => {
        // Approvals không có huy hiệu số
        const approvalsLink = container.querySelector('a[href="/approvals"]');
        expect(approvalsLink).not.toBeNull();
        const spansInApprovals = approvalsLink?.querySelectorAll('span');
        // Không chứa span badge số
        const hasNumberBadge = Array.from(spansInApprovals || []).some((s) => /^\d+$/.test(s.textContent?.trim() || ''));
        expect(hasNumberBadge, 'Approvals lỗi 500 không được hiện badge số').toBe(false);

        // Cases và Tasks vẫn hiện đúng số
        const casesLink = container.querySelector('a[href="/cases"]');
        expect(within(casesLink as HTMLElement).getByText('25')).toBeDefined();

        const tasksLink = container.querySelector('a[href="/tasks"]');
        expect(within(tasksLink as HTMLElement).getByText('4')).toBeDefined();
      });
    });

    it('Tiêu chí 4: ADMIN không gọi /cases, /me/tasks; ACCOUNTANT không gọi /approvals (kiểm qua spy)', async () => {
      // 1. Phân quyền ADMIN
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: adminUser,
        isLoading: false,
        isError: false,
      } as any);

      const fetchListSpy = vi.spyOn(apiClient, 'apiFetchList').mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 10, total_records: 0, total_pages: 0 },
      } as any);

      const fetchSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue([] as any);

      render(
        <DashboardLayout>
          <div>Nội dung Admin</div>
        </DashboardLayout>,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText('Quản trị viên Hệ thống')).toBeDefined();
      });

      const adminCalledCases = fetchListSpy.mock.calls.some(([p]) => String(p).includes('/cases'));
      const adminCalledTasks = fetchListSpy.mock.calls.some(([p]) => String(p).includes('/me/tasks'));
      expect(adminCalledCases, 'ADMIN không được gọi API /cases').toBe(false);
      expect(adminCalledTasks, 'ADMIN không được gọi API /me/tasks').toBe(false);

      // 2. Phân quyền ACCOUNTANT
      fetchSpy.mockClear();
      fetchListSpy.mockClear();

      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: accountantUser,
        isLoading: false,
        isError: false,
      } as any);

      render(
        <DashboardLayout>
          <div>Nội dung Kế toán</div>
        </DashboardLayout>,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText(/Trần Thị Lan/i)).toBeDefined();
      });

      const accountantCalledApprovals = fetchSpy.mock.calls.some(([p]) => String(p).includes('/approvals'));
      expect(accountantCalledApprovals, 'ACCOUNTANT không được gọi API /approvals').toBe(false);
    });

    it('Tiêu chí 5: Huy hiệu chữ "Mới" trên mục Trợ lý AI vẫn hiển thị trên giao diện sidebar', async () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: managerUser,
        isLoading: false,
        isError: false,
      } as any);

      const { container } = render(
        <DashboardLayout>
          <div>Nội dung</div>
        </DashboardLayout>,
        { wrapper: createWrapper() }
      );

      const aiLink = container.querySelector('a[href="/ai-assistant"]');
      expect(aiLink, 'Link Trợ lý AI phải tồn tại').not.toBeNull();
      expect(within(aiLink as HTMLElement).getByText('Mới')).toBeDefined();
    });
  });
});
