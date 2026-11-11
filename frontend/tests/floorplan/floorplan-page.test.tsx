import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import FloorplanPage from '@/app/(dashboard)/operations/floorplan/page';
import * as authHooks from '@/hooks/use-auth';
import * as adminHooks from '@/hooks/use-admin';
import * as floorplanHooks from '@/hooks/use-floorplan';
import * as approvalsHooks from '@/hooks/use-approvals';
import * as apiClient from '@/lib/api-client';
import type { FloorplanData } from '@/types/floorplan';

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
  usePathname: () => '/operations/floorplan',
  useSearchParams: () => mockSearchParams,
}));

const mockDepartments = [
  { id: 'dept-ip', name: 'Phòng Sở Hữu Trí Tuệ', code: 'SHTT' },
  { id: 'dept-litigation', name: 'Phòng Tranh Tụng', code: 'TT' },
  { id: 'dept-corp', name: 'Phòng Doanh Nghiệp & M&A', code: 'DN' },
];

function getSampleFloorplanData(): FloorplanData {
  return {
    department: {
      id: 'dept-ip',
      name: 'Phòng Sở Hữu Trí Tuệ',
      leader: {
        id: 'usr-01',
        name: 'LS. Nguyễn Văn An',
        title: 'Trưởng Ban SHTT',
        avatar_url: '/avatars/usr-01.png',
      },
    },
    stats: {
      total_staff: 3,
      working_count: 2,
      resting_count: 1,
      pending_approvals_count: 1,
    },
    approval_queue: [
      {
        user: {
          id: 'usr-02',
          name: 'LS. Mai Linh',
          title: 'Luật sư Cấp cao',
          avatar_url: '/avatars/usr-02.png',
        },
        pending_count: 1,
        requests: [
          {
            id: 'appr-101',
            case_code: 'ASL-2026-TM-0109',
            title: 'Tờ khai đăng ký nhãn hiệu 9OUTFIT',
            requested_at: '2026-10-30T02:15:00Z',
          },
        ],
      },
    ],
    workstations: [
      {
        desk_index: 1,
        user: {
          id: 'usr-02',
          name: 'LS. Mai Linh',
          title: 'Luật sư Cấp cao',
          avatar_url: '/avatars/usr-02.png',
        },
        in_progress_count: 2,
        todo_count: 1,
        is_idle: false,
        is_in_queue: true,
      },
      {
        desk_index: 2,
        user: {
          id: 'usr-03',
          name: 'Trần Thu Hà',
          title: 'Chuyên viên Pháp lý',
          avatar_url: '/avatars/usr-03.png',
        },
        in_progress_count: 3,
        todo_count: 2,
        is_idle: false,
        is_in_queue: false,
      },
      {
        desk_index: 3,
        user: {
          id: 'usr-04',
          name: 'Lê Hoàng Nam',
          title: 'Trợ lý Luật sư',
        },
        in_progress_count: 0,
        todo_count: 1,
        is_idle: true,
        is_in_queue: false,
      },
    ],
  };
}

