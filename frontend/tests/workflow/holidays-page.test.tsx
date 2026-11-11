import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import HolidaysPage from '@/app/(dashboard)/admin/holidays/page';
import * as workflowHooks from '@/hooks/use-workflows';
import * as authHooks from '@/hooks/use-auth';

describe('Màn hình Cấu hình Ngày nghỉ lễ - admin/holidays/page.tsx (§3.3a & brief mục 4, 5)', () => {
  const currentAdmin = {
    id: 'u-admin-1',
    email: 'admin@asllaw.vn',
    full_name: 'Quản Trị Viên',
    system_role: 'ADMIN',
  };

  const sampleHolidays = {
    year: 2026,
    days: [
      { date: '2026-01-01', name: 'Tết Dương Lịch' },
      { date: '2026-04-30', name: 'Ngày Giải phóng miền Nam' },
      { date: '2026-05-01', name: 'Ngày Quốc tế Lao động' },
      { date: '2026-09-02', name: 'Ngày Quốc Khánh' },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: currentAdmin,
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(workflowHooks, 'useHolidays').mockReturnValue({
      data: sampleHolidays,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(workflowHooks, 'useSaveHolidays').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ success: true }),
      isPending: false,
    } as any);
  });

  describe('Tiêu chuẩn 4 trạng thái giao diện (UI 4-states)', () => {
    it('trạng thái đang tải (Loading state): hiển thị Skeleton loading', () => {
      vi.spyOn(workflowHooks, 'useHolidays').mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<HolidaysPage />);

      const skeleton =
        screen.queryByRole('status', { name: /đang tải/i }) ||
        document.querySelector('.animate-pulse');
      expect(skeleton).not.toBeNull();
    });

    it('trạng thái trống (Empty state): hiển thị thông báo khi chưa thiết lập ngày nghỉ cho năm được chọn', () => {
      vi.spyOn(workflowHooks, 'useHolidays').mockReturnValue({
        data: { year: 2027, days: [] },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<HolidaysPage />);

      expect(
        screen.getByText(/chưa có ngày nghỉ nào|danh sách trống|chưa thiết lập/i)
      ).toBeDefined();
    });

    it('trạng thái lỗi (Error state): hiển thị thông báo lỗi và nút Thử lại', () => {
      const mockRefetch = vi.fn();
      vi.spyOn(workflowHooks, 'useHolidays').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Không thể tải lịch nghỉ lễ'),
        refetch: mockRefetch,
      } as any);

      render(<HolidaysPage />);

      expect(screen.getByText(/có lỗi xảy ra|không thể tải/i)).toBeDefined();
      const retryBtn = screen.getByRole('button', { name: /thử lại/i });
      expect(retryBtn).toBeDefined();

      fireEvent.click(retryBtn);
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('trạng thái thành công: hiển thị danh sách ngày nghỉ với ngày, tên dịp nghỉ và tổng số ngày', () => {
      render(<HolidaysPage />);

      expect(screen.getByText(/Tết Dương Lịch/i)).toBeDefined();
      expect(screen.getByText(/2026-01-01/i)).toBeDefined();
      expect(screen.getByText(/Ngày Giải phóng miền Nam/i)).toBeDefined();
      expect(screen.getByText(/2026-04-30/i)).toBeDefined();
    });
  });

  describe('Thao tác chọn năm, thêm/xoá ngày nghỉ & kiểm tra trùng lặp', () => {
    it('cho phép chọn năm khác để tải lịch nghỉ của năm tương ứng', () => {
      const mockUseHolidays = vi.spyOn(workflowHooks, 'useHolidays');

      render(<HolidaysPage />);

      const yearSelect = screen.getByLabelText(/chọn năm|năm áp dụng/i) || screen.getByDisplayValue('2026');
      fireEvent.change(yearSelect, { target: { value: '2027' } });

      expect(mockUseHolidays).toHaveBeenCalledWith(2027);
    });

    it('chặn thêm ngày nghỉ bị trùng ngày (cùng date) và báo lỗi rõ ràng', () => {
      render(<HolidaysPage />);

      const addBtn = screen.getByRole('button', { name: /thêm ngày nghỉ|thêm ngày/i });
      fireEvent.click(addBtn);

      const dateInput = screen.getByLabelText(/ngày nghỉ|ngày/i) || screen.getByPlaceholderText(/YYYY-MM-DD/i);
      fireEvent.change(dateInput, { target: { value: '2026-01-01' } }); // Ngày đã có

      const nameInput = screen.getByLabelText(/tên dịp nghỉ|dịp lễ/i) || screen.getByPlaceholderText(/tên dịp lễ/i);
      fireEvent.change(nameInput, { target: { value: 'Nghỉ bù Tết' } });

      const confirmAddBtn = screen.getByRole('button', { name: /xác nhận thêm|thêm vào danh sách/i });
      fireEvent.click(confirmAddBtn);

      expect(
        screen.getByText(/ngày nghỉ đã tồn tại|trùng ngày|ngày này đã được khai báo/i)
      ).toBeDefined();
    });

    it('xoá một ngày nghỉ khỏi danh sách', () => {
      render(<HolidaysPage />);

      const deleteButtons = screen.getAllByRole('button', { name: /xoá/i });
      expect(deleteButtons.length).toBeGreaterThanOrEqual(1);

      fireEvent.click(deleteButtons[0]);

      // Ngày đầu tiên (Tết Dương Lịch) bị loại khỏi danh sách hiển thị
      expect(screen.queryByText(/2026-01-01/i)).toBeNull();
    });

    it('lưu danh sách ngày nghỉ gửi đúng cấu trúc body tới PUT /settings/holidays', async () => {
      const mockSave = vi.fn().mockResolvedValue({ success: true });
      vi.spyOn(workflowHooks, 'useSaveHolidays').mockReturnValue({
        mutateAsync: mockSave,
        isPending: false,
      } as any);

      render(<HolidaysPage />);

      const saveBtn = screen.getByRole('button', { name: /lưu thay đổi|lưu lịch nghỉ/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(mockSave).toHaveBeenCalledWith({
          year: 2026,
          days: sampleHolidays.days,
        });
      });
    });
  });

  describe('Phân quyền truy cập', () => {
    it('vai trò MANAGER xem được ở chế độ chỉ đọc: không có nút thêm, xoá hay lưu', () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: {
          id: 'u-mgr-1',
          full_name: 'Quản lý',
          system_role: 'MANAGER',
        },
        isLoading: false,
        isError: false,
      } as any);

      render(<HolidaysPage />);

      expect(screen.getByText(/Tết Dương Lịch/i)).toBeDefined();
      expect(screen.queryByRole('button', { name: /thêm ngày nghỉ|thêm ngày/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /lưu thay đổi|lưu lịch nghỉ/i })).toBeNull();
    });

    it('vai trò ATTORNEY bị chặn bằng ErrorState "Không có quyền truy cập"', () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: {
          id: 'u-att-1',
          full_name: 'Luật sư',
          system_role: 'ATTORNEY',
        },
        isLoading: false,
        isError: false,
      } as any);

      render(<HolidaysPage />);

      expect(screen.getByText(/không có quyền truy cập/i)).toBeDefined();
      expect(screen.queryByText(/Tết Dương Lịch/i)).toBeNull();
    });
  });
});
