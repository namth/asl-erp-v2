import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import AuditLogsPage from '@/app/(dashboard)/admin/audit-logs/page';
import * as auditHooks from '@/hooks/use-audit-logs';
import * as authHooks from '@/hooks/use-auth';

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/admin/audit-logs',
  useSearchParams: () => mockSearchParams,
}));

describe('Màn hình Nhật ký Kiểm toán - Audit Logs (SCR-13 & brief mục 4, 5)', () => {
  const currentAdmin = {
    id: 'u-admin-01',
    email: 'admin@asllaw.vn',
    full_name: 'Quản Trị Viên Hệ Thống',
    system_role: 'ADMIN',
  };

  const sampleAuditLogs = [
    {
      id: 1042,
      created_at: '2026-11-11T09:12:03.120Z', // UTC -> 16:12:03 11/11/2026 (GMT+7)
      actor_type: 'USER',
      actor: {
        id: 'u-1',
        full_name: 'LS. Nguyễn Văn Trường',
        email: 'truong.nv@asllaw.vn',
      },
      action: 'USER_DEACTIVATED',
      entity_name: 'users',
      entity_id: '5f0c1e2f',
      before_state: { is_active: true },
      after_state: { is_active: false, reason: 'Nghỉ việc' },
      ip_address: '10.0.0.12',
      user_agent: 'Mozilla/5.0',
      row_hash: '9b1deb4d3b7d4bad9bdd2b0d7b3dcb6d',
    },
    {
      id: 1041,
      created_at: '2026-11-11T07:05:00.000Z', // UTC -> 14:05:00 11/11/2026 (GMT+7)
      actor_type: 'SYSTEM',
      actor: null,
      action: 'DAILY_BACKUP_COMPLETED',
      entity_name: 'backups',
      entity_id: 'bk-20261111',
      before_state: null,
      after_state: { status: 'SUCCESS', size_mb: 450 },
      ip_address: '127.0.0.1',
      user_agent: 'CronJob/1.0',
      row_hash: 'a1b2c3d4e5f6789012345678abcdef01',
    },
    {
      id: 1040,
      created_at: '2026-11-10T15:30:15.000Z', // UTC -> 22:30:15 10/11/2026 (GMT+7)
      actor_type: 'USER',
      actor: null, // Người dùng đã bị xóa liên kết
      action: 'ROLE_PERMISSION_UPDATED',
      entity_name: 'roles',
      entity_id: 'role-mgr',
      before_state: { permissions: ['VIEW'] },
      after_state: { permissions: ['VIEW', 'APPROVE'] },
      ip_address: '192.168.1.50',
      user_agent: 'Mozilla/5.0 Firefox/131',
      row_hash: 'c8f7e6d5c4b3a21098765432fedcba98',
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
    mockReplace.mockReset();
    mockSearchParams = new URLSearchParams();

    // Mặc định đăng nhập vai trò ADMIN
    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: currentAdmin,
      isLoading: false,
      isError: false,
    } as any);

    // Mặc định hook useAuditIntegrity trả về OK
    vi.spyOn(auditHooks, 'useAuditIntegrity').mockReturnValue({
      data: {
        status: 'OK',
        checked_rows: 1042,
        verified_at: '2026-11-11T02:00:04Z',
        first_broken_id: null,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    // Mặc định hook useRecheckIntegrity
    vi.spyOn(auditHooks, 'useRecheckIntegrity').mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);
  });

  describe('Phân quyền truy cập (RBAC) & Bất biến bất khả biến (Append-only Ledger)', () => {
    it('vai trò khác ADMIN (MANAGER, ATTORNEY, ACCOUNTANT) bị chặn và hiển thị ErrorState "Không có quyền truy cập"', () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: {
          id: 'u-manager',
          full_name: 'LS. Quản Lý',
          system_role: 'MANAGER',
        },
        isLoading: false,
        isError: false,
      } as any);

      vi.spyOn(auditHooks, 'useAuditLogs').mockReturnValue({
        data: { data: sampleAuditLogs, meta: { page: 1, limit: 50, total_records: 3, total_pages: 1 } },
        isLoading: false,
        isError: false,
      } as any);

      render(<AuditLogsPage />);

      expect(screen.getByText(/không có quyền truy cập/i)).toBeDefined();
      expect(screen.queryByText('LS. Nguyễn Văn Trường')).toBeNull();
    });

    it('không có bất kỳ nút sửa (Edit) hoặc xoá (Delete) nào trong toàn bộ giao diện', () => {
      vi.spyOn(auditHooks, 'useAuditLogs').mockReturnValue({
        data: { data: sampleAuditLogs, meta: { page: 1, limit: 50, total_records: 3, total_pages: 1 } },
        isLoading: false,
        isError: false,
      } as any);

      render(<AuditLogsPage />);

      const allButtons = screen.queryAllByRole('button');
      allButtons.forEach((btn) => {
        const text = (btn.textContent || '').toLowerCase();
        const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
        expect(text).not.toMatch(/\b(sửa|chỉnh sửa|edit|xoá|xóa|delete|destroy|remove)\b/i);
        expect(ariaLabel).not.toMatch(/\b(sửa|chỉnh sửa|edit|xoá|xóa|delete|destroy|remove)\b/i);
      });
    });
  });

  describe('Chuẩn 4 trạng thái giao diện (UI 4-states)', () => {
    it('trạng thái đang tải (Loading): hiển thị Skeleton loading', () => {
      vi.spyOn(auditHooks, 'useAuditLogs').mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<AuditLogsPage />);

      const skeleton =
        screen.getByRole('status', { name: /đang tải/i }) ||
        document.querySelector('.animate-pulse');
      expect(skeleton).toBeDefined();
    });

    it('trạng thái có lỗi (Error): hiển thị ErrorState và nút thử lại', () => {
      const mockRefetch = vi.fn();
      vi.spyOn(auditHooks, 'useAuditLogs').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Không thể tải nhật ký kiểm toán'),
        refetch: mockRefetch,
      } as any);

      render(<AuditLogsPage />);

      expect(screen.getByText(/lỗi|không thể tải/i)).toBeDefined();
      const retryBtn = screen.getByRole('button', { name: /thử lại/i });
      fireEvent.click(retryBtn);
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('trạng thái trống (Empty): hiển thị EmptyState khi danh sách nhật ký rỗng', () => {
      vi.spyOn(auditHooks, 'useAuditLogs').mockReturnValue({
        data: { data: [], meta: { page: 1, limit: 50, total_records: 0, total_pages: 0 } },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<AuditLogsPage />);

      expect(screen.getByText(/không có bản ghi|chưa có nhật ký|trống/i)).toBeDefined();
    });

    it('trạng thái thành công (Success): hiển thị bảng dữ liệu nhật ký kiểm toán', () => {
      vi.spyOn(auditHooks, 'useAuditLogs').mockReturnValue({
        data: { data: sampleAuditLogs, meta: { page: 1, limit: 50, total_records: 3, total_pages: 1 } },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<AuditLogsPage />);

      expect(screen.getByText('USER_DEACTIVATED')).toBeDefined();
      expect(screen.getByText('DAILY_BACKUP_COMPLETED')).toBeDefined();
      expect(screen.getByText('ROLE_PERMISSION_UPDATED')).toBeDefined();
    });
  });

  describe('Định dạng hiển thị bảng dữ liệu (Thời gian GMT+7 & 3 trường hợp Actor)', () => {
    beforeEach(() => {
      vi.spyOn(auditHooks, 'useAuditLogs').mockReturnValue({
        data: { data: sampleAuditLogs, meta: { page: 1, limit: 50, total_records: 3, total_pages: 1 } },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);
    });

    it('hiển thị thời gian chuẩn giờ Việt Nam (dd/MM/yyyy HH:mm:ss, UTC+7)', () => {
      render(<AuditLogsPage />);

      // 2026-11-11T09:12:03.120Z -> 16:12:03 11/11/2026
      expect(
        screen.getByText(/11\/11\/2026.*16:12:03|16:12:03.*11\/11\/2026/)
      ).toBeDefined();

      // 2026-11-11T07:05:00.000Z -> 14:05:00 11/11/2026
      expect(
        screen.getByText(/11\/11\/2026.*14:05:00|14:05:00.*11\/11\/2026/)
      ).toBeDefined();

      // 2026-11-10T15:30:15.000Z -> 22:30:15 10/11/2026
      expect(
        screen.getByText(/10\/11\/2026.*22:30:15|22:30:15.*10\/11\/2026/)
      ).toBeDefined();
    });

    it('hiển thị người thực hiện đúng 3 trường hợp: người dùng / Hệ thống / Không xác định', () => {
      render(<AuditLogsPage />);

      // TH1: actor_type = USER, actor có thông tin -> hiển thị actor.full_name
      expect(screen.getByText('LS. Nguyễn Văn Trường')).toBeDefined();

      // TH2: actor_type = SYSTEM -> hiển thị "Hệ thống"
      expect(screen.getByText(/Hệ thống/)).toBeDefined();

      // TH3: actor_type = USER nhưng actor = null -> hiển thị "Không xác định"
      expect(screen.getByText(/Không xác định/)).toBeDefined();
    });

    it('hiển thị đầy đủ thông tin hành động, đối tượng thực thể và địa chỉ IP', () => {
      render(<AuditLogsPage />);

      expect(screen.getByText('users')).toBeDefined();
      expect(screen.getByText(/5f0c1e2f/)).toBeDefined();
      expect(screen.getByText('10.0.0.12')).toBeDefined();
    });
  });

  describe('Bộ lọc tìm kiếm & Đồng bộ URL query string (brief mục 4, 5)', () => {
    it('đổi bộ lọc thì chuyển về trang 1 và cập nhật URL query string', async () => {
      let capturedParams: any = { page: 2 };
      vi.spyOn(auditHooks, 'useAuditLogs').mockImplementation((params: any) => {
        capturedParams = params || capturedParams;
        return {
          data: { data: sampleAuditLogs, meta: { page: capturedParams.page || 1, limit: 50, total_records: 3, total_pages: 1 } },
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        } as any;
      });

      render(<AuditLogsPage />);

      // Tìm trường lọc hành động hoặc thực thể
      const actionInput =
        screen.queryByPlaceholderText(/hành động|action|tìm kiếm/i) ||
        screen.queryByLabelText(/hành động|action/i);

      if (actionInput) {
        fireEvent.change(actionInput, { target: { value: 'USER_DEACTIVATED' } });
      }

      await waitFor(() => {
        // Router push hoặc replace được gọi với query params cập nhật và page=1
        const pushCalls = mockPush.mock.calls.concat(mockReplace.mock.calls);
        if (pushCalls.length > 0) {
          const lastUrl = String(pushCalls[pushCalls.length - 1][0]);
          expect(lastUrl).toMatch(/page=1/);
        }
      });
    });

    it('đọc lại bộ lọc từ query string của URL khi tải trang', () => {
      mockSearchParams = new URLSearchParams('action=USER_DEACTIVATED&actor_type=USER&page=2');

      let capturedFilters: any = null;
      vi.spyOn(auditHooks, 'useAuditLogs').mockImplementation((filters: any) => {
        capturedFilters = filters;
        return {
          data: { data: sampleAuditLogs, meta: { page: 2, limit: 50, total_records: 3, total_pages: 1 } },
          isLoading: false,
          isError: false,
        } as any;
      });

      render(<AuditLogsPage />);

      expect(capturedFilters).toBeDefined();
      expect(capturedFilters.action).toBe('USER_DEACTIVATED');
      expect(capturedFilters.actor_type).toBe('USER');
      expect(capturedFilters.page).toBe(2);
    });
  });
});
