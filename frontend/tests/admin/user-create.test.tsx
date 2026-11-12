import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import UsersPage from '@/app/(dashboard)/admin/users/page';
import * as adminHooks from '@/hooks/use-admin';
import * as authHooks from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';

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

describe('Quy trình Tạo Người Dùng Mới (brief mục 4, 5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();

    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: {
        id: 'u-admin-1',
        email: 'admin@asllaw.vn',
        full_name: 'Quản trị viên',
        system_role: 'ADMIN',
      },
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(adminHooks, 'useUsers').mockReturnValue({
      data: {
        data: [],
        meta: { page: 1, limit: 20, total_records: 0, total_pages: 0 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(adminHooks, 'useDepartments').mockReturnValue({
      data: [
        { id: 'dept-shtt', code: 'SHTT', name: 'Ban Sở Hữu Trí Tuệ' },
      ],
      isLoading: false,
      isError: false,
    } as any);
  });

  it('email bắt buộc có đuôi @asllaw.vn: sai đuôi thì báo lỗi và không gọi API tạo', async () => {
    const mockCreate = vi.fn();
    vi.spyOn(adminHooks, 'useCreateUser').mockReturnValue({
      mutateAsync: mockCreate,
      isPending: false,
    } as any);

    render(<UsersPage />);

    // Mở hộp thoại tạo người dùng
    const openBtn = screen.getByRole('button', { name: /thêm người dùng|tạo người dùng|\+ nhân sự/i });
    fireEvent.click(openBtn);

    const nameInput = screen.getByLabelText(/họ và tên|tên nhân sự/i);
    const emailInput = screen.getByLabelText(/email công vụ|email đăng nhập|email/i);
    const submitBtn = screen.getByRole('button', { name: /lưu|tạo mới|xác nhận tạo/i });

    fireEvent.change(nameInput, { target: { value: 'Hoàng Minh Trí' } });

    // Điền email đuôi @gmail.com hoặc @aslgate.com (sai quy định @asllaw.vn)
    fireEvent.change(emailInput, { target: { value: 'tri.hm@aslgate.com' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/@asllaw\.vn/i)).toBeDefined();
    });

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('trường "Giám đốc" (is_executive) bị vô hiệu hoá khi vai trò khác Quản lý (MANAGER)', async () => {
    vi.spyOn(adminHooks, 'useCreateUser').mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);

    render(<UsersPage />);

    const openBtn = screen.getByRole('button', { name: /thêm người dùng|tạo người dùng|\+ nhân sự/i });
    fireEvent.click(openBtn);

    const roleSelect = screen.getByLabelText(/vai trò|vai trò hệ thống/i);
    const executiveInput = screen.getByLabelText(/giám đốc|chức danh giám đốc/i) as HTMLInputElement;

    // Khi chọn vai trò là ATTORNEY (Luật sư)
    fireEvent.change(roleSelect, { target: { value: 'ATTORNEY' } });
    expect(executiveInput.disabled).toBe(true);

    // Khi chuyển vai trò sang MANAGER (Quản lý)
    fireEvent.change(roleSelect, { target: { value: 'MANAGER' } });
    expect(executiveInput.disabled).toBe(false);

    // Cho phép tick chọn khi là MANAGER
    fireEvent.click(executiveInput);
    expect(executiveInput.checked).toBe(true);
  });

  it('xử lý lỗi 409 DUPLICATE_EMAIL: hiển thị thông báo lỗi ngay dưới ô nhập email', async () => {
    const mockCreate = vi.fn().mockRejectedValue(
      new ApiError(409, 'DUPLICATE_EMAIL', 'Email này đã tồn tại trên hệ thống')
    );
    vi.spyOn(adminHooks, 'useCreateUser').mockReturnValue({
      mutateAsync: mockCreate,
      isPending: false,
    } as any);

    render(<UsersPage />);

    const openBtn = screen.getByRole('button', { name: /thêm người dùng|tạo người dùng|\+ nhân sự/i });
    fireEvent.click(openBtn);

    const nameInput = screen.getByLabelText(/họ và tên|tên nhân sự/i);
    const emailInput = screen.getByLabelText(/email công vụ|email đăng nhập|email/i);
    const submitBtn = screen.getByRole('button', { name: /lưu|tạo mới|xác nhận tạo/i });

    fireEvent.change(nameInput, { target: { value: 'Nguyễn Văn A' } });
    fireEvent.change(emailInput, { target: { value: 'a.nv@asllaw.vn' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/email này đã tồn tại trên hệ thống/i)).toBeDefined();
    });
  });

  it('thành công: hiển thị temporary_password một lần kèm cảnh báo; đóng hộp thoại thì xoá khỏi DOM', async () => {
    const tempPass = 'TempPass123456@!#';
    const mockCreate = vi.fn().mockResolvedValue({
      id: 'u-new-123',
      email: 'thanh.le@asllaw.vn',
      full_name: 'Lê Văn Thành',
      temporary_password: tempPass,
      must_reset_password: true,
    });

    vi.spyOn(adminHooks, 'useCreateUser').mockReturnValue({
      mutateAsync: mockCreate,
      isPending: false,
    } as any);

    render(<UsersPage />);

    const openBtn = screen.getByRole('button', { name: /thêm người dùng|tạo người dùng|\+ nhân sự/i });
    fireEvent.click(openBtn);

    const nameInput = screen.getByLabelText(/họ và tên|tên nhân sự/i);
    const emailInput = screen.getByLabelText(/email công vụ|email đăng nhập|email/i);
    const submitBtn = screen.getByRole('button', { name: /lưu|tạo mới|xác nhận tạo/i });

    fireEvent.change(nameInput, { target: { value: 'Lê Văn Thành' } });
    fireEvent.change(emailInput, { target: { value: 'thanh.le@asllaw.vn' } });
    fireEvent.click(submitBtn);

    // Hộp thoại mật khẩu tạm xuất hiện
    await waitFor(() => {
      expect(screen.getByText(tempPass)).toBeDefined();
    });

    // Có cảnh báo "chỉ hiện một lần"
    expect(screen.getByText(/chỉ hiện một lần/i)).toBeDefined();

    // Có nút sao chép mật khẩu
    expect(screen.getByRole('button', { name: /sao chép|copy/i })).toBeDefined();

    // Bấm nút đóng hộp thoại
    const closeBtn = screen.getByRole('button', { name: /đóng|hoàn tất|xác nhận/i });
    fireEvent.click(closeBtn);

    // Mật khẩu tạm biến mất hoàn toàn khỏi DOM và không lưu vào localStorage/sessionStorage
    await waitFor(() => {
      expect(screen.queryByText(tempPass)).toBeNull();
    });

    expect(localStorage.getItem('temporary_password')).toBeNull();
    expect(sessionStorage.getItem('temporary_password')).toBeNull();
  });
});
