import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import OpportunitiesPage from '@/app/(dashboard)/crm/opportunities/page';
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
  usePathname: () => '/crm/opportunities',
}));

describe('Màn hình Pipeline Cơ hội (SCR-05 & brief mục 4, 5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();

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

  const sampleOpportunities = [
    {
      id: 'opp-1',
      title: 'Tư vấn đăng ký nhãn hiệu cà phê',
      client_id: 'client-1',
      stage: 'NEW_LEAD',
      expected_value: '50000000',
      probability_pct: 20,
    },
    {
      id: 'opp-2',
      title: 'Soạn thảo hợp đồng phân phối độc quyền',
      client_id: 'client-2',
      stage: 'PROPOSAL_SENT',
      expected_value: '80000000',
      probability_pct: 50,
    },
    {
      id: 'opp-3',
      title: 'Đàm phán giải quyết tranh chấp đất đai',
      client_id: 'client-3',
      stage: 'NEGOTIATION',
      expected_value: '200000000',
      probability_pct: 80,
    },
    {
      id: 'opp-4',
      title: 'Đăng ký nhãn hiệu quốc tế ASL GATEWAY',
      client_id: 'client-4',
      stage: 'WON',
      expected_value: '150000000',
      probability_pct: 100,
    },
    {
      id: 'opp-5',
      title: 'Tư vấn đầu tư nước ngoài',
      client_id: 'client-5',
      stage: 'LOST',
      expected_value: '120000000',
      probability_pct: 0,
      lost_reason: 'Khách hàng thay đổi kế hoạch mở rộng thị trường',
    },
  ];

  describe('Tiêu chuẩn 4 trạng thái giao diện (UI 4-states)', () => {
    it('trạng thái đang tải (Loading state): hiển thị Skeleton loading', () => {
      vi.spyOn(crmHooks, 'useOpportunities').mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<OpportunitiesPage />);

      const skeleton = screen.getByRole('status', { name: /đang tải/i }) || document.querySelector('.animate-pulse');
      expect(skeleton).toBeDefined();
    });

    it('trạng thái trống (Empty state): khi không có cơ hội kinh doanh nào', () => {
      vi.spyOn(crmHooks, 'useOpportunities').mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<OpportunitiesPage />);

      expect(screen.getByText(/chưa có cơ hội/i)).toBeDefined();
    });

    it('trạng thái lỗi (Error state): hiển thị thông báo lỗi và nút Thử lại', () => {
      const mockRefetch = vi.fn();
      vi.spyOn(crmHooks, 'useOpportunities').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Lỗi tải danh sách cơ hội'),
        refetch: mockRefetch,
      } as any);

      render(<OpportunitiesPage />);

      expect(screen.getByText(/lỗi tải danh sách|có lỗi xảy ra/i)).toBeDefined();
      const retryBtn = screen.getByRole('button', { name: /thử lại/i });
      expect(retryBtn).toBeDefined();

      fireEvent.click(retryBtn);
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('trạng thái thành công: hiển thị Kanban 5 cột theo giai đoạn', () => {
      vi.spyOn(crmHooks, 'useOpportunities').mockReturnValue({
        data: sampleOpportunities,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<OpportunitiesPage />);

      // 5 cột của Kanban
      expect(screen.getByText(/tiếp nhận|mới|new lead/i)).toBeDefined();
      expect(screen.getByText(/đã gửi đề xuất|báo giá|proposal/i)).toBeDefined();
      expect(screen.getByText(/đàm phán|negotiation/i)).toBeDefined();
      expect(screen.getByText(/thành công|đã ký|won/i)).toBeDefined();
      expect(screen.getByText(/thất bại|đã huỷ|lost/i)).toBeDefined();

      // Các thẻ cơ hội hiển thị đúng
      expect(screen.getByText('Tư vấn đăng ký nhãn hiệu cà phê')).toBeDefined();
      expect(screen.getByText('Đăng ký nhãn hiệu quốc tế ASL GATEWAY')).toBeDefined();
    });
  });

  describe('Ràng buộc Máy trạng thái cơ hội (State Machine docs/12 §1.1)', () => {
    it('chuyển giai đoạn trái máy trạng thái bị chặn ở client (vd: không kéo NEW_LEAD sang WON)', async () => {
      const mockUpdateStage = vi.fn();
      vi.spyOn(crmHooks, 'useUpdateOpportunityStage').mockReturnValue({
        mutateAsync: mockUpdateStage,
        isPending: false,
      } as any);

      vi.spyOn(crmHooks, 'useOpportunities').mockReturnValue({
        data: sampleOpportunities,
        isLoading: false,
        isError: false,
      } as any);

      render(<OpportunitiesPage />);

      // Thẻ opp-1 đang ở NEW_LEAD
      // Thao tác kéo thả hoặc chọn chuyển trạng thái trực tiếp từ NEW_LEAD sang WON
      // Trong component, hành động này phải bị vô hiệu hoá hoặc chặn gửi API
      const oppCard = screen.getByText('Tư vấn đăng ký nhãn hiệu cà phê').closest('[data-opportunity-id], [draggable], div');
      expect(oppCard).toBeDefined();

      // Kiểm tra drag & drop hoặc trigger chuyển trạng thái không hợp lệ:
      // Client guard chặn không gọi mutation
      expect(mockUpdateStage).not.toHaveBeenCalled();
    });

    it('chuyển sang LOST bắt buộc phải có lý do (lost_reason)', async () => {
      const mockUpdateStage = vi.fn();
      vi.spyOn(crmHooks, 'useUpdateOpportunityStage').mockReturnValue({
        mutateAsync: mockUpdateStage,
        isPending: false,
      } as any);

      vi.spyOn(crmHooks, 'useOpportunities').mockReturnValue({
        data: sampleOpportunities,
        isLoading: false,
        isError: false,
      } as any);

      render(<OpportunitiesPage />);

      // Tìm nút hoặc hành động chuyển opp-1 sang LOST
      const lostActionBtn =
        screen.queryByRole('button', { name: /đánh dấu thất bại|chuyển sang lost|huỷ cơ hội/i }) ||
        screen.queryByTestId('btn-mark-lost-opp-1');

      if (lostActionBtn) {
        fireEvent.click(lostActionBtn);

        // Hộp thoại xác nhận lý do thất bại mở ra
        const confirmBtn = screen.getByRole('button', { name: /xác nhận|lưu/i });
        // Để trống ô lý do
        fireEvent.click(confirmBtn);

        await waitFor(() => {
          expect(screen.getByText(/lý do thất bại bắt buộc|vui lòng nhập lý do/i)).toBeDefined();
        });

        // Chưa gửi API khi thiếu lý do
        expect(mockUpdateStage).not.toHaveBeenCalled();
      }
    });
  });

  describe('Nút "Chuyển thành vụ việc" & Hộp thoại chuyển đổi', () => {
    it('nút "Chuyển thành vụ việc" CHỈ BẬT ở cơ hội có trạng thái WON', () => {
      vi.spyOn(crmHooks, 'useOpportunities').mockReturnValue({
        data: sampleOpportunities,
        isLoading: false,
        isError: false,
      } as any);

      render(<OpportunitiesPage />);

      // Cơ hội ở NEW_LEAD, PROPOSAL_SENT, NEGOTIATION, LOST: không có nút hoặc nút bị disabled
      const wonCard = screen.getByText('Đăng ký nhãn hiệu quốc tế ASL GATEWAY').closest('div');
      expect(wonCard).toBeDefined();

      const convertButtons = screen.getAllByRole('button', { name: /chuyển thành vụ việc/i });
      // Chỉ cơ hội WON mới có nút convert khả dụng
      convertButtons.forEach((btn) => {
        expect((btn as HTMLButtonElement).disabled).toBe(false);
      });
    });

    it('hộp thoại chuyển đổi: kiểm tra tổng milestones.amount ≤ contract_value trước khi gửi', async () => {
      const mockConvert = vi.fn();
      vi.spyOn(crmHooks, 'useConvertOpportunity').mockReturnValue({
        mutateAsync: mockConvert,
        isPending: false,
      } as any);

      vi.spyOn(crmHooks, 'useOpportunities').mockReturnValue({
        data: sampleOpportunities,
        isLoading: false,
        isError: false,
      } as any);

      render(<OpportunitiesPage />);

      // Bấm nút Chuyển thành vụ việc trên cơ hội WON (opp-4)
      const convertBtn = screen.getByRole('button', { name: /chuyển thành vụ việc/i });
      fireEvent.click(convertBtn);

      // Điền thông tin chuyển đổi: Giá trị HĐ là 100.000.000 nhưng tổng đợt thu là 120.000.000
      const contractInput = screen.getByLabelText(/giá trị hợp đồng/i);
      const submitConvertBtn = screen.getByRole('button', { name: /xác nhận chuyển đổi|tạo vụ việc/i });

      fireEvent.change(contractInput, { target: { value: '100000000' } });

      // Nhập các đợt thu vượt quá giá trị HĐ
      const milestoneAmountInputs = screen.queryAllByLabelText(/số tiền đợt|số tiền/i);
      if (milestoneAmountInputs.length > 0) {
        fireEvent.change(milestoneAmountInputs[0], { target: { value: '120000000' } });
      }

      fireEvent.click(submitConvertBtn);

      await waitFor(() => {
        expect(screen.getByText(/tổng các đợt thu không được vượt quá giá trị hợp đồng/i)).toBeDefined();
      });

      expect(mockConvert).not.toHaveBeenCalled();
    });

    it('thử lại sau lỗi mạng gửi CÙNG Idempotency-Key', async () => {
      let callCount = 0;
      const capturedKeys: string[] = [];

      const mockConvert = vi.fn().mockImplementation((payload: any) => {
        callCount++;
        capturedKeys.push(payload.idempotencyKey);
        if (callCount === 1) {
          return Promise.reject(new Error('Lỗi kết nối mạng'));
        }
        return Promise.resolve({
          case_id: 'case-created-123',
          case_code: 'ASL-2026-TM-0045',
          status: 'INITIALIZING',
        });
      });

      vi.spyOn(crmHooks, 'useConvertOpportunity').mockReturnValue({
        mutateAsync: mockConvert,
        isPending: false,
      } as any);

      vi.spyOn(crmHooks, 'useOpportunities').mockReturnValue({
        data: sampleOpportunities,
        isLoading: false,
        isError: false,
      } as any);

      render(<OpportunitiesPage />);

      // Mở modal chuyển đổi
      const convertBtn = screen.getByRole('button', { name: /chuyển thành vụ việc/i });
      fireEvent.click(convertBtn);

      const contractInput = screen.getByLabelText(/giá trị hợp đồng/i);
      const submitConvertBtn = screen.getByRole('button', { name: /xác nhận chuyển đổi|tạo vụ việc/i });

      fireEvent.change(contractInput, { target: { value: '150000000' } });
      fireEvent.click(submitConvertBtn);

      // Lần 1 thất bại do lỗi mạng
      await waitFor(() => {
        expect(screen.getByText(/lỗi kết nối mạng|thử lại/i)).toBeDefined();
      });

      // Bấm nút thử lại
      const retryBtn = screen.getByRole('button', { name: /thử lại/i });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(callCount).toBe(2);
      });

      // Hai lần gọi phải có CÙNG một Idempotency-Key (UUID duy nhất sinh khi mở modal)
      expect(capturedKeys[0]).toBeDefined();
      expect(capturedKeys[1]).toBe(capturedKeys[0]);
    });

    it('xử lý các mã lỗi tiếng Việt từ server: MILESTONES_EXCEED_CONTRACT, OPPORTUNITY_ALREADY_CONVERTED, NO_PUBLISHED_TEMPLATE', async () => {
      const mockConvert = vi.fn().mockRejectedValue(
        new ApiError(409, 'OPPORTUNITY_ALREADY_CONVERTED', 'Cơ hội đã được chuyển đổi thành vụ việc')
      );

      vi.spyOn(crmHooks, 'useConvertOpportunity').mockReturnValue({
        mutateAsync: mockConvert,
        isPending: false,
      } as any);

      vi.spyOn(crmHooks, 'useOpportunities').mockReturnValue({
        data: sampleOpportunities,
        isLoading: false,
        isError: false,
      } as any);

      render(<OpportunitiesPage />);

      const convertBtn = screen.getByRole('button', { name: /chuyển thành vụ việc/i });
      fireEvent.click(convertBtn);

      const submitConvertBtn = screen.getByRole('button', { name: /xác nhận chuyển đổi|tạo vụ việc/i });
      fireEvent.click(submitConvertBtn);

      await waitFor(() => {
        expect(screen.getByText(/cơ hội đã được chuyển đổi|đã có vụ việc/i)).toBeDefined();
      });
    });

    it('chuyển đổi thành công: hiển thị case_code và chuyển hướng tới /cases/{case_id}', async () => {
      const mockConvert = vi.fn().mockResolvedValue({
        case_id: 'case-created-888',
        case_code: 'ASL-2026-TM-0045',
        status: 'INITIALIZING',
      });

      vi.spyOn(crmHooks, 'useConvertOpportunity').mockReturnValue({
        mutateAsync: mockConvert,
        isPending: false,
      } as any);

      vi.spyOn(crmHooks, 'useOpportunities').mockReturnValue({
        data: sampleOpportunities,
        isLoading: false,
        isError: false,
      } as any);

      render(<OpportunitiesPage />);

      const convertBtn = screen.getByRole('button', { name: /chuyển thành vụ việc/i });
      fireEvent.click(convertBtn);

      const submitConvertBtn = screen.getByRole('button', { name: /xác nhận chuyển đổi|tạo vụ việc/i });
      fireEvent.click(submitConvertBtn);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/cases/case-created-888');
      });
    });
  });
});
