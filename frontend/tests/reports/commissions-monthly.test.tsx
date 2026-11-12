import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { CommissionsTab } from '@/components/reports/commissions-tab';
import ReportsPage from '@/app/(dashboard)/reports/page';
import * as authHooks from '@/hooks/use-auth';
import * as reportsHooks from '@/hooks/use-reports';
import type { User } from '@/types/auth';

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/reports',
  useSearchParams: () => mockSearchParams,
}));

// Dữ liệu mẫu chuẩn theo docs/07-api-contracts.md §3.9 mục commissions
const mockCommissionsDocs07 = {
  summary: {
    total_amount: '264000000',
    transaction_count: 57,
    by_role: {
      ORIGINATOR: '40000000',
      SUPERVISOR: '30000000',
      CASE_MANAGER: '90000000',
      EXECUTOR: '104000000',
      ASSISTANT: '0',
    },
  },
  periods: ['2026-10', '2026-11'],
  by_period: [
    { period: '2026-10', total_amount: '120000000' },
    { period: '2026-11', total_amount: '144000000' },
  ],
  by_user: [
    {
      user: {
        id: 'u2',
        full_name: 'LS. Mai Linh',
        department_name: 'Phòng Sở Hữu Trí Tuệ',
      },
      total_amount: '42000000',
      by_role: {
        ORIGINATOR: '0',
        SUPERVISOR: '6000000',
        CASE_MANAGER: '21000000',
        EXECUTOR: '15000000',
        ASSISTANT: '0',
      },
      by_period: [
        { period: '2026-10', total_amount: '12000000' },
        { period: '2026-11', total_amount: '30000000' },
      ],
    },
    {
      user: {
        id: 'u1',
        full_name: 'LS. Nguyễn Văn An',
        department_name: 'Phòng Tranh Tụng',
      },
      total_amount: '222000000',
      by_role: {
        ORIGINATOR: '40000000',
        SUPERVISOR: '24000000',
        CASE_MANAGER: '69000000',
        EXECUTOR: '89000000',
        ASSISTANT: '0',
      },
      by_period: [
        { period: '2026-10', total_amount: '108000000' },
        { period: '2026-11', total_amount: '114000000' },
      ],
    },
  ],
  meta: {
    scope: 'FIRM' as const,
    departments: [],
    from: '2026-10-01',
    to: '2026-11-11',
  },
};

// Dữ liệu thứ 2 dùng để chống lách hard-code (khác tháng, khác số tiền, khác số bút toán)
const mockDynamicCommissions = {
  summary: {
    total_amount: '85000000',
    transaction_count: 19,
    by_role: {
      ORIGINATOR: '15000000',
      SUPERVISOR: '10000000',
      CASE_MANAGER: '25000000',
      EXECUTOR: '30000000',
      ASSISTANT: '5000000',
    },
  },
  periods: ['2025-01', '2025-02', '2025-03'],
  by_period: [
    { period: '2025-01', total_amount: '25000000' },
    { period: '2025-02', total_amount: '30000000' },
    { period: '2025-03', total_amount: '30000000' },
  ],
  by_user: [
    {
      user: {
        id: 'u-dynamic-1',
        full_name: 'LS. Trần Quốc Tuấn',
        department_name: 'Phòng Doanh Nghiệp',
      },
      total_amount: '55000000',
      by_role: {
        ORIGINATOR: '10000000',
        SUPERVISOR: '5000000',
        CASE_MANAGER: '20000000',
        EXECUTOR: '20000000',
        ASSISTANT: '0',
      },
      by_period: [
        { period: '2025-01', total_amount: '25000000' },
        { period: '2025-02', total_amount: '30000000' },
        { period: '2025-03', total_amount: '0' },
      ],
    },
    {
      user: {
        id: 'u-dynamic-2',
        full_name: 'Trợ lý Lê Hoàng',
        department_name: 'Phòng Doanh Nghiệp',
      },
      total_amount: '30000000',
      by_role: {
        ORIGINATOR: '5000000',
        SUPERVISOR: '5000000',
        CASE_MANAGER: '5000000',
        EXECUTOR: '10000000',
        ASSISTANT: '5000000',
      },
      by_period: [
        { period: '2025-01', total_amount: '0' },
        { period: '2025-02', total_amount: '0' },
        { period: '2025-03', total_amount: '30000000' },
      ],
    },
  ],
  meta: {
    scope: 'DEPARTMENT' as const,
    departments: [{ id: 'd-corp', name: 'Phòng Doanh Nghiệp' }],
    from: '2025-01-01',
    to: '2025-03-31',
  },
};

function renderCommissionsTab(data: any) {
  const props: any = { data };
  return render(<CommissionsTab {...props} />);
}

