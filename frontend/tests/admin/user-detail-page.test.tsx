import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import UserDetailPage from '@/app/(dashboard)/admin/users/[id]/page';
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
  useParams: () => ({ id: 'u-user-123' }),
  usePathname: () => '/admin/users/u-user-123',
}));

describe('Màn hình Chi tiết & Chỉnh sửa Người dùng (brief mục 4, 5)', () => {
  const currentAdmin = {
    id: 'u-admin-current',
    email: 'admin@asllaw.vn',
    full_name: 'Quản Trị Viên',
    system_role: 'ADMIN',
  };

  const targetUser = {
    id: 'u-user-123',
    email: 'khanh.pq@asllaw.vn',
    full_name: 'LS. Phạm Quốc Khánh',
    title: 'Luật sư thành viên',
    system_role: 'ATTORNEY',
    is_executive: false,
    is_active: true,
    totp_enabled: true,
    department_id: 'dept-shtt',
    department: { id: 'dept-shtt', code: 'SHTT', name: 'Ban Sở Hữu Trí Tuệ' },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();

    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: currentAdmin,
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(adminHooks, 'useUser').mockReturnValue({
      data: targetUser,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
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

  describe('Tiêu chuẩn 4 trạng thái giao diện', () => {
    it('trạng thái đang tải: hiển thị Skeleton loading', () => {
      vi.spyOn(adminHooks, 'useUser').mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
      } as any);

      render(<UserDetailPage />);

      const skeleton =
        screen.queryByRole('status', { name: /đang tải/i }) ||
        document.querySelector('.animate-pulse');
      expect(skeleton).not.toBeNull();
    });

    it('trạng thái lỗi: hiển thị thông báo lỗi và nút Thử lại', () => {
      const mockRefetch = vi.fn();
      vi.spyOn(adminHooks, 'useUser').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Không tìm thấy người dùng'),
        refetch: mockRefetch,
      } as any);

      render(<UserDetailPage />);

      expect(screen.getByText(/không tìm thấy|có lỗi xảy ra/i)).toBeDefined();
      const retryBtn = screen.getByRole('button', { name: /thử lại/i });
      fireEvent.click(retryBtn);
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('trạng thái thành công: hiển thị đầy đủ thông tin chi tiết người dùng', () => {
      render(<UserDetailPage />);

      expect(screen.getByText(/LS\. Phạm Quốc Khánh/i)).toBeDefined();
      expect(screen.getByDisplayValue(/khanh\.pq@asllaw\.vn/i)).toBeDefined();
    });
  });

  describe('Cảnh báo đăng xuất khi thay đổi vai trò hoặc phòng ban', () => {
    it('khi đổi vai trò hoặc phòng ban, bấm Lưu phải hiện hộp xác nhận nói rõ "người này sẽ bị đăng xuất khỏi mọi phiên"', async () => {
      const mockUpdate = vi.fn().mockResolvedValue({ success: true });
      vi.spyOn(adminHooks, 'useUpdateUser').mockReturnValue({
        mutateAsync: mockUpdate,
        isPending: false,
      } as any);

      render(<UserDetailPage />);

      const roleSelect = screen.getByLabelText(/vai trò|vai trò hệ thống/i);
      const saveBtn = screen.getByRole('button', { name: /lưu thay đổi|cập nhật|lưu/i });

      // Đổi vai trò từ ATTORNEY sang MANAGER
      fireEvent.change(roleSelect, { target: { value: 'MANAGER' } });
      fireEvent.click(saveBtn);

      // Hộp thoại cảnh báo xuất hiện
      await waitFor(() => {
        expect(
          screen.getByText(/người này sẽ bị đăng xuất khỏi mọi phiên/i)
        ).toBeDefined();
      });

      // Chưa xác nhận trong hộp thoại thì chưa gọi mutate
      expect(mockUpdate).not.toHaveBeenCalled();

      // Bấm nút Đồng ý / Xác nhận trong hộp thoại
      const confirmBtn = screen.getByRole('button', { name: /đồng ý|xác nhận lưu|tiếp tục/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            system_role: 'MANAGER',
          })
        );
      });
    });
  });

  describe('Tự bảo vệ tài khoản đang đăng nhập (Self-protection)', () => {
    it('khi đang xem hồ sơ chính mình: không thấy nút khoá, không thấy nút reset 2FA, không được tự hạ vai trò', () => {
      // Người dùng đang xem chính là currentAdmin
      vi.spyOn(adminHooks, 'useUser').mockReturnValue({
        data: {
          ...currentAdmin,
          is_active: true,
          totp_enabled: true,
          department_id: null,
        },
        isLoading: false,
        isError: false,
      } as any);

      render(<UserDetailPage />);

      // Không có nút khoá tài khoản cho chính mình
      expect(screen.queryByRole('button', { name: /khoá tài khoản|khoá người dùng/i })).toBeNull();

      // Không có nút reset 2FA cho chính mình
      expect(screen.queryByRole('button', { name: /reset 2fa|đặt lại 2fa/i })).toBeNull();

      // Ô chọn vai trò bị khoá (disabled) hoặc không cho phép hạ vai trò
      const roleSelect = screen.getByLabelText(/vai trò|vai trò hệ thống/i) as HTMLSelectElement;
      expect(roleSelect.disabled).toBe(true);
    });
  });

  describe('Phân quyền truy cập màn hình chi tiết', () => {
    it('MANAGER: chỉ xem, các trường nhập bị disabled/readonly, không có nút Lưu/Khoá/Reset 2FA', () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: {
          id: 'u-mgr-view',
          full_name: 'LS. Quản Lý',
          system_role: 'MANAGER',
        },
        isLoading: false,
        isError: false,
      } as any);

      render(<UserDetailPage />);

      // Không có nút Lưu
      expect(screen.queryByRole('button', { name: /lưu thay đổi|cập nhật|lưu/i })).toBeNull();

      // Không có nút Khoá hay Reset 2FA
      expect(screen.queryByRole('button', { name: /khoá tài khoản/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /reset 2fa/i })).toBeNull();
    });

    it('ATTORNEY hoặc ACCOUNTANT: hiển thị ErrorState "Không có quyền truy cập"', () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: {
          id: 'u-lawyer',
          full_name: 'LS. Nguyễn Văn C',
          system_role: 'ATTORNEY',
        },
        isLoading: false,
        isError: false,
      } as any);

      render(<UserDetailPage />);

      expect(screen.getByText(/không có quyền truy cập/i)).toBeDefined();
    });
  });
});
