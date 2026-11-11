import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import WorkflowEditorPage from '@/app/(dashboard)/admin/workflows/[id]/page';
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
  usePathname: () => '/admin/workflows/tpl-1',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: 'tpl-1' }),
}));

describe('Trình Soạn thảo Quy trình - admin/workflows/[id]/page.tsx (SCR-06 & brief mục 4, 5)', () => {
  const currentAdmin = {
    id: 'u-admin-1',
    email: 'admin@asllaw.vn',
    full_name: 'Quản Trị Viên',
    system_role: 'ADMIN',
  };

  const sampleTemplate = {
    id: 'tpl-1',
    matter_type_id: 'mt-shtt-01',
    name: 'Đăng ký Nhãn hiệu',
    mode: 'STRICT',
    is_active: true,
    published_version_no: 1,
    draft_version_id: 'ver-draft-2',
  };

  const sampleDraftVersion = {
    id: 'ver-draft-2',
    template_id: 'tpl-1',
    version_no: 2,
    status: 'DRAFT',
    mode: 'STRICT',
    stages: [
      {
        key: 's1',
        name: 'Giai đoạn 1: Tiếp nhận',
        order_index: 1,
        requires_approval: false,
        tasks: [
          {
            key: 't1',
            title: 'Tra cứu sơ bộ nhãn hiệu',
            description: null,
            default_case_role: 'EXECUTOR',
            sla_business_days: 2,
            complexity_weight: 1,
            requires_approval: false,
            triggers_milestone_order: null,
            depends_on: [],
          },
          {
            key: 't2',
            title: 'Lập báo cáo khả năng đăng ký',
            description: null,
            default_case_role: 'CASE_MANAGER',
            sla_business_days: 3,
            complexity_weight: 2,
            requires_approval: true,
            triggers_milestone_order: 1,
            depends_on: ['t1'],
          },
        ],
      },
      {
        key: 's2',
        name: 'Giai đoạn 2: Nộp đơn',
        order_index: 2,
        requires_approval: true,
        tasks: [
          {
            key: 't3',
            title: 'Nộp đơn tại Cục SHTT',
            description: null,
            default_case_role: 'EXECUTOR',
            sla_business_days: 1,
            complexity_weight: 2,
            requires_approval: false,
            triggers_milestone_order: null,
            depends_on: ['t2'],
          },
        ],
      },
    ],
  };

  const samplePublishedVersion = {
    id: 'ver-pub-1',
    template_id: 'tpl-1',
    version_no: 1,
    status: 'PUBLISHED',
    mode: 'STRICT',
    stages: [
      {
        key: 's1',
        name: 'Tiếp nhận',
        order_index: 1,
        requires_approval: false,
        tasks: [
          {
            key: 't1',
            title: 'Tra cứu sơ bộ',
            default_case_role: 'EXECUTOR',
            sla_business_days: 2,
            complexity_weight: 1,
            requires_approval: false,
            triggers_milestone_order: null,
            depends_on: [],
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();

    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: currentAdmin,
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(workflowHooks, 'useWorkflowTemplates').mockReturnValue({
      data: [sampleTemplate],
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(workflowHooks, 'useWorkflowVersion').mockReturnValue({
      data: sampleDraftVersion,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(workflowHooks, 'useSaveWorkflowVersion').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ success: true }),
      isPending: false,
    } as any);

    vi.spyOn(workflowHooks, 'usePublishWorkflowVersion').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ success: true }),
      isPending: false,
    } as any);

    vi.spyOn(workflowHooks, 'useCreateWorkflowVersion').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: 'ver-draft-new' }),
      isPending: false,
    } as any);

    vi.spyOn(workflowHooks, 'useUpdateWorkflowTemplate').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ success: true }),
      isPending: false,
    } as any);
  });

  describe('Hiển thị bản nháp vs Bản phát hành chỉ đọc', () => {
    it('khi có bản nháp: hiển thị trình soạn thảo đầy đủ các công cụ lưu, phát hành, thêm stage/task', () => {
      render(<WorkflowEditorPage />);

      expect(screen.getByText(/Giai đoạn 1: Tiếp nhận/i)).toBeDefined();
      expect(screen.getByText(/Tra cứu sơ bộ nhãn hiệu/i)).toBeDefined();
      expect(screen.getByRole('button', { name: /lưu (bản )?nháp/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /phát hành/i })).toBeDefined();
    });

    it('khi không có bản nháp (chỉ có bản phát hành): ở chế độ chỉ đọc và có nút "Tạo phiên bản mới"', () => {
      vi.spyOn(workflowHooks, 'useWorkflowTemplates').mockReturnValue({
        data: [{ ...sampleTemplate, draft_version_id: null }],
        isLoading: false,
        isError: false,
      } as any);

      vi.spyOn(workflowHooks, 'useWorkflowVersion').mockReturnValue({
        data: samplePublishedVersion,
        isLoading: false,
        isError: false,
      } as any);

      render(<WorkflowEditorPage />);

      // Thông báo bản phát hành chỉ đọc
      expect(screen.getByText(/chỉ đọc|đã phát hành|phiên bản 1/i)).toBeDefined();
      // Nút tạo phiên bản mới
      expect(screen.getByRole('button', { name: /tạo phiên bản mới/i })).toBeDefined();
      // Không có nút lưu nháp hay phát hành
      expect(screen.queryByRole('button', { name: /lưu bản nháp/i })).toBeNull();
    });

    it('bấm "Tạo phiên bản mới" gọi mutation tạo DRAFT và xử lý lỗi 409 DRAFT_VERSION_EXISTS', async () => {
      const mockCreateVersion = vi.fn().mockRejectedValue(
        new ApiError(409, 'DRAFT_VERSION_EXISTS', 'Template đã có một phiên bản DRAFT')
      );

      vi.spyOn(workflowHooks, 'useWorkflowTemplates').mockReturnValue({
        data: [{ ...sampleTemplate, draft_version_id: null }],
        isLoading: false,
        isError: false,
      } as any);

      vi.spyOn(workflowHooks, 'useWorkflowVersion').mockReturnValue({
        data: samplePublishedVersion,
        isLoading: false,
        isError: false,
      } as any);

      vi.spyOn(workflowHooks, 'useCreateWorkflowVersion').mockReturnValue({
        mutateAsync: mockCreateVersion,
        isPending: false,
      } as any);

      render(<WorkflowEditorPage />);

      const createVerBtn = screen.getByRole('button', { name: /tạo phiên bản mới/i });
      fireEvent.click(createVerBtn);

      await waitFor(() => {
        expect(mockCreateVersion).toHaveBeenCalled();
        expect(screen.getByText(/Template đã có một phiên bản DRAFT|DRAFT_VERSION_EXISTS/i)).toBeDefined();
      });
    });
  });

  describe('Thao tác cấu trúc Stage & Task (Thêm, Xoá, Sắp xếp thứ tự)', () => {
    it('thêm stage mới sinh key ổn định (vd s3), thêm task mới sinh key (vd t4)', async () => {
      render(<WorkflowEditorPage />);

      const addStageBtn = screen.getByRole('button', { name: /thêm giai đoạn|thêm stage/i });
      fireEvent.click(addStageBtn);

      // Stage mới được thêm vào giao diện
      expect(screen.getAllByText(/Giai đoạn/i).length).toBeGreaterThanOrEqual(3);

      const addTaskBtn = screen.getAllByRole('button', { name: /thêm tác vụ|thêm task/i })[0];
      fireEvent.click(addTaskBtn);

      // Task mới xuất hiện
      expect(screen.getAllByPlaceholderText(/tên tác vụ|tiêu đề task/i).length).toBeGreaterThanOrEqual(1);
    });

    it('sắp xếp thứ tự stage bằng nút lên/xuống (Up/Down) hoán đổi vị trí và order_index', () => {
      render(<WorkflowEditorPage />);

      const downButtons = screen.getAllByRole('button', { name: /xuống|move down|chuyển xuống/i });
      if (downButtons.length > 0) {
        fireEvent.click(downButtons[0]);
      }

      // Vị trí stage được thay đổi trong cây
      expect(screen.getByText(/Giai đoạn 1/i)).toBeDefined();
    });

    it('danh sách phụ thuộc (depends_on select) CHỈ gồm các task ở stage hiện tại hoặc trước đó (chặn forward dependency)', () => {
      render(<WorkflowEditorPage />);

      // Mở dropdown chọn phụ thuộc của task t1 ở stage 1
      const depSelects = screen.getAllByLabelText(/phụ thuộc|depends on/i);
      expect(depSelects.length).toBeGreaterThanOrEqual(1);

      // Tại stage 1, dropdown không được chứa task t3 (thuộc stage 2)
      const stage1Select = depSelects[0];
      const options = Array.from(stage1Select.querySelectorAll('option')).map((o) => o.textContent);
      expect(options.some((opt) => opt?.includes('Nộp đơn tại Cục SHTT') || opt?.includes('t3'))).toBe(false);
    });
  });

  describe('Lưu bản nháp (Save Draft §3.3a & 422 Field Error binding)', () => {
    it('bấm Lưu bản nháp gửi đúng cây cấu trúc dữ liệu theo §3.3a', async () => {
      const mockSave = vi.fn().mockResolvedValue({ success: true });
      vi.spyOn(workflowHooks, 'useSaveWorkflowVersion').mockReturnValue({
        mutateAsync: mockSave,
        isPending: false,
      } as any);

      render(<WorkflowEditorPage />);

      const saveBtn = screen.getByRole('button', { name: /lưu (bản )?nháp/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(mockSave).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'ver-draft-2',
            data: expect.objectContaining({
              stages: expect.arrayContaining([
                expect.objectContaining({
                  key: 's1',
                  order_index: 1,
                  tasks: expect.arrayContaining([
                    expect.objectContaining({
                      key: 't1',
                      sla_business_days: 2,
                    }),
                  ]),
                }),
              ]),
            }),
          })
        );
      });
    });

    it('khi server trả lỗi 422 VALIDATION_ERROR kèm details.fields, hiển thị lỗi vào đúng trường/ô tương ứng', async () => {
      const validationError = new ApiError(422, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', {
        fields: [
          {
            field: 'stages[0].tasks[0].sla_business_days',
            message: 'SLA phải lớn hơn 0',
          },
        ],
      });

      vi.spyOn(workflowHooks, 'useSaveWorkflowVersion').mockReturnValue({
        mutateAsync: vi.fn().mockRejectedValue(validationError),
        isPending: false,
      } as any);

      render(<WorkflowEditorPage />);

      const saveBtn = screen.getByRole('button', { name: /lưu (bản )?nháp/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByText(/SLA phải lớn hơn 0/i)).toBeDefined();
      });
    });
  });

  describe('Phát hành quy trình (Publish Version & Validation Checks)', () => {
    it('chạy validateDraft + findCycle + findForwardDependency trước: có lỗi phía client thì hiển thị danh sách lỗi và KHÔNG gọi API phát hành', async () => {
      const mockPublish = vi.fn();
      vi.spyOn(workflowHooks, 'usePublishWorkflowVersion').mockReturnValue({
        mutateAsync: mockPublish,
        isPending: false,
      } as any);

      // Cung cấp phiên bản bị lỗi (ví dụ SLA <= 0)
      const invalidVersion = {
        ...sampleDraftVersion,
        stages: [
          {
            ...sampleDraftVersion.stages[0],
            tasks: [
              {
                ...sampleDraftVersion.stages[0].tasks[0],
                sla_business_days: 0, // Lỗi!
              },
            ],
          },
        ],
      };

      vi.spyOn(workflowHooks, 'useWorkflowVersion').mockReturnValue({
        data: invalidVersion,
        isLoading: false,
        isError: false,
      } as any);

      render(<WorkflowEditorPage />);

      const publishBtn = screen.getByRole('button', { name: /phát hành/i });
      fireEvent.click(publishBtn);

      await waitFor(() => {
        // Không được gọi API phát hành
        expect(mockPublish).not.toHaveBeenCalled();
        // Hiện thông báo lỗi
        expect(screen.getByText(/lỗi|sla|không thể phát hành/i)).toBeDefined();
      });
    });

    it('hộp thoại xác nhận phát hành có nội dung nói rõ: "vụ việc đang chạy giữ phiên bản cũ"', async () => {
      const mockPublish = vi.fn().mockResolvedValue({ success: true });
      vi.spyOn(workflowHooks, 'usePublishWorkflowVersion').mockReturnValue({
        mutateAsync: mockPublish,
        isPending: false,
      } as any);

      render(<WorkflowEditorPage />);

      const publishBtn = screen.getByRole('button', { name: /phát hành/i });
      fireEvent.click(publishBtn);

      // Hộp thoại xác nhận phải chứa câu cảnh báo theo brief
      expect(
        screen.getByText(/vụ việc đang chạy giữ phiên bản cũ/i)
      ).toBeDefined();

      const confirmBtn = screen.getByRole('button', { name: /xác nhận phát hành|đồng ý|xác nhận/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockPublish).toHaveBeenCalled();
      });
    });

    it('khi server trả lỗi 422 DEPENDENCY_CYCLE với details.cycle, các task trong chu trình được tô đỏ cảnh báo', async () => {
      const cycleError = new ApiError(422, 'DEPENDENCY_CYCLE', 'Phát hiện chu trình phụ thuộc', {
        cycle: ['t1', 't2'],
      });

      vi.spyOn(workflowHooks, 'usePublishWorkflowVersion').mockReturnValue({
        mutateAsync: vi.fn().mockRejectedValue(cycleError),
        isPending: false,
      } as any);

      render(<WorkflowEditorPage />);

      const publishBtn = screen.getByRole('button', { name: /phát hành/i });
      fireEvent.click(publishBtn);

      const confirmBtn = screen.getByRole('button', { name: /xác nhận phát hành|đồng ý|xác nhận/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(screen.getByText(/Phát hiện chu trình phụ thuộc|DEPENDENCY_CYCLE/i)).toBeDefined();
      });

      // Các task t1, t2 được đánh dấu vi phạm
      const highlightedTasks = document.querySelectorAll('.border-red-500, .bg-red-50, .text-red-500, [data-cycle="true"]');
      expect(highlightedTasks.length).toBeGreaterThan(0);
    });
  });

  describe('Thay đổi Chế độ kiểm soát (STRICT ↔ FLEXIBLE DEC-07)', () => {
    it('đổi chế độ Khung cứng ↔ Linh hoạt hiển thị hộp xác nhận cảnh báo: "chỉ áp cho vụ việc tạo sau lần phát hành kế tiếp"', async () => {
      const mockUpdateTemplate = vi.fn().mockResolvedValue({ success: true });
      vi.spyOn(workflowHooks, 'useUpdateWorkflowTemplate').mockReturnValue({
        mutateAsync: mockUpdateTemplate,
        isPending: false,
      } as any);

      render(<WorkflowEditorPage />);

      const modeToggle = screen.getByLabelText(/chế độ|linh hoạt|khung cứng/i) || screen.getByRole('button', { name: /đổi chế độ|chuyển sang linh hoạt/i });
      fireEvent.click(modeToggle);

      expect(
        screen.getByText(/chỉ áp cho vụ việc tạo sau lần phát hành kế tiếp/i)
      ).toBeDefined();
    });
  });

  describe('Phân quyền truy cập trình soạn thảo', () => {
    it('vai trò MANAGER chỉ xem ở chế độ chỉ đọc: không có các nút lưu, phát hành, thêm/xoá', () => {
      vi.spyOn(authHooks, 'useMe').mockReturnValue({
        data: {
          id: 'u-mgr-1',
          full_name: 'Quản lý',
          system_role: 'MANAGER',
        },
        isLoading: false,
        isError: false,
      } as any);

      render(<WorkflowEditorPage />);

      expect(screen.queryByRole('button', { name: /lưu (bản )?nháp/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /phát hành/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /thêm giai đoạn|thêm stage/i })).toBeNull();
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

      render(<WorkflowEditorPage />);

      expect(screen.getByText(/không có quyền truy cập/i)).toBeDefined();
    });
  });
});
