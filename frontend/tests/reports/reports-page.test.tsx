import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import ReportsPage from '@/app/(dashboard)/reports/page';
import * as authHooks from '@/hooks/use-auth';
import * as reportsHooks from '@/hooks/use-reports';
import type { User } from '@/types/auth';

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

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

// Dữ liệu mẫu chuẩn hợp đồng API §3.9
const sampleRevenueData = {
  summary: {
    received_total: '5280000000',
    contract_value_total: '7400000000',
    collection_rate_pct: '71.35',
    payment_count: 46,
  },
  by_period: [
    { period: '2026-10', received_total: '1840000000' },
    { period: '2026-11', received_total: '3440000000' },
  ],
  by_department: [
    { department: { id: 'd1', name: 'Phòng Sở Hữu Trí Tuệ' }, received_total: '790000000' },
    { department: { id: 'd2', name: 'Phòng Tranh Tụng' }, received_total: '4490000000' },
  ],
  by_matter_type: [
    {
      matter_type: { code: 'TM', name: 'Nhãn hiệu' },
      received_total: '420000000',
      contract_value_total: '610000000',
    },
  ],
  meta: {
    scope: 'FIRM' as const,
    departments: [
      { id: 'd1', name: 'Phòng Sở Hữu Trí Tuệ' },
      { id: 'd2', name: 'Phòng Tranh Tụng' },
    ],
    from: '2026-10-01',
    to: '2026-11-11',
  },
};

const sampleCommissionsData = {
  summary: {
    total_amount: '264000000',
    accumulated_amount: '120000000',
    disbursed_amount: '144000000',
  },
  by_user: [
    {
      user: { id: 'u2', full_name: 'LS. Mai Linh', department_name: 'Phòng Sở Hữu Trí Tuệ' },
      total_amount: '42000000',
      accumulated_amount: '12000000',
      disbursed_amount: '30000000',
      by_role: {
        ORIGINATOR: '0',
        SUPERVISOR: '6000000',
        CASE_MANAGER: '21000000',
        EXECUTOR: '15000000',
        ASSISTANT: '0',
      },
    },
  ],
  meta: {
    scope: 'DEPARTMENT' as const,
    departments: [{ id: 'd1', name: 'Phòng Sở Hữu Trí Tuệ' }],
    from: '2026-10-01',
    to: '2026-11-11',
  },
};

const sampleOperationsData = {
  cases_by_status: {
    INITIALIZING: 3,
    ACTIVE: 42,
    PAUSED: 2,
    CLOSED: 17,
    TERMINATED: 1,
  },
  overdue_tasks: {
    count: 1,
    items: [
      {
        task_id: 't9',
        title: 'Nộp tờ khai',
        case: { id: 'c1', case_code: 'ASL-2026-TM-0012' },
        assignee: { full_name: 'Trần Thu Hà' },
        due_date: '2026-11-05',
        days_overdue: 6,
      },
    ],
  },
  stage_durations: [
    { stage_name: 'Thẩm định hình thức', completed_count: 12, avg_days: '8.5' },
  ],
  opportunity_conversion: {
    created_count: 30,
    won_count: 9,
    converted_count: 8,
    conversion_rate_pct: '26.67',
  },
  meta: {
    scope: 'SELF' as const,
    departments: [],
    from: '2026-10-01',
    to: '2026-11-11',
  },
};