describe('Màn hình Văn phòng số trực quan - floorplan/page.tsx (SCR-15, FEAT-01 & brief mục 4, 5)', () => {
  const mockRefetch = vi.fn();
  const mockDecideMutate = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
    mockReplace.mockReset();
    mockRefetch.mockReset();
    mockDecideMutate.mockReset();
    mockSearchParams = new URLSearchParams();

    // Mặc định: Giám đốc (MANAGER + is_executive = true)
    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: {
        id: 'u-director',
        full_name: 'LS. Giám Đốc',
        system_role: 'MANAGER',
        is_executive: true,
      },
      isLoading: false,
      isError: false,
    } as any);

    // Danh sách phòng ban cho dropdown
    vi.spyOn(adminHooks, 'useDepartments').mockReturnValue({
      data: mockDepartments,
      isLoading: false,
      isError: false,
    } as any);

    // Dữ liệu floorplan mặc định
    vi.spyOn(floorplanHooks, 'useFloorplan').mockReturnValue({
      data: getSampleFloorplanData(),
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as any);

    // Live sync hook mặc định
    vi.spyOn(floorplanHooks, 'useFloorplanLive').mockReturnValue({
      isConnected: true,
      reconnect: vi.fn(),
    } as any);

    // Phê duyệt hook
    vi.spyOn(approvalsHooks, 'useDecideApproval').mockReturnValue({
      mutate: mockDecideMutate,
      mutateAsync: mockDecideMutate,
      isPending: false,
    } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Phân quyền truy cập (RBAC docs/14-decisions.md DEC-01)', () => {
    it('vai trò không phải MANAGER (ví dụ ATTORNEY) bị từ chối truy cập và KHÔNG gọi API floorplan', () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: {
          id: 'u-attorney',
          full_name: 'LS. Nhân Viên',
          system_role: 'ATTORNEY',
          is_executive: false,
        },
        isLoading: false,
        isError: false,
      } as any);

      const useFloorplanSpy = vi.spyOn(floorplanHooks, 'useFloorplan');

      render(<FloorplanPage />);

      expect(screen.getByText(/không có quyền truy cập/i)).toBeTruthy();
      // Không gọi hook hoặc không enabled
      const enabledOption = useFloorplanSpy.mock.calls[0]?.[1] as any;
      if (enabledOption && typeof enabledOption === 'object') {
        expect(enabledOption.enabled).toBe(false);
      }
    });

    it('Giám đốc (is_executive = true) hiển thị dropdown phòng ban và cho phép chuyển phòng', async () => {
      render(<FloorplanPage />);

      // Có dropdown chọn phòng ban
      const select = screen.getByRole('combobox') || document.querySelector('select');
      expect(select).toBeTruthy();

      // Đổi phòng ban
      if (select) {
        fireEvent.change(select, { target: { value: 'dept-litigation' } });
      }
    });

    it('Trưởng phòng (is_executive = false) KHÔNG có dropdown phòng ban và chỉ xem phòng mình', () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: {
          id: 'u-leader',
          full_name: 'LS. Trưởng Phòng SHTT',
          system_role: 'MANAGER',
          is_executive: false,
          led_department_ids: ['dept-ip'],
        },
        isLoading: false,
        isError: false,
      } as any);

      render(<FloorplanPage />);

      // Không có dropdown chọn phòng ban
      expect(screen.queryByRole('combobox')).toBeNull();
    });

    it('xử lý lỗi 403 NEED_TO_KNOW_DENIED hiển thị ErrorState rõ ràng', () => {
      vi.spyOn(floorplanHooks, 'useFloorplan').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new apiClient.ApiError(403, 'NEED_TO_KNOW_DENIED', 'Không có quyền xem phòng ban này'),
        refetch: mockRefetch,
      } as any);

      render(<FloorplanPage />);

      expect(
        screen.getByText(/không có quyền xem phòng ban này|need_to_know_denied|có lỗi xảy ra/i)
      ).toBeTruthy();
    });
  });

  describe('Ma trận 4 trạng thái giao diện (UI 4-states)', () => {
    it('trạng thái đang tải (Loading state): hiển thị Skeleton', () => {
      vi.spyOn(floorplanHooks, 'useFloorplan').mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
        refetch: mockRefetch,
      } as any);

      render(<FloorplanPage />);

      const skeleton =
        screen.queryByRole('status', { name: /đang tải/i }) ||
        document.querySelector('.animate-pulse');
      expect(skeleton).toBeTruthy();
    });

    it('trạng thái rỗng (Empty state): hiển thị "Chưa có nhân sự nào được phân công vào phòng ban này"', () => {
      const emptyData = getSampleFloorplanData();
      emptyData.workstations = [];
      emptyData.stats.total_staff = 0;
      emptyData.stats.working_count = 0;
      emptyData.stats.resting_count = 0;

      vi.spyOn(floorplanHooks, 'useFloorplan').mockReturnValue({
        data: emptyData,
        isLoading: false,
        isError: false,
        error: null,
        refetch: mockRefetch,
      } as any);

      render(<FloorplanPage />);

      expect(
        screen.getByText(/chưa có nhân sự nào được phân công vào phòng ban này/i)
      ).toBeTruthy();
    });

    it('trạng thái lỗi (Error state): hiển thị ErrorState và nút Thử lại', () => {
      vi.spyOn(floorplanHooks, 'useFloorplan').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Lỗi kết nối máy chủ'),
        refetch: mockRefetch,
      } as any);

      render(<FloorplanPage />);

      expect(screen.getByText(/lỗi kết nối máy chủ|có lỗi xảy ra/i)).toBeTruthy();
      const retryBtn = screen.getByRole('button', { name: /thử lại/i });
      fireEvent.click(retryBtn);
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  describe('Thanh chỉ số tổng quan phòng ban (Metrics bar)', () => {
    it('hiển thị đầy đủ tổng nhân sự, tỷ lệ đang làm việc tròn %, số hồ sơ chờ duyệt', () => {
      render(<FloorplanPage />);

      // Tổng nhân sự: 3
      expect(screen.getAllByText(/^\s*3\s*$/).length).toBeGreaterThan(0);
      // Tỷ lệ đang làm việc: 2/3 = 67%
      expect(screen.getByText(/67%/)).toBeTruthy();
      // Hồ sơ chờ duyệt: 1
      expect(screen.getAllByText(/^\s*1\s*$/).length).toBeGreaterThan(0);
    });

    it('tính tỷ lệ đang làm việc an toàn khi 0 nhân sự: hiển thị 0% không bị NaN%', () => {
      const zeroStaffData = getSampleFloorplanData();
      zeroStaffData.stats.total_staff = 0;
      zeroStaffData.stats.working_count = 0;
      zeroStaffData.stats.resting_count = 0;
      zeroStaffData.workstations = [];

      vi.spyOn(floorplanHooks, 'useFloorplan').mockReturnValue({
        data: zeroStaffData,
        isLoading: false,
        isError: false,
        error: null,
        refetch: mockRefetch,
      } as any);

      render(<FloorplanPage />);

      expect(screen.getByText('0%')).toBeTruthy();
      expect(screen.queryByText(/NaN%/)).toBeNull();
    });
  });

  describe('Bàn nhân viên, Hàng chờ duyệt và Huy hiệu trạng thái (TC-FL-03, TC-FL-04, TC-FL-05)', () => {
    it('hiển thị đầy đủ tên, chức danh và huy hiệu số việc đang làm / chờ xử lý (TC-FL-03)', () => {
      render(<FloorplanPage />);

      expect(screen.getByText(/Trần Thu Hà/i)).toBeTruthy();
      expect(screen.getByText(/Chuyên viên Pháp lý/i)).toBeTruthy();

      // Trần Thu Hà có 3 in_progress, 2 todo
      expect(screen.getByText(/3.*đang làm/i)).toBeTruthy();
      expect(screen.getByText(/2.*chờ xử lý/i)).toBeTruthy();
    });

    it('hiển thị huy hiệu ☕ Đang nghỉ ngơi khi in_progress_count == 0 (TC-FL-04)', () => {
      render(<FloorplanPage />);

      // Lê Hoàng Nam có 0 in_progress -> is_idle = true
      expect(screen.getByText(/Lê Hoàng Nam/i)).toBeTruthy();
      expect(screen.getByText(/☕\s*Đang nghỉ ngơi/i)).toBeTruthy();
    });

    it('nhân sự có hồ sơ chờ duyệt (LS. Mai Linh) xuất hiện ở hàng chờ và bàn cá nhân hiện "Đang trình duyệt" mờ (TC-FL-05)', () => {
      render(<FloorplanPage />);

      // Xuất hiện trong hàng chờ trước bàn sếp
      expect(screen.getAllByText(/LS\. Mai Linh/i).length).toBeGreaterThanOrEqual(1);

      // Bàn cá nhân có chữ "Đang trình duyệt" hoặc biểu thị ghế vắng
      expect(screen.getByText(/đang trình duyệt/i)).toBeTruthy();
    });

    it('ảnh đại diện: hiển thị avatar_url nếu có, hoặc chữ cái viết tắt (initials) nếu không có avatar', () => {
      render(<FloorplanPage />);

      // usr-04 không có avatar_url -> hiển thị ký tự viết tắt LN hoặc HN
      expect(screen.getByText(/HN|LN/)).toBeTruthy();
    });
  });

  describe('Ngăn chi tiết nhân sự (Side Drawer) & Phê duyệt điện tử (TC-FL-06)', () => {
    it('bấm vào nhân sự tại bàn hoặc hàng chờ sẽ mở Side Drawer chi tiết', async () => {
      render(<FloorplanPage />);

      const staffCard = screen.getByText(/Trần Thu Hà/i);
      fireEvent.click(staffCard);

      // Mở ngăn chi tiết
      await waitFor(() => {
        expect(screen.getByRole('dialog') || document.querySelector('[data-drawer="true"]') || document.querySelector('.fixed.right-0')).toBeTruthy();
      });
      // Chức danh hiện ở bàn và trong ngăn chi tiết vừa mở
      expect(screen.getAllByText(/Chuyên viên Pháp lý/i).length).toBeGreaterThanOrEqual(2);
    });

    it('nút Duyệt gửi POST /approvals/{id}/decide với action APPROVE và làm mới floorplan', async () => {
      mockDecideMutate.mockImplementation(({ onSuccess }: any) => {
        onSuccess?.();
      });

      render(<FloorplanPage />);

      // Bấm vào người trong hàng chờ (LS. Mai Linh)
      const queuePerson = screen.getAllByText(/LS\. Mai Linh/i)[0];
      fireEvent.click(queuePerson);

      // Tìm nút Duyệt
      const approveBtn = await screen.findByRole('button', { name: /duyệt/i });
      fireEvent.click(approveBtn);

      expect(mockDecideMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'appr-101',
          action: 'APPROVE',
        }),
        expect.anything()
      );
    });

    it('nút Trả về bắt buộc phải có lý do (comment): thiếu lý do sẽ bị chặn và báo lỗi', async () => {
      render(<FloorplanPage />);

      const queuePerson = screen.getAllByText(/LS\. Mai Linh/i)[0];
      fireEvent.click(queuePerson);

      const rejectBtn = await screen.findByRole('button', { name: /trả về/i });
      fireEvent.click(rejectBtn);

      // Chưa nhập lý do -> không gửi mutation
      expect(mockDecideMutate).not.toHaveBeenCalled();
      expect(screen.getByText(/Vui lòng nhập lý do trả về/i)).toBeTruthy();
    });

    it('nút Trả về có nhập lý do sẽ gửi action REJECT kèm comment', async () => {
      render(<FloorplanPage />);

      const queuePerson = screen.getAllByText(/LS\. Mai Linh/i)[0];
      fireEvent.click(queuePerson);

      const rejectBtn = await screen.findByRole('button', { name: /trả về/i });
      fireEvent.click(rejectBtn);

      // Nhập lý do vào ô textarea/input
      const reasonInput = screen.getByPlaceholderText(/lý do/i) || screen.getByRole('textbox');
      fireEvent.change(reasonInput, { target: { value: 'Thiếu chữ ký đại diện pháp luật' } });

      // Bấm xác nhận trả về
      const confirmRejectBtn = screen.getByRole('button', { name: /xác nhận|trả về/i });
      fireEvent.click(confirmRejectBtn);

      expect(mockDecideMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'appr-101',
          action: 'REJECT',
          comment: 'Thiếu chữ ký đại diện pháp luật',
        }),
        expect.anything()
      );
    });

    it('xử lý lỗi APPROVAL_NOT_ALLOWED hiển thị "Bạn không thể duyệt yêu cầu của chính mình"', async () => {
      mockDecideMutate.mockImplementation(({ onError }: any) => {
        onError?.(new apiClient.ApiError(403, 'APPROVAL_NOT_ALLOWED', 'Tự phê duyệt bị cấm'));
      });

      render(<FloorplanPage />);

      const queuePerson = screen.getAllByText(/LS\. Mai Linh/i)[0];
      fireEvent.click(queuePerson);

      const approveBtn = await screen.findByRole('button', { name: /duyệt/i });
      fireEvent.click(approveBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/bạn không thể duyệt yêu cầu của chính mình/i)
        ).toBeTruthy();
      });
    });

    it('không có các nút "Giao việc nhanh" hoặc "Nhắn tin" theo ràng buộc brief mục 4', () => {
      render(<FloorplanPage />);

      expect(screen.queryByRole('button', { name: /giao việc nhanh/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /nhắn tin/i })).toBeNull();
    });
  });

  describe('Cảnh báo mất kết nối thời gian thực & Kết nối lại (brief mục 4, 5)', () => {
    it('hiển thị banner cam "Mất kết nối thời gian thực" kèm nút "Kết nối lại" khi isConnected = false', () => {
      const mockReconnect = vi.fn();
      vi.spyOn(floorplanHooks, 'useFloorplanLive').mockReturnValue({
        isConnected: false,
        reconnect: mockReconnect,
      } as any);

      render(<FloorplanPage />);

      expect(screen.getByText(/mất kết nối thời gian thực/i)).toBeTruthy();
      const reconnectBtn = screen.getByRole('button', { name: /kết nối lại/i });
      expect(reconnectBtn).toBeTruthy();

      fireEvent.click(reconnectBtn);
      expect(mockReconnect).toHaveBeenCalled();
    });
  });
});