describe('Báo cáo hoa hồng theo tháng (DEC-09 & brief mục 4, 5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Tiêu chí 1: Không còn dấu vết trạng thái chi trả (DEC-09)', () => {
    it('không hiển thị thẻ hay văn bản "Tích luỹ" và "Đã chi"', () => {
      renderCommissionsTab(mockCommissionsDocs07);

      expect(screen.queryByText(/^Tích luỹ$/i)).toBeNull();
      expect(screen.queryByText(/^Đã chi$/i)).toBeNull();
      expect(screen.queryByText(/chưa chi trả/i)).toBeNull();
      expect(screen.queryByText(/đã thực hiện chi trả/i)).toBeNull();
    });

    it('không hiển thị bộ lọc "Trạng thái chi trả" hoặc combobox payout_status', () => {
      renderCommissionsTab(mockCommissionsDocs07);

      expect(screen.queryByLabelText(/trạng thái chi trả/i)).toBeNull();
      expect(screen.queryByRole('combobox', { name: /trạng thái chi trả/i })).toBeNull();
    });
  });

  describe('2. Tiêu chí 2: Khớp đặc tả mock docs/07 §3.9 và hiển thị hoa hồng theo tháng', () => {
    it('hiển thị 2 thẻ chỉ số: Tổng hoa hồng và Số bút toán', () => {
      renderCommissionsTab(mockCommissionsDocs07);

      expect(screen.getByText(/tổng hoa hồng/i)).toBeDefined();
      expect(screen.getAllByText('264.000.000 ₫').length).toBeGreaterThanOrEqual(2); // thẻ KPI + dòng Tổng cộng

      expect(screen.getByText(/số bút toán/i)).toBeDefined();
      expect(screen.getByText('57')).toBeDefined();
    });

    it('hiển thị bảng "Hoa hồng theo tháng" với cột periods định dạng MM/YYYY và cột Tổng', () => {
      renderCommissionsTab(mockCommissionsDocs07);

      expect(screen.getByText('10/2026')).toBeDefined();
      expect(screen.getByText('11/2026')).toBeDefined();

      const user1Name = screen.getByText('LS. Mai Linh');
      expect(user1Name).toBeDefined();
      expect(screen.getByText('Phòng Sở Hữu Trí Tuệ')).toBeDefined();

      const user2Name = screen.getByText('LS. Nguyễn Văn An');
      expect(user2Name).toBeDefined();
      expect(screen.getByText('Phòng Tranh Tụng')).toBeDefined();

      // Số tiền theo từng tháng của từng nhân sự
      expect(screen.getByText('12.000.000 ₫')).toBeDefined(); // u2 10/2026
      expect(screen.getByText('30.000.000 ₫')).toBeDefined(); // u2 11/2026
      expect(screen.getByText('42.000.000 ₫')).toBeDefined(); // u2 total

      expect(screen.getByText('108.000.000 ₫')).toBeDefined(); // u1 10/2026
      expect(screen.getByText('114.000.000 ₫')).toBeDefined(); // u1 11/2026
      expect(screen.getByText('222.000.000 ₫')).toBeDefined(); // u1 total
    });

    it('dòng cuối "Tổng cộng" lấy từ by_period và summary.total_amount', () => {
      renderCommissionsTab(mockCommissionsDocs07);

      const totalRowLabel = screen.getAllByText(/tổng cộng/i);
      expect(totalRowLabel.length).toBeGreaterThan(0);

      // by_period totals
      expect(screen.getByText('120.000.000 ₫')).toBeDefined(); // tổng kỳ 10/2026
      expect(screen.getByText('144.000.000 ₫')).toBeDefined(); // tổng kỳ 11/2026
      // Tổng toàn bộ bảng lấy từ summary.total_amount
      expect(screen.getAllByText('264.000.000 ₫').length).toBeGreaterThanOrEqual(1);
    });

    it('hiển thị bảng "Theo vai trò" đủ 5 vai trò tiếng Việt với số tiền tương ứng', () => {
      renderCommissionsTab(mockCommissionsDocs07);

      expect(screen.getByText('Mang khách về')).toBeDefined();
      expect(screen.getByText('Giám sát')).toBeDefined();
      expect(screen.getByText('Quản lý vụ việc')).toBeDefined();
      expect(screen.getByText('Thực hiện')).toBeDefined();
      expect(screen.getByText('Hỗ trợ')).toBeDefined();

      // Số tiền theo vai trò của LS. Mai Linh
      expect(screen.getByText('6.000.000 ₫')).toBeDefined(); // SUPERVISOR
      expect(screen.getByText('21.000.000 ₫')).toBeDefined(); // CASE_MANAGER
      expect(screen.getByText('15.000.000 ₫')).toBeDefined(); // EXECUTOR

      // Số tiền theo vai trò của LS. Nguyễn Văn An
      expect(screen.getByText('40.000.000 ₫')).toBeDefined(); // ORIGINATOR
      expect(screen.getByText('24.000.000 ₫')).toBeDefined(); // SUPERVISOR
      expect(screen.getByText('69.000.000 ₫')).toBeDefined(); // CASE_MANAGER
      expect(screen.getByText('89.000.000 ₫')).toBeDefined(); // EXECUTOR
    });
  });

  describe('3. Tiêu chí 4: Xử lý trạng thái rỗng và cuộn ngang', () => {
    it('khi by_user rỗng -> hiển thị EmptyState', () => {
      const emptyData = {
        summary: {
          total_amount: '0',
          transaction_count: 0,
          by_role: {
            ORIGINATOR: '0',
            SUPERVISOR: '0',
            CASE_MANAGER: '0',
            EXECUTOR: '0',
            ASSISTANT: '0',
          },
        },
        periods: [],
        by_period: [],
        by_user: [],
        meta: {
          scope: 'FIRM' as const,
          departments: [],
          from: '2026-10-01',
          to: '2026-11-11',
        },
      };

      renderCommissionsTab(emptyData);

      expect(
        screen.getByText(/chưa có số liệu|không tìm thấy dữ liệu|danh sách trống/i)
      ).toBeDefined();
    });

    it('bảng cuộn ngang được (overflow-x-auto) để không vỡ bố cục trên màn hình 375px', () => {
      const { container } = renderCommissionsTab(mockCommissionsDocs07);

      const scrollContainers = container.querySelectorAll('.overflow-x-auto');
      expect(scrollContainers.length).toBeGreaterThan(0);
    });
  });

  describe('4. Chống lách test: Hiển thị động theo periods và by_user bất kỳ', () => {
    it('hiển thị đúng các tháng 01/2025, 02/2025, 03/2025 và giá trị 0 ₫ cho tháng không có bút toán', () => {
      renderCommissionsTab(mockDynamicCommissions);

      // Thẻ KPI động
      expect(screen.getAllByText('85.000.000 ₫').length).toBeGreaterThanOrEqual(2); // thẻ KPI + dòng Tổng cộng
      expect(screen.getByText('19')).toBeDefined();

      // Cột động
      expect(screen.getByText('01/2025')).toBeDefined();
      expect(screen.getByText('02/2025')).toBeDefined();
      expect(screen.getByText('03/2025')).toBeDefined();

      // Tên nhân sự giữ nguyên thứ tự API
      expect(screen.getByText('LS. Trần Quốc Tuấn')).toBeDefined();
      expect(screen.getByText('Trợ lý Lê Hoàng')).toBeDefined();

      // Kiểm tra giá trị 0 ₫ xuất hiện cho tháng không có số liệu
      const zeroVndElements = screen.getAllByText('0 ₫');
      expect(zeroVndElements.length).toBeGreaterThan(0);

      // Kiểm tra tổng cộng theo kỳ của bộ dữ liệu động
      expect(screen.getAllByText('25.000.000 ₫').length).toBeGreaterThan(0);
      expect(screen.getAllByText('30.000.000 ₫').length).toBeGreaterThan(0);
    });
  });

  describe('5. Tích hợp trong ReportsPage: Đủ trạng thái và không gửi payout_status', () => {
    beforeEach(() => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: {
          id: 'u-mgr',
          full_name: 'Quản lý Nguyễn',
          system_role: 'MANAGER',
        } as User,
        isLoading: false,
        isError: false,
      } as any);
    });

    it('hook useCommissionsReport không gửi tham số payout_status', () => {
      const spyUseCommissions = vi
        .spyOn(reportsHooks, 'useCommissionsReport')
        .mockReturnValue({
          data: mockCommissionsDocs07 as any,
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        } as any);

      render(<ReportsPage />);

      // Mở tab hoa hồng
      const commissionsTabBtn = screen.getByRole('tab', { name: /hoa hồng/i });
      commissionsTabBtn.click();

      expect(spyUseCommissions).toHaveBeenCalled();
      const lastCallArgs =
        spyUseCommissions.mock.calls[spyUseCommissions.mock.calls.length - 1][0];
      expect((lastCallArgs as any).payout_status).toBeUndefined();
    });

    it('khi API bị lỗi -> hiển thị ErrorState có nút Thử lại', () => {
      const mockRefetch = vi.fn();
      vi.spyOn(reportsHooks, 'useCommissionsReport').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Lỗi máy chủ'),
        refetch: mockRefetch,
      } as any);

      render(<ReportsPage />);
      screen.getByRole('tab', { name: /hoa hồng/i }).click();

      expect(
        screen.getByText(/lỗi|không thể tải dữ liệu|thất bại/i)
      ).toBeDefined();

      const retryBtn = screen.getByRole('button', { name: /thử lại/i });
      expect(retryBtn).toBeDefined();
      retryBtn.click();
      expect(mockRefetch).toHaveBeenCalled();
    });
  });
});
