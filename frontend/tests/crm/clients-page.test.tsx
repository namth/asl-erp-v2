import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import ClientsPage from '@/app/(dashboard)/crm/clients/page';
import * as crmHooks from '@/hooks/use-crm';
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
  usePathname: () => '/crm/clients',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Màn hình Quản lý Khách hàng (SCR-03 & brief mục 4, 5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();

    // Mặc định vai trò Quản lý / Luật sư
    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: {
        id: 'u-1',
        full_name: 'LS. Đặng Hoàng Giang',
        system_role: 'MANAGER',
      },
      isLoading: false,
      isError: false,
    } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Tiêu chuẩn 4 trạng thái giao diện (UI 4-states)', () => {
    it('trạng thái đang tải (Loading state): hiển thị Skeleton loading', () => {
      vi.spyOn(crmHooks, 'useClients').mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<ClientsPage />);

      // Skeleton loader hiển thị role="status" hoặc animate-pulse
      const skeleton = screen.getByRole('status', { name: /đang tải/i }) || document.querySelector('.animate-pulse');
      expect(skeleton).toBeDefined();
    });

    it('trạng thái trống (Empty state): hiển thị thông điệp khi danh sách khách hàng rỗng', () => {
      vi.spyOn(crmHooks, 'useClients').mockReturnValue({
        data: {
          items: [],
          meta: { page: 1, limit: 20, total_records: 0, total_pages: 0 },
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<ClientsPage />);

      expect(screen.getByText(/chưa có khách hàng/i)).toBeDefined();
    });

    it('trạng thái lỗi (Error state): hiển thị thông báo lỗi và nút Thử lại', () => {
      const mockRefetch = vi.fn();
      vi.spyOn(crmHooks, 'useClients').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Không thể kết nối đến máy chủ'),
        refetch: mockRefetch,
      } as any);

      render(<ClientsPage />);

      expect(screen.getByText(/có lỗi xảy ra|không thể kết nối/i)).toBeDefined();
      const retryBtn = screen.getByRole('button', { name: /thử lại/i });
      expect(retryBtn).toBeDefined();

      fireEvent.click(retryBtn);
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('trạng thái thành công: hiển thị bảng danh sách khách hàng đầy đủ thông tin', () => {
      vi.spyOn(crmHooks, 'useClients').mockReturnValue({
        data: {
          items: [
            {
              id: 'client-1',
              name: 'Công ty Cổ phần Alpha Gate',
              client_type: 'ENTERPRISE',
              tax_code: '0109988776',
              phone: '0912345678',
              email: 'alpha@gate.vn',
              category_group: 'VIP',
            },
          ],
          meta: { page: 1, limit: 20, total_records: 1, total_pages: 1 },
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<ClientsPage />);

      expect(screen.getByText('Công ty Cổ phần Alpha Gate')).toBeDefined();
      expect(screen.getByText('0109988776')).toBeDefined();
      expect(screen.getByText('0912345678')).toBeDefined();
      expect(screen.getByText(/VIP/i)).toBeDefined();
    });
  });

  describe('Tìm kiếm có Debounce 300ms và Phân trang theo meta', () => {
    it('tìm kiếm theo tên hoặc MST: debounce 300ms trước khi cập nhật tham số lọc', async () => {
      vi.useFakeTimers();

      let currentParams = { q: '', category_group: undefined, page: 1 };
      const useClientsSpy = vi.spyOn(crmHooks, 'useClients').mockImplementation((params: any) => {
        currentParams = params || currentParams;
        return {
          data: {
            items: [],
            meta: { page: 1, limit: 20, total_records: 0, total_pages: 0 },
          },
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        } as any;
      });

      render(<ClientsPage />);

      const searchInput = screen.getByPlaceholderText(/tìm theo tên|mã số thuế|mst|tên khách hàng/i);
      fireEvent.change(searchInput, { target: { value: '0109988776' } });

      // Chưa đủ 300ms, hook useClients chưa nhận q mới
      expect(currentParams.q || '').not.toBe('0109988776');

      // Nhảy thời gian quá 300ms
      vi.advanceTimersByTime(350);

      expect(currentParams.q).toBe('0109988776');
    });

    it('phân trang theo meta: hiển thị tổng số và chuyển trang gọi đúng page', () => {
      const mockRefetch = vi.fn();
      let capturedPage = 1;

      vi.spyOn(crmHooks, 'useClients').mockImplementation((params: any) => {
        capturedPage = params?.page || 1;
        return {
          data: {
            items: [
              {
                id: 'c-1',
                name: 'Công ty Trang 1',
                client_type: 'ENTERPRISE',
                tax_code: '0101111111',
                phone: '0901111111',
                category_group: 'NEW',
              },
            ],
            meta: { page: capturedPage, limit: 20, total_records: 45, total_pages: 3 },
          },
          isLoading: false,
          isError: false,
          refetch: mockRefetch,
        } as any;
      });

      const { rerender } = render(<ClientsPage />);

      expect(screen.getByText(/45/)).toBeDefined();

      // Bấm nút chuyển sang trang tiếp theo
      const nextBtn = screen.getByRole('button', { name: /tiếp|sau|>|next/i });
      fireEvent.click(nextBtn);

      rerender(<ClientsPage />);
      expect(capturedPage).toBe(2);
    });
  });

  describe('Form tạo mới khách hàng & Xác thực dữ liệu (Validation & 409 Duplicate)', () => {
    it('ENTERPRISE bắt buộc MST 10 hoặc 13 số: nhập sai độ dài báo lỗi và KHÔNG gọi API', async () => {
      const mockMutate = vi.fn();
      vi.spyOn(crmHooks, 'useCreateClient').mockReturnValue({
        mutateAsync: mockMutate,
        isPending: false,
      } as any);

      vi.spyOn(crmHooks, 'useClients').mockReturnValue({
        data: { items: [], meta: { page: 1, limit: 20, total_records: 0, total_pages: 0 } },
        isLoading: false,
        isError: false,
      } as any);

      render(<ClientsPage />);

      // Bấm nút tạo khách hàng mới
      const createBtn = screen.getByRole('button', { name: /tạo khách hàng|thêm khách hàng|\+ khách hàng/i });
      fireEvent.click(createBtn);

      // Điền thông tin sai: MST 9 số
      const nameInput = screen.getByLabelText(/tên khách hàng|tên công ty/i);
      const taxInput = screen.getByLabelText(/mã số thuế|mst/i);
      const submitBtn = screen.getByRole('button', { name: /lưu|tạo mới|xác nhận/i });

      fireEvent.change(nameInput, { target: { value: 'Công ty Test MST Sai' } });
      fireEvent.change(taxInput, { target: { value: '010998877' } }); // 9 số
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/10 hoặc 13/i)).toBeDefined();
      });

      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('INDIVIDUAL: chọn cá nhân thì nhập identity_no (CCCD/Hộ chiếu) thay vì MST', async () => {
      vi.spyOn(crmHooks, 'useClients').mockReturnValue({
        data: { items: [], meta: { page: 1, limit: 20, total_records: 0, total_pages: 0 } },
        isLoading: false,
        isError: false,
      } as any);

      render(<ClientsPage />);

      const createBtn = screen.getByRole('button', { name: /tạo khách hàng|thêm khách hàng|\+ khách hàng/i });
      fireEvent.click(createBtn);

      // Chuyển loại khách hàng sang Cá nhân (INDIVIDUAL)
      const individualRadioOrSelect =
        screen.getByLabelText(/cá nhân/i) || screen.getByDisplayValue(/cá nhân|individual/i);
      fireEvent.click(individualRadioOrSelect);

      await waitFor(() => {
        expect(screen.getByLabelText(/cccd|hộ chiếu|căn cước/i)).toBeDefined();
      });
    });

    it('xử lý lỗi 409 DUPLICATE_TAX_CODE: hiển thị thông báo lỗi ngay dưới ô MST', async () => {
      const mockMutate = vi.fn().mockRejectedValue(
        new ApiError(409, 'DUPLICATE_TAX_CODE', 'Mã số thuế này đã tồn tại trên hệ thống')
      );
      vi.spyOn(crmHooks, 'useCreateClient').mockReturnValue({
        mutateAsync: mockMutate,
        isPending: false,
      } as any);

      vi.spyOn(crmHooks, 'useClients').mockReturnValue({
        data: { items: [], meta: { page: 1, limit: 20, total_records: 0, total_pages: 0 } },
        isLoading: false,
        isError: false,
      } as any);

      render(<ClientsPage />);

      const createBtn = screen.getByRole('button', { name: /tạo khách hàng|thêm khách hàng|\+ khách hàng/i });
      fireEvent.click(createBtn);

      const nameInput = screen.getByLabelText(/tên khách hàng|tên công ty/i);
      const taxInput = screen.getByLabelText(/mã số thuế|mst/i);
      const phoneInput = screen.getByLabelText(/số điện thoại|sđt/i);
      const addressInput = screen.getByLabelText(/địa chỉ/i);
      const submitBtn = screen.getByRole('button', { name: /lưu|tạo mới|xác nhận/i });

      fireEvent.change(nameInput, { target: { value: 'Công ty Cổ phần Alpha Gate' } });
      fireEvent.change(taxInput, { target: { value: '0109988776' } });
      fireEvent.change(phoneInput, { target: { value: '0912345678' } });
      fireEvent.change(addressInput, { target: { value: '12 Duy Tân, Hà Nội' } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/đã tồn tại trên hệ thống/i)).toBeDefined();
      });
    });

    it('cảnh báo CONFLICT_OF_INTEREST (201 kèm warnings): hiển thị cảnh báo vàng liệt kê case_codes', async () => {
      const mockMutate = vi.fn().mockResolvedValue({
        id: 'client-warning-1',
        name: 'Công ty Đối Tụng B',
        warnings: [
          {
            code: 'CONFLICT_OF_INTEREST',
            case_codes: ['ASL-2026-LD-0007', 'ASL-2026-TM-0012'],
          },
        ],
      });
      vi.spyOn(crmHooks, 'useCreateClient').mockReturnValue({
        mutateAsync: mockMutate,
        isPending: false,
      } as any);

      vi.spyOn(crmHooks, 'useClients').mockReturnValue({
        data: { items: [], meta: { page: 1, limit: 20, total_records: 0, total_pages: 0 } },
        isLoading: false,
        isError: false,
      } as any);

      render(<ClientsPage />);

      const createBtn = screen.getByRole('button', { name: /tạo khách hàng|thêm khách hàng|\+ khách hàng/i });
      fireEvent.click(createBtn);

      const nameInput = screen.getByLabelText(/tên khách hàng|tên công ty/i);
      const taxInput = screen.getByLabelText(/mã số thuế|mst/i);
      const phoneInput = screen.getByLabelText(/số điện thoại|sđt/i);
      const addressInput = screen.getByLabelText(/địa chỉ/i);
      const submitBtn = screen.getByRole('button', { name: /lưu|tạo mới|xác nhận/i });

      fireEvent.change(nameInput, { target: { value: 'Công ty Đối Tụng B' } });
      fireEvent.change(taxInput, { target: { value: '0109988776' } });
      fireEvent.change(phoneInput, { target: { value: '0912345678' } });
      fireEvent.change(addressInput, { target: { value: '12 Duy Tân, Hà Nội' } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        // Cảnh báo vàng xung đột lợi ích liệt kê các vụ việc
        expect(screen.getByText(/ASL-2026-LD-0007/)).toBeDefined();
      });
    });
  });

  describe('Phân quyền theo vai trò (DEC-01 & DEC-04: Kế toán chỉ xem)', () => {
    it('vai trò ACCOUNTANT: không hiển thị nút tạo khách hàng và không có nút sửa', () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: {
          id: 'u-acc',
          full_name: 'Nguyễn Kế Toán',
          system_role: 'ACCOUNTANT',
        },
        isLoading: false,
        isError: false,
      } as any);

      vi.spyOn(crmHooks, 'useClients').mockReturnValue({
        data: {
          items: [
            {
              id: 'client-1',
              name: 'Công ty Cổ phần Alpha Gate',
              client_type: 'ENTERPRISE',
              tax_code: '0109988776',
              phone: '0912345678',
              category_group: 'VIP',
            },
          ],
          meta: { page: 1, limit: 20, total_records: 1, total_pages: 1 },
        },
        isLoading: false,
        isError: false,
      } as any);

      render(<ClientsPage />);

      // Nút tạo mới khách hàng hoàn toàn không xuất hiện
      expect(
        screen.queryByRole('button', { name: /tạo khách hàng|thêm khách hàng|\+ khách hàng/i })
      ).toBeNull();

      // Không có nút sửa khách hàng
      expect(screen.queryByRole('button', { name: /chỉnh sửa|sửa/i })).toBeNull();
    });
  });
});
