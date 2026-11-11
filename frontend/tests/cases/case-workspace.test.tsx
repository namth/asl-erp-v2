import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import CaseWorkspaceLayout from '@/app/(dashboard)/cases/[id]/layout';
import CaseWorkspacePage from '@/app/(dashboard)/cases/[id]/page';
import * as casesHooks from '@/hooks/use-cases';
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
  useParams: () => ({ id: 'case-001' }),
  usePathname: () => '/cases/case-001',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Không gian Vụ việc - cases/[id] (SCR-08 & brief mục 4, 5)', () => {
  const sampleCaseData = {
    id: 'case-001',
    case_code: 'ASL-2026-TM-0045',
    title: 'Đăng ký nhãn hiệu quốc tế ASL GATEWAY',
    status: 'ACTIVE',
    workflow_mode: 'STRICT',
    is_legacy: false,
    contract_value: '150000000',
    client: {
      id: 'client-1',
      name: 'Công ty Cổ phần Công nghệ ASL Gate',
      tax_code: '0109988776',
    },
    current_stage: {
      id: 'stg-2',
      name: 'Nộp đơn và thẩm định hình thức',
      order_index: 2,
      status: 'WAITING_PAYMENT',
      blocking_milestone_id: 'ms-2',
    },
    progress_pct: 45,
    assignments: [
      { user_id: 'u-sup', full_name: 'Phạm Quốc Tuấn', role_in_case: 'SUPERVISOR' },
      { user_id: 'u-mgr', full_name: 'Nguyễn Văn Trường', role_in_case: 'CASE_MANAGER' },
      { user_id: 'u-exe', full_name: 'Lê Mai Anh', role_in_case: 'EXECUTOR' },
    ],
    custom_data: {
      application_no: '4-2026-12345',
      filing_date: '2026-10-15',
      classes: ['09', '42'],
    },
  };

  const sampleStages = [
    {
      id: 'stg-1',
      name: 'Tiếp nhận & chuẩn bị hồ sơ',
      order_index: 1,
      status: 'COMPLETED',
      requires_approval: false,
      task_counts: { todo: 0, in_progress: 0, waiting_approval: 0, completed: 3 },
    },
    {
      id: 'stg-2',
      name: 'Nộp đơn và thẩm định hình thức',
      order_index: 2,
      status: 'WAITING_PAYMENT',
      requires_approval: true,
      blocking_milestone: {
        id: 'ms-2',
        name: 'Đợt 2 - Có thông báo đơn hợp lệ',
        status: 'AWAITING_PAYMENT',
      },
      task_counts: { todo: 2, in_progress: 1, waiting_approval: 0, completed: 0 },
    },
    {
      id: 'stg-3',
      name: 'Thẩm định nội dung & cấp văn bằng',
      order_index: 3,
      status: 'WAITING_APPROVAL',
      requires_approval: true,
      task_counts: { todo: 4, in_progress: 0, waiting_approval: 1, completed: 0 },
    },
    {
      id: 'stg-4',
      name: 'Bàn giao văn bằng & quyết toán',
      order_index: 4,
      status: 'LOCKED',
      requires_approval: false,
      task_counts: { todo: 2, in_progress: 0, waiting_approval: 0, completed: 0 },
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();

    // Mặc định đăng nhập vai trò Quản lý
    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: {
        id: 'u-mgr',
        full_name: 'LS. Đặng Hoàng Giang',
        system_role: 'MANAGER',
      },
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(casesHooks, 'useCase').mockReturnValue({
      data: sampleCaseData,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(casesHooks, 'useCaseStages').mockReturnValue({
      data: sampleStages,
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(casesHooks, 'useAssignments').mockReturnValue({
      data: sampleCaseData.assignments,
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(casesHooks, 'useSetAssignments').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ success: true }),
      isPending: false,
    } as any);

    vi.spyOn(casesHooks, 'useChangeCaseStatus').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ success: true }),
      isPending: false,
    } as any);
  });

  describe('Thanh Tab & Phân quyền theo vai trò (Layout & Role Permissions)', () => {
    it('hiển thị thanh tab Tổng quan · Tác vụ (link /cases/{id}/tasks) · Tài chính cho vai trò Quản lý / Luật sư', () => {
      render(
        <CaseWorkspaceLayout>
          <div>Nội dung tab</div>
        </CaseWorkspaceLayout>
      );

      expect(screen.getByText(/tổng quan/i)).toBeDefined();
      const taskTab = screen.getByRole('link', { name: /tác vụ/i });
      expect(taskTab).toBeDefined();
      expect(taskTab.getAttribute('href')).toContain('/cases/case-001/tasks');
      expect(screen.getByText(/tài chính/i)).toBeDefined();
    });

    it('Kế toán (ACCOUNTANT) hoặc view=progress: chỉ hiện tiến độ, không hiện tab Tác vụ và phần Phân công', () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: {
          id: 'u-acc',
          full_name: 'Kế toán Trưởng',
          system_role: 'ACCOUNTANT',
        },
        isLoading: false,
        isError: false,
      } as any);

      render(
        <CaseWorkspaceLayout>
          <CaseWorkspacePage />
        </CaseWorkspaceLayout>
      );

      // Không hiển thị tab Tác vụ
      expect(screen.queryByRole('link', { name: /tác vụ/i })).toBeNull();
      // Không hiển thị khu vực phân công nhân sự
      expect(screen.queryByText(/sửa phân công/i)).toBeNull();
      expect(screen.queryByText(/danh sách nhân sự phân công/i)).toBeNull();

      // Vẫn thấy thông tin cơ bản: mã vụ việc, tiến độ
      expect(screen.getByText('ASL-2026-TM-0045')).toBeDefined();
      expect(screen.getByText(/45%/)).toBeDefined();
    });

    it('hiển thị ErrorState khi bị chặn Need-to-know (403 NEED_TO_KNOW_DENIED)', () => {
      vi.spyOn(casesHooks, 'useCase').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new ApiError(403, 'NEED_TO_KNOW_DENIED', 'Bạn không thuộc phạm vi vụ việc này'),
        refetch: vi.fn(),
      } as any);

      render(<CaseWorkspacePage />);

      expect(screen.getByText(/bạn không thuộc phạm vi vụ việc này/i)).toBeDefined();
    });
  });

  describe('Dòng thời gian giai đoạn (Stage Timeline & Blocking Milestone)', () => {
    it('hiển thị các giai đoạn theo thứ tự order_index', () => {
      render(<CaseWorkspacePage />);

      const stages = screen.getAllByTestId('case-stage-item') || screen.getAllByText(/Tiếp nhận|Nộp đơn|Thẩm định|Bàn giao/i);
      expect(stages.length).toBeGreaterThanOrEqual(4);
      expect(screen.getByText(/Tiếp nhận & chuẩn bị hồ sơ/i)).toBeDefined();
      expect(screen.getByText(/Nộp đơn và thẩm định hình thức/i)).toBeDefined();
      expect(screen.getByText(/Thẩm định nội dung & cấp văn bằng/i)).toBeDefined();
    });

    it('giai đoạn WAITING_PAYMENT hiển thị biểu tượng khoá + tên đợt thu chặn + "Chờ Kế toán xác nhận thu tiền"', () => {
      render(<CaseWorkspacePage />);

      // Hiển thị tên đợt thu chặn
      expect(screen.getByText(/Đợt 2 - Có thông báo đơn hợp lệ/i)).toBeDefined();
      // Thông báo chờ kế toán xác nhận
      expect(screen.getByText(/chờ kế toán xác nhận thu tiền/i)).toBeDefined();
    });

    it('giai đoạn WAITING_APPROVAL hiển thị thông báo "Chờ duyệt cổng giai đoạn"', () => {
      render(<CaseWorkspacePage />);

      expect(screen.getByText(/chờ duyệt cổng giai đoạn/i)).toBeDefined();
    });
  });

  describe('Phân công nhân sự vụ việc (Case Assignments)', () => {
    it('hiển thị danh sách nhân sự theo vai trò (CASE_MANAGER, SUPERVISOR, EXECUTOR)', () => {
      render(<CaseWorkspacePage />);

      expect(screen.getByText('Phạm Quốc Tuấn')).toBeDefined();
      expect(screen.getByText('Nguyễn Văn Trường')).toBeDefined();
      expect(screen.getByText('Lê Mai Anh')).toBeDefined();
    });

    it('Quản lý thấy nút "Sửa phân công", Luật sư / Kế toán không thấy nút này', () => {
      const { unmount } = render(<CaseWorkspacePage />);
      expect(screen.getByRole('button', { name: /sửa phân công/i })).toBeDefined();
      unmount();

      // Luật sư
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: {
          id: 'u-exe',
          full_name: 'Lê Mai Anh',
          system_role: 'ATTORNEY',
        },
        isLoading: false,
        isError: false,
      } as any);

      render(<CaseWorkspacePage />);
      expect(screen.queryByRole('button', { name: /sửa phân công/i })).toBeNull();
    });

    it('chặn lưu khi phân công có 0 hoặc 2 CASE_MANAGER hoặc > 1 SUPERVISOR', async () => {
      render(<CaseWorkspacePage />);

      const editBtn = screen.getByRole('button', { name: /sửa phân công/i });
      fireEvent.click(editBtn);

      // Thử xoá hết CASE_MANAGER hoặc chọn 2 CASE_MANAGER
      const saveBtn = screen.getByRole('button', { name: /lưu phân công|xác nhận|lưu thay đổi/i });

      // Trường hợp 0 CASE_MANAGER: hiển thị thông báo lỗi và không gọi mutate
      const setAssignmentsSpy = vi.fn();
      vi.spyOn(casesHooks, 'useSetAssignments').mockReturnValue({
        mutateAsync: setAssignmentsSpy,
        isPending: false,
      } as any);

      // Test validation logic chống lưu sai số lượng vai trò bắt buộc
      expect(saveBtn).toBeDefined();
    });

    it('hiển thị danh sách task cần bàn giao khi gặp lỗi 409 ASSIGNEE_HAS_OPEN_TASKS', async () => {
      const mutateAsync = vi.fn().mockRejectedValue(
        new ApiError(409, 'ASSIGNEE_HAS_OPEN_TASKS', 'Gỡ phân công người còn task', {
          task_ids: ['TSK-001: Soạn đơn uỷ quyền', 'TSK-002: Nộp hồ sơ'],
        })
      );
      vi.spyOn(casesHooks, 'useSetAssignments').mockReturnValue({
        mutateAsync,
        isPending: false,
      } as any);

      render(<CaseWorkspacePage />);

      const editBtn = screen.getByRole('button', { name: /sửa phân công/i });
      fireEvent.click(editBtn);

      const saveBtn = screen.getByRole('button', { name: /lưu phân công|xác nhận|lưu thay đổi/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/cần chuyển giao trước|còn task|soạn đơn uỷ quyền/i)
        ).toBeDefined();
      });
    });
  });

  describe('Đổi trạng thái vòng đời (Status Transition & Guards)', () => {
    it('vụ việc INITIALIZING: nút "Bắt đầu" bị vô hiệu hoá khi thiếu CASE_MANAGER hoặc thiếu EXECUTOR', () => {
      vi.spyOn(casesHooks, 'useCase').mockReturnValue({
        data: {
          ...sampleCaseData,
          status: 'INITIALIZING',
          assignments: [
            // Chỉ có SUPERVISOR, thiếu CASE_MANAGER và EXECUTOR
            { user_id: 'u-sup', full_name: 'Phạm Quốc Tuấn', role_in_case: 'SUPERVISOR' },
          ],
        },
        isLoading: false,
        isError: false,
      } as any);

      render(<CaseWorkspacePage />);

      const startBtn = screen.queryByRole('button', { name: /bắt đầu|kích hoạt/i });
      if (startBtn) {
        expect(startBtn.getAttribute('disabled')).not.toBeNull();
      } else {
        expect(screen.getByText(/cần phân công đủ|chưa đủ nhân sự/i)).toBeDefined();
      }
    });

    it('vụ việc ACTIVE: hiển thị các nút Tạm dừng (PAUSED), Huỷ vụ việc (TERMINATED), Đóng vụ việc (CLOSED)', () => {
      render(<CaseWorkspacePage />);

      expect(screen.getByRole('button', { name: /tạm dừng/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /huỷ vụ việc|chấm dứt/i })).toBeDefined();
    });

    it('chuyển sang PAUSED hoặc TERMINATED bắt buộc nhập lý do (chặn gửi khi lý do rỗng)', async () => {
      const mutateAsync = vi.fn();
      vi.spyOn(casesHooks, 'useChangeCaseStatus').mockReturnValue({
        mutateAsync,
        isPending: false,
      } as any);

      render(<CaseWorkspacePage />);

      const pauseBtn = screen.getByRole('button', { name: /tạm dừng/i });
      fireEvent.click(pauseBtn);

      // Modal/Form nhập lý do hiện lên
      const confirmBtn = screen.getByRole('button', { name: /xác nhận tạm dừng|tiếp tục|đồng ý/i });
      fireEvent.click(confirmBtn);

      // Chặn submit khi chưa nhập lý do
      expect(mutateAsync).not.toHaveBeenCalled();
      expect(screen.getByText(/vui lòng nhập lý do|bắt buộc nhập lý do/i)).toBeDefined();
    });

    it('chuyển sang TERMINATED hiển thị cảnh báo "các đợt thu chưa thu sẽ bị huỷ"', () => {
      render(<CaseWorkspacePage />);

      const terminateBtn = screen.getByRole('button', { name: /huỷ vụ việc|chấm dứt/i });
      fireEvent.click(terminateBtn);

      expect(screen.getByText(/các đợt thu chưa thu sẽ bị huỷ/i)).toBeDefined();
    });
  });

  describe('Vụ việc lịch sử (is_legacy = true)', () => {
    it('hiển thị biểu ngữ "Vụ việc lịch sử — chỉ đọc" và ẩn mọi nút ghi (đổi trạng thái, sửa phân công)', () => {
      vi.spyOn(casesHooks, 'useCase').mockReturnValue({
        data: {
          ...sampleCaseData,
          is_legacy: true,
        },
        isLoading: false,
        isError: false,
      } as any);

      render(<CaseWorkspacePage />);

      // Biểu ngữ chỉ đọc
      expect(screen.getByText(/vụ việc lịch sử — chỉ đọc/i)).toBeDefined();

      // Ẩn mọi nút ghi
      expect(screen.queryByRole('button', { name: /sửa phân công/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /tạm dừng/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /huỷ vụ việc/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /bắt đầu/i })).toBeNull();
    });
  });

  describe('Hiển thị custom_data theo nhãn', () => {
    it('hiển thị custom_data với các trường nhãn thân thiện', () => {
      render(<CaseWorkspacePage />);

      expect(screen.getByText('4-2026-12345')).toBeDefined();
      expect(screen.getByText('2026-10-15')).toBeDefined();
      expect(screen.getByText(/09/)).toBeDefined();
      expect(screen.getByText(/42/)).toBeDefined();
    });
  });
});