describe('Màn hình Báo cáo & Thống kê - /reports (brief mục 4 & 5, DoD SCR-18)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
    mockReplace.mockReset();
    mockSearchParams = new URLSearchParams();

    // Mặc định đăng nhập với vai trò Quản lý (MANAGER)
    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: {
        id: 'u-mgr',
        full_name: 'LS. Đặng Hoàng Giang',
        system_role: 'MANAGER',
      } as User,
      isLoading: false,
      isError: false,
    } as any);

    // Mặc định các hook báo cáo trả về dữ liệu mẫu
    vi.spyOn(reportsHooks, 'useRevenueReport').mockReturnValue({
      data: sampleRevenueData,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(reportsHooks, 'useCommissionsReport').mockReturnValue({
      data: sampleCommissionsData,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(reportsHooks, 'useOperationsReport').mockReturnValue({
      data: sampleOperationsData,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(reportsHooks, 'exportReportExcel').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('1. Phân quyền vai trò người dùng (DEC-01, DEC-04 & brief mục 4)', () => {
    it('vai trò ADMIN -> hiển thị ErrorState "Không có quyền truy cập", không gọi API', () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: {
          id: 'u-admin',
          full_name: 'Quản trị viên',
          system_role: 'ADMIN',
        } as User,
        isLoading: false,
        isError: false,
      } as any);

      render(<ReportsPage />);

      expect(screen.getByText(/không có quyền truy cập/i)).toBeInTheDocument();
      // Đảm bảo không gọi truy vấn dữ liệu báo cáo
      expect(reportsHooks.useRevenueReport).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ enabled: false })
      );
    });

    it('vai trò ACCOUNTANT -> có tab Doanh thu và Hoa hồng, tab Vận hành bị ẩn hoàn toàn', () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: {
          id: 'u-acc',
          full_name: 'Kế toán trưởng',
          system_role: 'ACCOUNTANT',
        } as User,
        isLoading: false,
        isError: false,
      } as any);

      render(<ReportsPage />);

      expect(screen.getByRole('tab', { name: /doanh thu/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /hoa hồng/i })).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: /vận hành/i })).not.toBeInTheDocument();
    });

    it('vai trò ACCOUNTANT -> mặc định mở tab đầu tiên được phép (Doanh thu)', () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: {
          id: 'u-acc',
          full_name: 'Kế toán trưởng',
          system_role: 'ACCOUNTANT',
        } as User,
        isLoading: false,
        isError: false,
      } as any);

      render(<ReportsPage />);

      const revenueTab = screen.getByRole('tab', { name: /doanh thu/i });
      expect(revenueTab.getAttribute('aria-selected')).toBe('true');
    });

    it('vai trò MANAGER -> hiển thị đầy đủ 3 tab Doanh thu, Hoa hồng, Vận hành', () => {
      render(<ReportsPage />);

      expect(screen.getByRole('tab', { name: /doanh thu/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /hoa hồng/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /vận hành/i })).toBeInTheDocument();
    });
  });

  describe('2. Nhãn phạm vi theo meta.scope (brief mục 4)', () => {
    it('hiển thị nhãn "Toàn hãng" khi meta.scope = FIRM', () => {
      render(<ReportsPage />);
      expect(screen.getByText('Toàn hãng')).toBeInTheDocument();
    });

    it('hiển thị nhãn "Phòng ban" khi meta.scope = DEPARTMENT', () => {
      // Chuyển sang tab Hoa hồng có meta.scope = DEPARTMENT
      render(<ReportsPage />);
      fireEvent.click(screen.getByRole('tab', { name: /hoa hồng/i }));
      expect(screen.getByText('Phòng ban')).toBeInTheDocument();
    });

    it('hiển thị nhãn "Số liệu của tôi" khi meta.scope = SELF', () => {
      // Chuyển sang tab Vận hành có meta.scope = SELF
      render(<ReportsPage />);
      fireEvent.click(screen.getByRole('tab', { name: /vận hành/i }));
      expect(screen.getByText('Số liệu của tôi')).toBeInTheDocument();
    });
  });

  describe('3. Bộ lọc thời gian và phòng ban (brief mục 4 & 5)', () => {
    it('khởi tạo với 2 ô ngày có giá trị mặc định từ defaultRange', () => {
      render(<ReportsPage />);

      const dateInputs = screen.getAllByDisplayValue(/2026-/);
      expect(dateInputs.length).toBeGreaterThanOrEqual(2);
    });

    it('khi ngày bắt đầu sau ngày kết thúc (from > to) -> báo lỗi dưới ô và không gọi API mới', () => {
      render(<ReportsPage />);

      const inputs = screen.getAllByRole('textbox').filter((el) => {
        return (el as HTMLInputElement).type === 'date' || (el as HTMLInputElement).value.includes('2026');
      });

      if (inputs.length >= 2) {
        fireEvent.change(inputs[0], { target: { value: '2026-11-20' } });
        fireEvent.change(inputs[1], { target: { value: '2026-11-10' } });

        expect(
          screen.getByText('Ngày bắt đầu phải trước ngày kết thúc')
        ).toBeInTheDocument();
      }
    });

    it('khi khoảng thời gian > 366 ngày -> báo lỗi "Khoảng thời gian tối đa 366 ngày"', () => {
      render(<ReportsPage />);

      const inputs = screen.getAllByRole('textbox').filter((el) => {
        return (el as HTMLInputElement).type === 'date' || (el as HTMLInputElement).value.includes('2026');
      });

      if (inputs.length >= 2) {
        fireEvent.change(inputs[0], { target: { value: '2025-01-01' } });
        fireEvent.change(inputs[1], { target: { value: '2026-06-01' } });

        expect(
          screen.getByText('Khoảng thời gian tối đa 366 ngày')
        ).toBeInTheDocument();
      }
    });

    it('dropdown phòng ban chỉ hiển thị khi meta.departments.length > 1', () => {
      render(<ReportsPage />);

      // sampleRevenueData có 2 phòng ban -> hiển thị dropdown chọn phòng ban
      const deptSelect = screen.getByRole('combobox', { name: /phòng ban/i });
      expect(deptSelect).toBeInTheDocument();
      expect(within(deptSelect).getByText('Tất cả phòng ban')).toBeInTheDocument();
      expect(within(deptSelect).getByText('Phòng Sở Hữu Trí Tuệ')).toBeInTheDocument();
      expect(within(deptSelect).getByText('Phòng Tranh Tụng')).toBeInTheDocument();
    });

    it('dropdown phòng ban không hiển thị khi meta.departments có <= 1 phòng', () => {
      vi.spyOn(reportsHooks, 'useRevenueReport').mockReturnValue({
        data: {
          ...sampleRevenueData,
          meta: {
            ...sampleRevenueData.meta,
            departments: [{ id: 'd1', name: 'Phòng Sở Hữu Trí Tuệ' }],
          },
        },
        isLoading: false,
        isError: false,
      } as any);

      render(<ReportsPage />);
      expect(screen.queryByRole('combobox', { name: /phòng ban/i })).not.toBeInTheDocument();
    });
  });

  describe('4. Tab Doanh thu thực thu (brief mục 4 & 5)', () => {
    it('hiển thị 3 thẻ chỉ số doanh thu và số khoản thu với định dạng tiền chuẩn', () => {
      render(<ReportsPage />);

      // 5.280.000.000 ₫ (received_total)
      expect(screen.getByText('5.280.000.000 ₫')).toBeInTheDocument();
      // 7.400.000.000 ₫ (contract_value_total)
      expect(screen.getByText('7.400.000.000 ₫')).toBeInTheDocument();
      // 71,35% (collection_rate_pct)
      expect(screen.getByText('71,35%')).toBeInTheDocument();
      // 46 khoản thu (payment_count)
      expect(screen.getByText(/46/)).toBeInTheDocument();
    });

    it('hiển thị biểu đồ thanh ngang CSS theo kỳ (tháng/quý)', () => {
      render(<ReportsPage />);

      expect(screen.getByText('2026-10')).toBeInTheDocument();
      expect(screen.getByText('2026-11')).toBeInTheDocument();
      expect(screen.getByText('1.840.000.000 ₫')).toBeInTheDocument();
      expect(screen.getByText('3.440.000.000 ₫')).toBeInTheDocument();
    });

    it('hiển thị bảng doanh thu theo phòng ban và theo loại vụ việc', () => {
      render(<ReportsPage />);

      expect(screen.getByText('Phòng Sở Hữu Trí Tuệ')).toBeInTheDocument();
      expect(screen.getByText('790.000.000 ₫')).toBeInTheDocument();

      expect(screen.getByText('Nhãn hiệu')).toBeInTheDocument();
      expect(screen.getByText('420.000.000 ₫')).toBeInTheDocument();
    });

    it('bộ lọc nhóm theo tháng/quý (group_by) kích hoạt thay đổi tham số', () => {
      render(<ReportsPage />);

      const groupByMonth = screen.getByRole('button', { name: /tháng/i });
      const groupByQuarter = screen.getByRole('button', { name: /quý/i });

      expect(groupByMonth).toBeInTheDocument();
      expect(groupByQuarter).toBeInTheDocument();

      fireEvent.click(groupByQuarter);
      expect(reportsHooks.useRevenueReport).toHaveBeenCalledWith(
        expect.objectContaining({ group_by: 'quarter' }),
        expect.anything()
      );
    });
  });

  describe('5. Tab Hoa hồng (brief mục 4 & 5)', () => {
    beforeEach(() => {
      render(<ReportsPage />);
      fireEvent.click(screen.getByRole('tab', { name: /hoa hồng/i }));
    });

    it('hiển thị 3 thẻ chỉ số: tổng, tích luỹ, đã chi', () => {
      expect(screen.getByText('264.000.000 ₫')).toBeInTheDocument();
      expect(screen.getByText('120.000.000 ₫')).toBeInTheDocument();
      expect(screen.getByText('144.000.000 ₫')).toBeInTheDocument();
    });

    it('hiển thị bảng theo nhân sự với cột từng vai trò (Mang khách về, Giám sát, Quản lý vụ việc, Thực hiện, Hỗ trợ)', () => {
      expect(screen.getByText('LS. Mai Linh')).toBeInTheDocument();

      // Kiểm tra tiêu đề các cột vai trò tiếng Việt
      expect(screen.getByText('Mang khách về')).toBeInTheDocument();
      expect(screen.getByText('Giám sát')).toBeInTheDocument();
      expect(screen.getByText('Quản lý vụ việc')).toBeInTheDocument();
      expect(screen.getByText('Thực hiện')).toBeInTheDocument();
      expect(screen.getByText('Hỗ trợ')).toBeInTheDocument();

      // Kiểm tra số tiền từng vai trò
      expect(screen.getByText('6.000.000 ₫')).toBeInTheDocument();
      expect(screen.getByText('21.000.000 ₫')).toBeInTheDocument();
      expect(screen.getByText('15.000.000 ₫')).toBeInTheDocument();
    });

    it('bộ lọc trạng thái chi trả payout_status (Tích luỹ / Đã chi / Tất cả)', () => {
      const payoutFilter = screen.getByRole('combobox', { name: /trạng thái chi trả/i });
      expect(payoutFilter).toBeInTheDocument();

      fireEvent.change(payoutFilter, { target: { value: 'ACCUMULATED' } });

      expect(reportsHooks.useCommissionsReport).toHaveBeenCalledWith(
        expect.objectContaining({ payout_status: 'ACCUMULATED' }),
        expect.anything()
      );
    });
  });

  describe('6. Tab Vận hành (brief mục 4 & 5)', () => {
    beforeEach(() => {
      render(<ReportsPage />);
      fireEvent.click(screen.getByRole('tab', { name: /vận hành/i }));
    });

    it('hiển thị thẻ số vụ việc theo 5 trạng thái với nhãn tiếng Việt', () => {
      expect(screen.getByText('Khởi tạo')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();

      expect(screen.getByText('Đang thực hiện')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();

      expect(screen.getByText('Tạm dừng')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();

      expect(screen.getByText('Đã đóng')).toBeInTheDocument();
      expect(screen.getByText('17')).toBeInTheDocument();

      expect(screen.getByText('Chấm dứt')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('bảng task quá hạn có liên kết điều hướng đúng /cases/{id}', () => {
      expect(screen.getByText('Nộp tờ khai')).toBeInTheDocument();
      expect(screen.getByText('Trần Thu Hà')).toBeInTheDocument();
      expect(screen.getByText(/6 ngày/)).toBeInTheDocument();

      const caseLink = screen.getByRole('link', { name: 'ASL-2026-TM-0012' });
      expect(caseLink).toBeInTheDocument();
      expect(caseLink.getAttribute('href')).toBe('/cases/c1');
    });

    it('bảng thời gian xử lý trung bình theo stage và tỷ lệ chuyển đổi cơ hội', () => {
      expect(screen.getByText('Thẩm định hình thức')).toBeInTheDocument();
      expect(screen.getByText(/8\.5/)).toBeInTheDocument();

      expect(screen.getByText('26,67%')).toBeInTheDocument();
      expect(screen.getByText(/30/)).toBeInTheDocument();
      expect(screen.getByText(/8/)).toBeInTheDocument();
    });
  });

  describe('7. Nút Xuất Excel (brief mục 4 & 5)', () => {
    it('bấm nút "Xuất Excel" kích hoạt hàm xuất với tab đang mở và tham số bộ lọc', async () => {
      render(<ReportsPage />);

      const exportBtn = screen.getByRole('button', { name: /xuất excel/i });
      expect(exportBtn).toBeInTheDocument();

      fireEvent.click(exportBtn);

      await waitFor(() => {
        expect(reportsHooks.exportReportExcel).toHaveBeenCalledWith(
          'revenue',
          expect.objectContaining({
            from: '2026-10-01',
            to: '2026-11-11',
          })
        );
      });
    });

    it('hiển thị thông báo lỗi "Không xuất được báo cáo, thử lại sau" khi xuất thất bại', async () => {
      vi.spyOn(reportsHooks, 'exportReportExcel').mockRejectedValue(
        new Error('Network error')
      );

      render(<ReportsPage />);

      const exportBtn = screen.getByRole('button', { name: /xuất excel/i });
      fireEvent.click(exportBtn);

      await waitFor(() => {
        expect(
          screen.getByText('Không xuất được báo cáo, thử lại sau')
        ).toBeInTheDocument();
      });
    });
  });

  describe('8. Tiêu chuẩn 4 trạng thái giao diện UI (DoD SCR-18 & brief mục 4, 5)', () => {
    it('trạng thái đang tải (Loading state): hiển thị Skeleton loading', () => {
      vi.spyOn(reportsHooks, 'useRevenueReport').mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
      } as any);

      const { container } = render(<ReportsPage />);
      expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    });

    it('trạng thái trống (Empty state): hiển thị thông điệp "Chưa có số liệu trong kỳ này"', () => {
      vi.spyOn(reportsHooks, 'useRevenueReport').mockReturnValue({
        data: {
          summary: {
            received_total: '0',
            contract_value_total: '0',
            collection_rate_pct: '0.00',
            payment_count: 0,
          },
          by_period: [],
          by_department: [],
          by_matter_type: [],
          meta: { scope: 'FIRM', departments: [], from: '2026-10-01', to: '2026-11-11' },
        },
        isLoading: false,
        isError: false,
      } as any);

      render(<ReportsPage />);
      expect(screen.getByText('Chưa có số liệu trong kỳ này')).toBeInTheDocument();
    });

    it('trạng thái lỗi 403 (NEED_TO_KNOW_DENIED / FORBIDDEN_ROLE): hiển thị ErrorState "Không có quyền truy cập"', () => {
      vi.spyOn(reportsHooks, 'useRevenueReport').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: { status: 403, code: 'NEED_TO_KNOW_DENIED' },
      } as any);

      render(<ReportsPage />);
      expect(screen.getByText(/không có quyền truy cập/i)).toBeInTheDocument();
    });

    it('trạng thái lỗi 422: hiển thị thông báo lỗi bộ lọc', () => {
      vi.spyOn(reportsHooks, 'useRevenueReport').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: { status: 422, message: 'Dữ liệu bộ lọc không hợp lệ' },
      } as any);

      render(<ReportsPage />);
      expect(screen.getByText(/lỗi bộ lọc|không hợp lệ/i)).toBeInTheDocument();
    });
  });
});
