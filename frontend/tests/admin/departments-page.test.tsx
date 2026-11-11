import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import DepartmentsPage from '@/app/(dashboard)/admin/departments/page';
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
  usePathname: () => '/admin/departments',
}));

describe('Màn hình Quản trị Phòng Ban (SCR-19 & brief mục 4, 5)', () => {
  const currentAdmin = {
    id: 'u-admin-1',
    full_name: 'Quản Trị Viên',
    system_role: 'ADMIN',
  };

  const sampleDepartments = [
    {
      id: 'dept-1',
      code: 'SHTT',
      name: 'Ban Sở Hữu Trí Tuệ',
      leaders: [
        { id: 'u-mgr-1', full_name: 'LS. Nguyễn Văn Trường', system_role: 'MANAGER', is_active: true },
      ],
    },
    {
      id: 'dept-2',
      code: 'TRANH_CHAP',
      name: 'Ban Tranh Chấp & Tố Tụng',
      leaders: [],
    },
  ];

  const candidateUsers = [
    { id: 'u-mgr-1', full_name: 'LS. Nguyễn Văn Trường', system_role: 'MANAGER', is_active: true },
    { id: 'u-mgr-2', full_name: 'LS. Trần Thị Mai', system_role: 'MANAGER', is_active: true },
    { id: 'u-mgr-inactive', full_name: 'LS. Lê Văn Khoá', system_role: 'MANAGER', is_active: false }, // Bị khoá
    { id: 'u-attorney-3', full_name: 'LS. Phạm Quốc Khánh', system_role: 'ATTORNEY', is_active: true }, // Không phải Quản lý
    { id: 'u-accountant-4', full_name: 'KTV. Trần Thị Lan', system_role: 'ACCOUNTANT', is_active: true }, // Không phải Quản lý
    { id: 'u-admin-5', full_name: 'QTV. Hệ Thống', system_role: 'ADMIN', is_active: true }, // ADMIN
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();

    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: currentAdmin,
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(adminHooks, 'useDepartments').mockReturnValue({
      data: sampleDepartments,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(adminHooks, 'useUsers').mockReturnValue({
      data: {
        items: candidateUsers,
        meta: { page: 1, limit: 100, total_records: candidateUsers.length, total_pages: 1 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);
  });

  describe('Tiêu chuẩn 4 trạng thái giao diện (UI 4-states)', () => {
    it('trạng thái đang tải: hiển thị Skeleton loading', () => {
      vi.spyOn(adminHooks, 'useDepartments').mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
      } as any);

      render(<DepartmentsPage />);

      const skeleton =
        screen.queryByRole('status', { name: /đang tải/i }) ||
        document.querySelector('.animate-pulse');
      expect(skeleton).not.toBeNull();
    });

    it('trạng thái trống: hiển thị thông báo chưa có phòng ban', () => {
      vi.spyOn(adminHooks, 'useDepartments').mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      } as any);

      render(<DepartmentsPage />);

      expect(screen.getByText(/chưa có phòng ban|danh sách trống/i)).toBeDefined();
    });

    it('trạng thái lỗi: hiển thị thông báo lỗi và nút Thử lại', () => {
      const mockRefetch = vi.fn();
      vi.spyOn(adminHooks, 'useDepartments').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Lỗi tải phòng ban'),
        refetch: mockRefetch,
      } as any);

      render(<DepartmentsPage />);

      expect(screen.getByText(/có lỗi xảy ra|lỗi tải/i)).toBeDefined();
      const retryBtn = screen.getByRole('button', { name: /thử lại/i });
      fireEvent.click(retryBtn);
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('trạng thái thành công: hiển thị danh sách phòng ban kèm mã, tên và Trưởng phòng', () => {
      render(<DepartmentsPage />);

      expect(screen.getByText(/Ban Sở Hữu Trí Tuệ/i)).toBeDefined();
      expect(screen.getByText('SHTT')).toBeDefined();
      expect(screen.getByText(/LS\. Nguyễn Văn Trường/i)).toBeDefined();
      expect(screen.getByText(/Ban Tranh Chấp & Tố Tụng/i)).toBeDefined();
    });
  });

  describe('Tạo mới phòng ban', () => {
    it('nhập code, name và bấm Lưu gọi useCreateDepartment', async () => {
      const mockCreate = vi.fn().mockResolvedValue({ success: true });
      vi.spyOn(adminHooks, 'useCreateDepartment').mockReturnValue({
        mutateAsync: mockCreate,
        isPending: false,
      } as any);

      render(<DepartmentsPage />);

      const openCreateBtn = screen.getByRole('button', { name: /thêm phòng ban|tạo phòng ban|\+ phòng ban/i });
      fireEvent.click(openCreateBtn);

      const codeInput = screen.getByLabelText(/mã phòng ban|mã/i);
      const nameInput = screen.getByLabelText(/tên phòng ban|tên/i);
      const submitBtn = screen.getByRole('button', { name: /lưu|tạo mới|xác nhận/i });

      fireEvent.change(codeInput, { target: { value: 'TAI_CHINH' } });
      fireEvent.change(nameInput, { target: { value: 'Ban Tài Chính & Thuế' } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            code: 'TAI_CHINH',
            name: 'Ban Tài Chính & Thuế',
          })
        );
      });
    });
  });

  describe('Chọn / Phân công Trưởng phòng (brief mục 4, 5)', () => {
    it('chỉ liệt kê người dùng vai trò Quản lý (MANAGER) đang hoạt động; gửi đúng leader_user_ids', async () => {
      const mockSetLeaders = vi.fn().mockResolvedValue({ success: true });
      vi.spyOn(adminHooks, 'useSetDepartmentLeaders').mockReturnValue({
        mutateAsync: mockSetLeaders,
        isPending: false,
      } as any);

      render(<DepartmentsPage />);

      // Mở modal phân công trưởng phòng cho Ban Tranh Chấp & Tố Tụng (dept-2)
      const assignButtons = screen.getAllByRole('button', {
        name: /chỉ định trưởng phòng|phân công trưởng phòng|trưởng phòng/i,
      });
      fireEvent.click(assignButtons[assignButtons.length - 1]);

      // Kiểm tra danh sách ứng viên trong modal:
      // PHẢI CÓ:
      // - LS. Nguyễn Văn Trường (MANAGER, active)
      // - LS. Trần Thị Mai (MANAGER, active)
      await waitFor(() => {
        expect(screen.getByText(/Trần Thị Mai/i)).toBeDefined();
      });

      // TUYỆT ĐỐI KHÔNG CÓ:
      // - LS. Lê Văn Khoá (MANAGER nhưng is_active: false)
      // - LS. Phạm Quốc Khánh (ATTORNEY)
      // - KTV. Trần Thị Lan (ACCOUNTANT)
      // - QTV. Hệ Thống (ADMIN)
      expect(screen.queryByText(/Lê Văn Khoá/i)).toBeNull();
      expect(screen.queryByText(/Phạm Quốc Khánh/i)).toBeNull();
      expect(screen.queryByText(/Trần Thị Lan/i)).toBeNull();
      expect(screen.queryByText(/QTV\. Hệ Thống/i)).toBeNull();

      // Chọn LS. Trần Thị Mai làm Trưởng phòng
      const candidateCheckbox = screen.getByLabelText(/Trần Thị Mai/i) ||
        screen.getByRole('checkbox', { name: /Trần Thị Mai/i });
      fireEvent.click(candidateCheckbox);

      const saveLeadersBtn = screen.getByRole('button', { name: /lưu trưởng phòng|cập nhật trưởng phòng|xác nhận/i });
      fireEvent.click(saveLeadersBtn);

      await waitFor(() => {
        expect(mockSetLeaders).toHaveBeenCalledWith(
          expect.objectContaining({
            leader_user_ids: expect.arrayContaining(['u-mgr-2']),
          })
        );
      });
    });
  });

  describe('Phân quyền vai trò trên màn hình Phòng ban', () => {
    it('MANAGER: xem được danh sách nhưng không có nút tạo phòng ban hay chỉ định trưởng phòng', () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: {
          id: 'u-mgr-only',
          full_name: 'LS. Quản Lý',
          system_role: 'MANAGER',
        },
        isLoading: false,
        isError: false,
      } as any);

      render(<DepartmentsPage />);

      // Xem được danh sách
      expect(screen.getByText(/Ban Sở Hữu Trí Tuệ/i)).toBeDefined();

      // Không có nút Thêm phòng ban
      expect(screen.queryByRole('button', { name: /thêm phòng ban|tạo phòng ban/i })).toBeNull();

      // Không có nút Chỉ định Trưởng phòng
      expect(screen.queryByRole('button', { name: /chỉ định trưởng phòng|phân công trưởng phòng/i })).toBeNull();
    });

    it('ATTORNEY hoặc ACCOUNTANT: hiển thị ErrorState "Không có quyền truy cập"', () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: {
          id: 'u-attorney',
          full_name: 'LS. Luật Sư',
          system_role: 'ATTORNEY',
        },
        isLoading: false,
        isError: false,
      } as any);

      render(<DepartmentsPage />);

      expect(screen.getByText(/không có quyền truy cập/i)).toBeDefined();
    });
  });
});
