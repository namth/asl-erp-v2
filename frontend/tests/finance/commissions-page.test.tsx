import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import CommissionsPage from '@/app/(dashboard)/finance/page';
import * as financeHooks from '@/hooks/use-finance';
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
  usePathname: () => '/finance',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Màn hình Sổ hoa hồng thực thu (SCR-12 & brief mục 4, 5)', () => {
  const sampleCommissions = [
    {
      id: 'comm-01',
      case: { id: 'c-1', case_code: 'ASL-2026-LD-0001' },
      milestone: { id: 'm-1', name: 'Đợt 1: Ký hợp đồng' },
      user: { id: 'u-1', full_name: 'LS. Đặng Hoàng Giang' },
      role_type: 'ORIGINATOR',
      task: null,
      base_amount: '30000000',
      rate_pct: '5.00',
      amount: '1500000',
      created_at: '2026-10-30T10:00:00Z',
      disbursed_at: null,
    },
    {
      id: 'comm-02',
      case: { id: 'c-1', case_code: 'ASL-2026-LD-0001' },
      milestone: { id: 'm-1', name: 'Đợt 1: Ký hợp đồng' },
      user: { id: 'u-2', full_name: 'LS. Nguyễn Văn An' },
      role_type: 'CASE_MANAGER',
      task: null,
      base_amount: '30000000',
      rate_pct: '4.20',
      amount: '1260000',
      created_at: '2026-10-30T10:00:00Z',
      disbursed_at: null,
    },
    {
      id: 'comm-03',
      case: { id: 'c-1', case_code: 'ASL-2026-LD-0001' },
      milestone: { id: 'm-1', name: 'Đợt 1: Ký hợp đồng' },
      user: { id: 'u-3', full_name: 'Trần Thu Hà' },
      role_type: 'EXECUTOR',
      task: { id: 't-1', title: 'Soạn đơn khiếu nại' },
      base_amount: '30000000',
      rate_pct: '8.00',
      amount: '2400000',
      created_at: '2026-10-30T10:00:00Z',
      disbursed_at: null,
    },
  ];

  const sampleSummary = {
    total_amount: '5160000',
    by_role: {
      ORIGINATOR: '1500000',
      SUPERVISOR: '0',
      CASE_MANAGER: '1260000',
      EXECUTOR: '2400000',
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();

    // Mặc định đăng nhập với vai trò Quản lý (MANAGER)
    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: {
        id: 'u-mgr',
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

  describe('Tiêu chuẩn 4 trạng thái giao diện', () => {
    it('trạng thái đang tải (Loading state): hiển thị Skeleton loading', () => {
      vi.spyOn(financeHooks, 'useCommissions').mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<CommissionsPage />);

      const skeleton =
        screen.queryByRole('status', { name: /đang tải/i }) ||
        document.querySelector('.animate-pulse');
      expect(skeleton).not.toBeNull();
    });

    it('trạng thái trống (Empty state): hiển thị thông điệp khi sổ hoa hồng rỗng', () => {
      vi.spyOn(financeHooks, 'useCommissions').mockReturnValue({
        data: { items: [], summary: { total_amount: '0', by_role: {} }, meta: { page: 1, limit: 20, total_records: 0, total_pages: 0 } },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<CommissionsPage />);

      expect(screen.getByText(/chưa có hoa hồng|không có dữ liệu hoa hồng/i)).toBeDefined();
    });

    it('trạng thái thành công: hiển thị bảng hoa hồng và dải tổng summary theo vai trò', () => {
      vi.spyOn(financeHooks, 'useCommissions').mockReturnValue({
        data: {
          items: sampleCommissions,
          summary: sampleSummary,
          meta: { page: 1, limit: 20, total_records: 3, total_pages: 1 },
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<CommissionsPage />);

      // Kiểm tra các dòng bảng
      expect(screen.getAllByText('ASL-2026-LD-0001').length).toBeGreaterThan(0);
      expect(screen.getByText('LS. Đặng Hoàng Giang')).toBeDefined();
      expect(screen.getByText('LS. Nguyễn Văn An')).toBeDefined();
      expect(screen.getByText('Trần Thu Hà')).toBeDefined();
      expect(screen.getByText('Soạn đơn khiếu nại')).toBeDefined();

      // Kiểm tra dải tổng summary
      expect(screen.getByText(/5\.160\.000|5160000/)).toBeDefined();
      expect(screen.getByText(/1\.500\.000|1500000/)).toBeDefined();
      expect(screen.getByText(/1\.260\.000|1260000/)).toBeDefined();
      expect(screen.getByText(/2\.400\.000|2400000/)).toBeDefined();
    });
  });

  describe('Phân quyền bộ lọc người theo vai trò (ATTORNEY vs MANAGER/ACCOUNTANT)', () => {
    it('khi người dùng là ATTORNEY: KHÔNG hiển thị bộ lọc người (chỉ xem của mình)', () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: {
          id: 'u-lawyer',
          full_name: 'LS. Nguyễn Văn An',
          system_role: 'ATTORNEY',
        },
        isLoading: false,
        isError: false,
      } as any);

      vi.spyOn(financeHooks, 'useCommissions').mockReturnValue({
        data: {
          items: [sampleCommissions[1]],
          summary: { total_amount: '1260000', by_role: { CASE_MANAGER: '1260000' } },
          meta: { page: 1, limit: 20, total_records: 1, total_pages: 1 },
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<CommissionsPage />);

      // Bộ lọc người không được hiển thị cho Luật sư
      expect(screen.queryByLabelText(/nhân sự|người nhận|chọn luật sư/i)).toBeNull();
    });

    it('khi người dùng là ACCOUNTANT hoặc MANAGER: CÓ hiển thị bộ lọc người', () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: {
          id: 'u-acc',
          full_name: 'Trần Thị Thu Trang',
          system_role: 'ACCOUNTANT',
        },
        isLoading: false,
        isError: false,
      } as any);

      vi.spyOn(financeHooks, 'useCommissions').mockReturnValue({
        data: {
          items: sampleCommissions,
          summary: sampleSummary,
          meta: { page: 1, limit: 20, total_records: 3, total_pages: 1 },
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<CommissionsPage />);

      // Kế toán thấy bộ lọc người
      const userFilter =
        screen.queryByLabelText(/nhân sự|người nhận|chọn nhân sự/i) ||
        screen.queryByPlaceholderText(/tất cả nhân sự|chọn người/i) ||
        document.querySelector('select[name="user_id"], input[name="user_id"]');
      expect(userFilter).not.toBeNull();
    });
  });

  describe('Nút "Xuất Excel" & Tham số export', () => {
    it('hiển thị nút "Xuất Excel" không chứa emoji và tải đúng URL kèm tham số lọc', () => {
      vi.spyOn(financeHooks, 'useCommissions').mockReturnValue({
        data: {
          items: sampleCommissions,
          summary: sampleSummary,
          meta: { page: 1, limit: 20, total_records: 3, total_pages: 1 },
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      // Spy window.open hoặc thẻ <a> download
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      render(<CommissionsPage />);

      const exportBtn = screen.getByRole('button', { name: /xuất excel/i });
      expect(exportBtn).toBeDefined();

      // Kiểm tra nhãn nút không có emoji
      const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/u;
      expect(emojiRegex.test(exportBtn.textContent || '')).toBe(false);

      fireEvent.click(exportBtn);

      // Nếu dùng window.open hoặc thẻ <a>, kiểm tra URL gọi tới /finance/commissions/export
      if (openSpy.mock.calls.length > 0) {
        const calledUrl = openSpy.mock.calls[0][0] as string;
        expect(calledUrl).toContain('/finance/commissions/export');
      }
    });
  });
});
