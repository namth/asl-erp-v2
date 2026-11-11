import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import SettingsPage from '@/app/(dashboard)/settings/page';
import * as authHooks from '@/hooks/use-auth';
import * as settingsHooks from '@/hooks/use-settings';

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
  usePathname: () => '/settings',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Màn hình Cài đặt Hệ thống - settings/page.tsx (SCR-20 & brief mục 4, 5)', () => {
  const adminUser = {
    id: 'u-admin-1',
    email: 'admin@asllaw.vn',
    full_name: 'Quản trị viên Hệ thống',
    system_role: 'ADMIN',
  };

  const managerUser = {
    id: 'u-manager-1',
    email: 'truong.nv@asllaw.vn',
    full_name: 'LS. Nguyễn Văn Trường',
    system_role: 'MANAGER',
  };

  const sampleCommissionDefaults = [
    {
      matter_type_id: 'mt-tm',
      name: 'Sở hữu trí tuệ - Nhãn hiệu',
      code: 'TRADEMARK',
      default_originator_rate: '15.00',
      default_management_rate: '10.00',
      default_supervisor_share_pct: '30.00',
      default_execution_rate: '25.00',
    },
    {
      matter_type_id: 'mt-mna',
      name: 'Tư vấn M&A và Doanh nghiệp',
      code: 'M_AND_A',
      default_originator_rate: '20.00',
      default_management_rate: '15.00',
      default_supervisor_share_pct: '25.00',
      default_execution_rate: '35.00',
    },
  ];

  const mockMutate = vi.fn();
  const mockMutateAsync = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
    mockMutate.mockReset();
    mockMutateAsync.mockReset();

    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: adminUser,
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(settingsHooks, 'useCommissionDefaults').mockReturnValue({
      data: sampleCommissionDefaults,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(settingsHooks, 'useUpdateCommissionDefaults').mockReturnValue({
      mutate: mockMutate,
      mutateAsync: mockMutateAsync,
      isPending: false,
      isError: false,
    } as any);
  });

  describe('1. Thẻ "Tài khoản của tôi" (SCR-20, hiển thị cho mọi người dùng)', () => {
    it('hiển thị thông tin người dùng từ useMe() và liên kết tới /account/security', () => {
      render(<SettingsPage />);

      expect(screen.getByText(/tài khoản của tôi/i)).toBeDefined();
      expect(screen.getByText(new RegExp(adminUser.full_name, 'i'))).toBeDefined();
      expect(screen.getByText(new RegExp(adminUser.email, 'i'))).toBeDefined();

      const securityLink = screen.getAllByRole('link').find((l) => l.getAttribute('href') === '/account/security');
      expect(securityLink).toBeDefined();
    });

    it('với tài khoản ADMIN, có liên kết tới /admin/holidays (Quản lý ngày nghỉ lễ)', () => {
      render(<SettingsPage />);

      const holidayLink = screen.getAllByRole('link').find((l) => l.getAttribute('href')?.includes('/admin/holidays'));
      expect(holidayLink).toBeDefined();
    });

    it('với tài khoản MANAGER, KHÔNG hiển thị liên kết tới /admin/holidays', () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: managerUser,
        isLoading: false,
        isError: false,
      } as any);

      render(<SettingsPage />);

      const holidayLink = screen.getAllByRole('link').find((l) => l.getAttribute('href')?.includes('/admin/holidays'));
      expect(holidayLink).toBeUndefined();
    });
  });

  describe('2. Bảng Tỷ lệ hoa hồng mặc định theo loại vụ việc', () => {
    it('hiển thị đầy đủ các loại vụ việc và 4 ô tỷ lệ cho mỗi dòng', () => {
      render(<SettingsPage />);

      expect(screen.getByText(/tỷ lệ hoa hồng mặc định/i)).toBeDefined();
      expect(screen.getByText('Sở hữu trí tuệ - Nhãn hiệu')).toBeDefined();
      expect(screen.getByText('Tư vấn M&A và Doanh nghiệp')).toBeDefined();

      // Hiển thị dòng ghi chú quy định
      expect(screen.getByText(/chỉ áp cho vụ việc tạo sau khi lưu/i)).toBeDefined();
    });

    it('với ADMIN: các ô tỷ lệ có thể chỉnh sửa và có nút Lưu', () => {
      render(<SettingsPage />);

      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
      const editableInputs = inputs.filter((inp) => !inp.disabled);
      expect(editableInputs.length).toBeGreaterThanOrEqual(8); // 4 inputs x 2 rows

      const saveButton = screen.getByRole('button', { name: /lưu/i });
      expect(saveButton).toBeDefined();
      expect((saveButton as HTMLButtonElement).disabled).toBe(false);
    });

    it('với MANAGER: bảng tỷ lệ chỉ đọc (các ô bị disabled hoặc không cho phép chỉnh sửa)', () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: managerUser,
        isLoading: false,
        isError: false,
      } as any);

      render(<SettingsPage />);

      const inputs = screen.queryAllByRole('textbox') as HTMLInputElement[];
      if (inputs.length > 0) {
        inputs.forEach((inp) => {
          expect(inp.disabled).toBe(true);
        });
      }

      // Nút Lưu bị ẩn hoặc bị vô hiệu hóa
      const saveButton = screen.queryByRole('button', { name: /lưu/i }) as HTMLButtonElement | null;
      if (saveButton) {
        expect(saveButton.disabled).toBe(true);
      }
    });
  });

  describe('3. Xác thực dữ liệu Client-side & Ràng buộc nghiệp vụ (Validation)', () => {
    it('chặn và báo lỗi khi tỷ lệ ngoài khoảng 0–100', () => {
      render(<SettingsPage />);

      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
      const firstInput = inputs[0];

      // Nhập giá trị > 100
      fireEvent.change(firstInput, { target: { value: '105.00' } });

      const saveButton = screen.getByRole('button', { name: /lưu/i });
      fireEvent.click(saveButton);

      expect(mockMutate).not.toHaveBeenCalled();
      expect(mockMutateAsync).not.toHaveBeenCalled();
      expect(screen.getByText(/0.*100|từ 0 đến 100|không hợp lệ/i)).toBeDefined();
    });

    it('chặn và báo lỗi khi tỷ lệ có hơn 2 chữ số thập phân', () => {
      render(<SettingsPage />);

      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
      const firstInput = inputs[0];

      // Nhập giá trị 3 chữ số thập phân
      fireEvent.change(firstInput, { target: { value: '12.345' } });

      const saveButton = screen.getByRole('button', { name: /lưu/i });
      fireEvent.click(saveButton);

      expect(mockMutate).not.toHaveBeenCalled();
      expect(mockMutateAsync).not.toHaveBeenCalled();
      expect(screen.getByText(/2 chữ số lẻ|tối đa 2 chữ số thập phân/i)).toBeDefined();
    });

    it('chặn và báo lỗi ở đúng dòng khi tổng 3 tỷ lệ (người mang khách về + quản lý + thực hiện) > 100', () => {
      render(<SettingsPage />);

      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
      // Sửa dòng đầu: originator 50, management 30, execution 25 => tổng = 105 > 100
      fireEvent.change(inputs[0], { target: { value: '50.00' } });
      fireEvent.change(inputs[1], { target: { value: '30.00' } });
      fireEvent.change(inputs[3], { target: { value: '25.00' } });

      const saveButton = screen.getByRole('button', { name: /lưu/i });
      fireEvent.click(saveButton);

      expect(mockMutate).not.toHaveBeenCalled();
      expect(mockMutateAsync).not.toHaveBeenCalled();

      // Báo lỗi tổng > 100 ở dòng đó
      expect(screen.getByText(/tổng.*100|vượt quá 100%/i)).toBeDefined();
    });
  });

  describe('4. Lưu cấu hình & Body gửi lên server (Payload String Representation)', () => {
    it('khi hợp lệ, gửi PUT /settings/commission-defaults với danh sách và tỷ lệ là chuỗi', async () => {
      render(<SettingsPage />);

      const saveButton = screen.getByRole('button', { name: /lưu/i });
      fireEvent.click(saveButton);

      const calledWith = mockMutate.mock.calls[0]?.[0] || mockMutateAsync.mock.calls[0]?.[0];
      expect(calledWith).toBeDefined();
      expect(Array.isArray(calledWith)).toBe(true);

      const firstItem = calledWith[0];
      expect(typeof firstItem.default_originator_rate).toBe('string');
      expect(typeof firstItem.default_management_rate).toBe('string');
      expect(typeof firstItem.default_supervisor_share_pct).toBe('string');
      expect(typeof firstItem.default_execution_rate).toBe('string');
    });

    it('xử lý lỗi server COMMISSION_RATES_EXCEED_100 và hiển thị thông báo lỗi ở đúng dòng', () => {
      vi.spyOn(settingsHooks, 'useUpdateCommissionDefaults').mockReturnValue({
        mutate: mockMutate,
        mutateAsync: mockMutateAsync,
        isPending: false,
        isError: true,
        error: {
          code: 'COMMISSION_RATES_EXCEED_100',
          message: 'Tổng tỷ lệ hoa hồng vượt quá 100%',
          details: {
            matter_type_id: 'mt-tm',
          },
        },
      } as any);

      render(<SettingsPage />);

      // Hiển thị thông báo lỗi tương ứng với mã COMMISSION_RATES_EXCEED_100
      expect(screen.getByText(/tổng.*100|COMMISSION_RATES_EXCEED_100|vượt quá 100%/i)).toBeDefined();
    });
  });

  describe('5. Tiêu chuẩn giao diện 4 trạng thái (UI 4-states)', () => {
    it('hiển thị Skeleton loader khi đang tải dữ liệu cài đặt', () => {
      vi.spyOn(settingsHooks, 'useCommissionDefaults').mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<SettingsPage />);

      const pulse = document.querySelector('.animate-pulse');
      expect(pulse).not.toBeNull();
    });

    it('hiển thị ErrorState khi tải dữ liệu thất bại', () => {
      vi.spyOn(settingsHooks, 'useCommissionDefaults').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Internal Server Error 500'),
        refetch: vi.fn(),
      } as any);

      render(<SettingsPage />);

      expect(screen.getByText(/lỗi|không thể tải|thử lại/i)).toBeDefined();
    });
  });
});
