import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import WorkflowsPage from '@/app/(dashboard)/admin/workflows/page';
import * as workflowHooks from '@/hooks/use-workflows';
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
  usePathname: () => '/admin/workflows',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Màn hình Danh sách Quy trình - admin/workflows/page.tsx (SCR-06 & brief mục 4, 5)', () => {
  const currentAdmin = {
    id: 'u-admin-1',
    email: 'admin@asllaw.vn',
    full_name: 'Quản Trị Viên',
    system_role: 'ADMIN',
  };

  const sampleTemplates = [
    {
      id: 'tpl-tm',
      matter_type_id: 'mt-shtt-tm',
      matter_type_name: 'Đăng ký Nhãn hiệu',
      name: 'Quy trình chuẩn Đăng ký Nhãn hiệu Quốc gia',
      mode: 'STRICT',
      is_active: true,
      published_version_no: 2,
      draft_version_id: 'ver-draft-1',
    },
    {
      id: 'tpl-mna',
      matter_type_id: 'mt-corp-mna',
      matter_type_name: 'Tư vấn M&A Doanh nghiệp',
      name: 'Quy trình Thẩm định Pháp lý & Chuyển nhượng Vốn',
      mode: 'FLEXIBLE',
      is_active: true,
      published_version_no: 1,
      draft_version_id: null,
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();

    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: currentAdmin,
      isLoading: false,
      isError: false,
    } as any);
  });

  describe('Tiêu chuẩn 4 trạng thái giao diện (UI 4-states)', () => {
    it('trạng thái đang tải (Loading state): hiển thị Skeleton loading', () => {
      vi.spyOn(workflowHooks, 'useWorkflowTemplates').mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<WorkflowsPage />);

      const skeleton =
        screen.queryByRole('status', { name: /đang tải/i }) ||
        document.querySelector('.animate-pulse');
      expect(skeleton).not.toBeNull();
    });

    it('trạng thái trống (Empty state): hiển thị thông điệp khi chưa có template nào', () => {
      vi.spyOn(workflowHooks, 'useWorkflowTemplates').mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<WorkflowsPage />);

      expect(
        screen.getByText(/chưa có quy trình|chưa có template|danh sách trống|không tìm thấy/i)
      ).toBeDefined();
    });

    it('trạng thái lỗi (Error state): hiển thị thông báo lỗi và nút Thử lại', () => {
      const mockRefetch = vi.fn();
      vi.spyOn(workflowHooks, 'useWorkflowTemplates').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Không thể tải danh sách template'),
        refetch: mockRefetch,
      } as any);

      render(<WorkflowsPage />);

      expect(screen.getByText(/có lỗi xảy ra|không thể tải/i)).toBeDefined();
      const retryBtn = screen.getByRole('button', { name: /thử lại/i });
      expect(retryBtn).toBeDefined();

      fireEvent.click(retryBtn);
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('trạng thái thành công: hiển thị danh sách quy trình với loại vụ việc, huy hiệu chế độ, số phiên bản phát hành và trạng thái bản nháp', () => {
      vi.spyOn(workflowHooks, 'useWorkflowTemplates').mockReturnValue({
        data: sampleTemplates,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<WorkflowsPage />);

      // Hiển thị tên loại vụ việc & tên quy trình
      expect(screen.getByText(/Đăng ký Nhãn hiệu/i)).toBeDefined();
      expect(screen.getByText(/Quy trình chuẩn Đăng ký Nhãn hiệu Quốc gia/i)).toBeDefined();
      expect(screen.getByText(/Tư vấn M&A Doanh nghiệp/i)).toBeDefined();

      // Huy hiệu chế độ Khung cứng (STRICT) & Linh hoạt (FLEXIBLE)
      expect(screen.getByText(/Khung cứng/i)).toBeDefined();
      expect(screen.getByText(/Linh hoạt/i)).toBeDefined();

      // Số phiên bản phát hành
      expect(screen.getByText(/Phiên bản 2|v2/i)).toBeDefined();
      expect(screen.getByText(/Phiên bản 1|v1/i)).toBeDefined();

      // Có bản nháp hay không
      expect(screen.getByText(/Có bản nháp|Đang soạn nháp|Bản nháp/i)).toBeDefined();
    });
  });

  describe('Khởi tạo mẫu quy trình mới (Create Template Modal & Error handling)', () => {
    it('mở modal tạo template, nhập thông tin và gọi mutation', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({ id: 'tpl-created' });
      vi.spyOn(workflowHooks, 'useWorkflowTemplates').mockReturnValue({
        data: sampleTemplates,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      vi.spyOn(workflowHooks, 'useCreateWorkflowTemplate').mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      } as any);

      render(<WorkflowsPage />);

      const createBtn = screen.getByRole('button', { name: /tạo quy trình|thêm quy trình|tạo template/i });
      fireEvent.click(createBtn);

      // Điền form trong modal
      const nameInput = screen.getByLabelText(/tên (mẫu )?quy trình|tên template/i) || screen.getByPlaceholderText(/tên quy trình/i);
      fireEvent.change(nameInput, { target: { value: 'Quy trình Đăng ký Kiểu dáng Công nghiệp' } });

      const submitBtn = screen.getByRole('button', { name: /lưu|tạo mới|xác nhận/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalled();
      });
    });

    it('hiển thị thông báo lỗi rõ ràng khi server trả lỗi 409 ACTIVE_TEMPLATE_EXISTS', async () => {
      const conflictError = new ApiError(
        409,
        'ACTIVE_TEMPLATE_EXISTS',
        'Loại vụ việc đã có template đang hoạt động'
      );

      vi.spyOn(workflowHooks, 'useWorkflowTemplates').mockReturnValue({
        data: sampleTemplates,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      vi.spyOn(workflowHooks, 'useCreateWorkflowTemplate').mockReturnValue({
        mutateAsync: vi.fn().mockRejectedValue(conflictError),
        isPending: false,
      } as any);

      render(<WorkflowsPage />);

      const createBtn = screen.getByRole('button', { name: /tạo quy trình|thêm quy trình|tạo template/i });
      fireEvent.click(createBtn);

      const nameInput = screen.getByLabelText(/tên (mẫu )?quy trình|tên template/i) || screen.getByPlaceholderText(/tên quy trình/i);
      fireEvent.change(nameInput, { target: { value: 'Đăng ký trùng loại vụ việc' } });

      const submitBtn = screen.getByRole('button', { name: /lưu|tạo mới|xác nhận/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Loại vụ việc đã có template đang hoạt động|ACTIVE_TEMPLATE_EXISTS/i)
        ).toBeDefined();
      });
    });
  });

  describe('Phân quyền truy cập (Role-based access control)', () => {
    it('vai trò MANAGER chỉ xem ở chế độ chỉ đọc: không có nút tạo mới hay chỉnh sửa', () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: {
          id: 'u-mgr-1',
          email: 'truong.nv@asllaw.vn',
          full_name: 'LS. Nguyễn Văn Trường',
          system_role: 'MANAGER',
        },
        isLoading: false,
        isError: false,
      } as any);

      vi.spyOn(workflowHooks, 'useWorkflowTemplates').mockReturnValue({
        data: sampleTemplates,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<WorkflowsPage />);

      // Xem được danh sách
      expect(screen.getByText(/Đăng ký Nhãn hiệu/i)).toBeDefined();

      // Không có nút tạo mới quy trình
      expect(screen.queryByRole('button', { name: /tạo quy trình|thêm quy trình|tạo template/i })).toBeNull();
    });

    it('vai trò ATTORNEY (hoặc vai trò không được phép) bị chặn bằng ErrorState "Không có quyền truy cập"', () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: {
          id: 'u-att-1',
          email: 'attorney@asllaw.vn',
          full_name: 'LS. Thành Viên',
          system_role: 'ATTORNEY',
        },
        isLoading: false,
        isError: false,
      } as any);

      vi.spyOn(workflowHooks, 'useWorkflowTemplates').mockReturnValue({
        data: sampleTemplates,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<WorkflowsPage />);

      expect(screen.getByText(/không có quyền truy cập/i)).toBeDefined();
      expect(screen.queryByText(/Quy trình chuẩn Đăng ký Nhãn hiệu Quốc gia/i)).toBeNull();
    });
  });
});
