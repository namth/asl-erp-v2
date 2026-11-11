import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import UsersPage from '@/app/(dashboard)/admin/users/page';
import * as adminHooks from '@/hooks/use-admin';
import * as authHooks from '@/hooks/use-auth';

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
  usePathname: () => '/admin/users',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Màn hình Quản lý Người dùng & Nhân sự (SCR-19 & brief mục 4, 5)', () => {
  const currentAdmin = {
    id: 'u-admin-me',
    email: 'admin.super@asllaw.vn',
    full_name: 'Quản Trị Viên Hệ Thống',
    system_role: 'ADMIN',
  };

  const sampleUsers = [
    {
      id: 'u-admin-me',
      email: 'admin.super@asllaw.vn',
      full_name: 'Quản Trị Viên Hệ Thống',
      title: 'Giám đốc CNTT',
      system_role: 'ADMIN',
      is_executive: false,
      is_active: true,
      totp_enabled: true,
      department_id: null,
      department: null,
    },
    {
      id: 'u-manager-1',
      email: 'truong.nv@asllaw.vn',
      full_name: 'LS. Nguyễn Văn Trường',
      title: 'Trưởng ban SHTT',
      system_role: 'MANAGER',
      is_executive: false,
      is_active: true,
      totp_enabled: true,
      department_id: 'dept-shtt',
      department: { id: 'dept-shtt', code: 'SHTT', name: 'Ban Sở Hữu Trí Tuệ' },
    },
    {
      id: 'u-attorney-2',
      email: 'hoa.nt@asllaw.vn',
      full_name: 'LS. Nguyễn Thị Hoa',
      title: 'Luật sư thành viên',
      system_role: 'ATTORNEY',
      is_executive: false,
      is_active: false, // Đã khoá
      totp_enabled: false,
      department_id: 'dept-shtt',
      department: { id: 'dept-shtt', code: 'SHTT', name: 'Ban Sở Hữu Trí Tuệ' },
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();

    // Mặc định đăng nhập là ADMIN
    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: currentAdmin,
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(adminHooks, 'useDepartments').mockReturnValue({
      data: [
        { id: 'dept-shtt', code: 'SHTT', name: 'Ban Sở Hữu Trí Tuệ' },
        { id: 'dept-corp', code: 'DOANH_NGHIEP', name: 'Ban Doanh Nghiệp' },
      ],
      isLoading: false,
      isError: false,
    } as any);
  });

  describe('Tiêu chuẩn 4 trạng thái giao diện (UI 4-states)', () => {
    it('trạng thái đang tải (Loading state): hiển thị Skeleton loading', () => {
      vi.spyOn(adminHooks, 'useUsers').mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<UsersPage />);

      const skeleton =
        screen.queryByRole('status', { name: /đang tải/i }) ||
        document.querySelector('.animate-pulse');
      expect(skeleton).not.toBeNull();
    });

    it('trạng thái trống (Empty state): hiển thị thông điệp khi danh sách nhân sự rỗng', () => {
      vi.spyOn(adminHooks, 'useUsers').mockReturnValue({
        data: {
          items: [],
          meta: { page: 1, limit: 20, total_records: 0, total_pages: 0 },
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<UsersPage />);

      expect(screen.getByText(/không tìm thấy nhân sự|chưa có người dùng|danh sách trống/i)).toBeDefined();
    });

    it('trạng thái lỗi (Error state): hiển thị thông báo lỗi và nút Thử lại', () => {
      const mockRefetch = vi.fn();
      vi.spyOn(adminHooks, 'useUsers').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Lỗi máy chủ nội bộ'),
        refetch: mockRefetch,
      } as any);

      render(<UsersPage />);

      expect(screen.getByText(/có lỗi xảy ra|lỗi máy chủ/i)).toBeDefined();
      const retryBtn = screen.getByRole('button', { name: /thử lại/i });
      expect(retryBtn).toBeDefined();

      fireEvent.click(retryBtn);
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('trạng thái thành công: hiển thị danh sách người dùng với đầy đủ thông tin, huy hiệu trạng thái & 2FA', () => {
      vi.spyOn(adminHooks, 'useUsers').mockReturnValue({
        data: {
          items: sampleUsers,
          meta: { page: 1, limit: 20, total_records: 3, total_pages: 1 },
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<UsersPage />);

      // Tên và email hiển thị
      expect(screen.getByText(/Nguyễn Văn Trường/i)).toBeDefined();
      expect(screen.getByText(/truong.nv@asllaw.vn/i)).toBeDefined();
      expect(screen.getByText(/Nguyễn Thị Hoa/i)).toBeDefined();

      // Huy hiệu trạng thái hoạt động (Đang hoạt động / Đã khoá)
      expect(screen.getAllByText(/đang hoạt động/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/đã khoá|tạm khoá/i)).toBeDefined();

      // Thông tin 2FA bật/tắt
      expect(screen.getAllByText(/bật|đã kích hoạt|enabled/i).length).toBeGreaterThan(0);
    });
  });

  describe('Phân quyền truy cập theo vai trò (RBAC)', () => {
    it('vai trò MANAGER: xem được danh sách nhưng KHÔNG thấy nút Thêm mới, Khoá, Reset 2FA', () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: {
          id: 'u-mgr',
          full_name: 'LS. Quản Lý Chi Nhánh',
          system_role: 'MANAGER',
        },
        isLoading: false,
        isError: false,
      } as any);

      vi.spyOn(adminHooks, 'useUsers').mockReturnValue({
        data: {
          items: sampleUsers,
          meta: { page: 1, limit: 20, total_records: 3, total_pages: 1 },
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<UsersPage />);

      // Xem được danh sách
      expect(screen.getByText(/Nguyễn Văn Trường/i)).toBeDefined();

      // KHÔNG có nút thêm người dùng
      expect(screen.queryByRole('button', { name: /thêm người dùng|tạo người dùng|\+ nhân sự/i })).toBeNull();

      // KHÔNG có các nút thao tác ghi (khoá, reset 2FA)
      expect(screen.queryByRole('button', { name: /khoá tài khoản|khoá/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /reset 2fa|đặt lại 2fa/i })).toBeNull();
    });

    it('vai trò ATTORNEY hoặc ACCOUNTANT: không có quyền, hiển thị ErrorState "Không có quyền truy cập"', () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: {
          id: 'u-lawyer',
          full_name: 'LS. Thành Viên',
          system_role: 'ATTORNEY',
        },
        isLoading: false,
        isError: false,
      } as any);

      vi.spyOn(adminHooks, 'useUsers').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
      } as any);

      render(<UsersPage />);

      expect(screen.getByText(/không có quyền truy cập/i)).toBeDefined();
      expect(screen.queryByText(/Nguyễn Văn Trường/i)).toBeNull();
    });
  });

  describe('Bảo vệ tài khoản đang đăng nhập (Self-protection)', () => {
    it('người đang đăng nhập (useMe) KHÔNG thấy nút khoá và nút reset 2FA của chính mình', () => {
      vi.spyOn(adminHooks, 'useUsers').mockReturnValue({
        data: {
          items: sampleUsers,
          meta: { page: 1, limit: 20, total_records: 3, total_pages: 1 },
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<UsersPage />);

      // Tìm hàng của người dùng đang đăng nhập (u-admin-me)
      const adminRow = screen.getByText('admin.super@asllaw.vn').closest('tr');
      expect(adminRow).not.toBeNull();

      if (adminRow) {
        // Trong hàng của chính mình, không được có nút khoá hoặc nút reset 2FA
        expect(adminRow.textContent).not.toMatch(/khoá tài khoản/i);
        expect(adminRow.textContent).not.toMatch(/reset 2fa/i);
      }

      // Hàng của người khác (u-manager-1) vẫn có các nút thao tác
      const managerRow = screen.getByText('truong.nv@asllaw.vn').closest('tr');
      expect(managerRow).not.toBeNull();
      if (managerRow) {
        expect(managerRow.textContent).toMatch(/khoá|reset/i);
      }
    });
  });

  describe('Hành động Khoá tài khoản: bắt buộc lý do ≥ 10 ký tự', () => {
    it('nhập lý do < 10 ký tự hoặc để trống thì bị chặn/báo lỗi; nhập ≥ 10 ký tự thì gọi API deactivate', async () => {
      const mockDeactivate = vi.fn().mockResolvedValue({ success: true });
      vi.spyOn(adminHooks, 'useDeactivateUser').mockReturnValue({
        mutateAsync: mockDeactivate,
        isPending: false,
      } as any);

      vi.spyOn(adminHooks, 'useUsers').mockReturnValue({
        data: {
          items: sampleUsers,
          meta: { page: 1, limit: 20, total_records: 3, total_pages: 1 },
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<UsersPage />);

      // Tìm nút khoá của user u-manager-1
      const managerRow = screen.getByText('truong.nv@asllaw.vn').closest('tr');
      const deactivateBtn = managerRow?.querySelector('button[data-action="deactivate"]') ||
        screen.getAllByRole('button', { name: /khoá tài khoản|khoá/i })[0];

      fireEvent.click(deactivateBtn);

      // Hộp thoại xác nhận yêu cầu nhập lý do xuất hiện
      await waitFor(() => {
        expect(screen.getByText(/xác nhận khoá|lý do khoá/i)).toBeDefined();
      });

      const reasonInput = screen.getByPlaceholderText(/lý do khoá|nhập tối thiểu 10 ký tự/i) ||
        screen.getByRole('textbox', { name: /lý do/i });
      const confirmBtn = screen.getByRole('button', { name: /xác nhận khoá|đồng ý khoá|khoá tài khoản/i });

      // Nhập lý do quá ngắn: 5 ký tự
      fireEvent.change(reasonInput, { target: { value: 'ngắn' } });
      fireEvent.click(confirmBtn);

      // Phải có thông báo lỗi hoặc nút bị disabled, không gọi mutateAsync
      expect(mockDeactivate).not.toHaveBeenCalled();
      expect(screen.getByText(/tối thiểu 10 ký tự|lý do quá ngắn/i)).toBeDefined();

      // Nhập lý do hợp lệ ≥ 10 ký tự
      const validReason = 'Nhân sự đã xin nghỉ việc từ tháng 11/2026';
      fireEvent.change(reasonInput, { target: { value: validReason } });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockDeactivate).toHaveBeenCalledWith(
          expect.objectContaining({ reason: validReason })
        );
      });
    });
  });

  describe('Hành động Reset 2FA: bắt buộc lý do ≥ 10 ký tự', () => {
    it('chặn khi lý do < 10 ký tự; gửi POST /users/{id}/2fa/reset khi đủ lý do', async () => {
      const mockReset2Fa = vi.fn().mockResolvedValue({ success: true });
      vi.spyOn(adminHooks, 'useResetTwoFactor').mockReturnValue({
        mutateAsync: mockReset2Fa,
        isPending: false,
      } as any);

      vi.spyOn(adminHooks, 'useUsers').mockReturnValue({
        data: {
          items: sampleUsers,
          meta: { page: 1, limit: 20, total_records: 3, total_pages: 1 },
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<UsersPage />);

      // Bấm nút Reset 2FA của user u-manager-1
      const managerRow = screen.getByText('truong.nv@asllaw.vn').closest('tr');
      const resetBtn = managerRow?.querySelector('button[data-action="reset-2fa"]') ||
        screen.getAllByRole('button', { name: /reset 2fa|đặt lại 2fa/i })[0];

      fireEvent.click(resetBtn);

      await waitFor(() => {
        expect(screen.getByText(/xác nhận reset 2fa|đặt lại 2fa/i)).toBeDefined();
      });

      const reasonInput = screen.getByPlaceholderText(/lý do reset|nhập tối thiểu 10 ký tự/i) ||
        screen.getByRole('textbox', { name: /lý do/i });
      const confirmBtn = screen.getByRole('button', { name: /xác nhận reset|đồng ý reset/i });

      // Nhập lý do ngắn 4 ký tự
      fireEvent.change(reasonInput, { target: { value: 'mất' } });
      fireEvent.click(confirmBtn);

      expect(mockReset2Fa).not.toHaveBeenCalled();
      expect(screen.getByText(/tối thiểu 10 ký tự|lý do quá ngắn/i)).toBeDefined();

      // Nhập lý do hợp lệ
      const validReason = 'Mất thiết bị điện thoại xác thực Google Authenticator';
      fireEvent.change(reasonInput, { target: { value: validReason } });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockReset2Fa).toHaveBeenCalledWith(
          expect.objectContaining({ reason: validReason })
        );
      });
    });
  });
});
