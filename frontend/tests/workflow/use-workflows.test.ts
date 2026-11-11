import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as apiClient from '@/lib/api-client';
import {
  useWorkflowTemplates,
  useCreateWorkflowTemplate,
  useUpdateWorkflowTemplate,
  useWorkflowVersions,
  useCreateWorkflowVersion,
  useWorkflowVersion,
  useSaveWorkflowVersion,
  usePublishWorkflowVersion,
  useCustomFields,
  useSaveCustomFields,
  useHolidays,
  useSaveHolidays,
} from '@/hooks/use-workflows';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('Hooks quản lý quy trình & cài đặt - use-workflows.ts (brief mục 4, 5 & §3.3a)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('useWorkflowTemplates', () => {
    it('gọi GET /workflows/templates và hỗ trợ lọc theo matter_type_id', async () => {
      const mockTemplates = [
        {
          id: 'tpl-1',
          matter_type_id: 'mt-shtt-01',
          name: 'Quy trình đăng ký nhãn hiệu',
          mode: 'STRICT',
          is_active: true,
          published_version_no: 2,
          draft_version_id: 'ver-draft-1',
        },
      ];

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockTemplates as any);

      const { result } = renderHook(() => useWorkflowTemplates('mt-shtt-01'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\/workflows\/templates(\?.*matter_type_id=mt-shtt-01)?/)
      );
      expect(result.current.data).toEqual(mockTemplates);
    });
  });

  describe('useCreateWorkflowTemplate', () => {
    it('gọi POST /workflows/templates với payload { matter_type_id, name, mode }', async () => {
      const createdTemplate = {
        id: 'tpl-new',
        matter_type_id: 'mt-shtt-01',
        name: 'Đăng ký sáng chế',
        mode: 'STRICT',
        is_active: true,
      };

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(createdTemplate as any);

      const { result } = renderHook(() => useCreateWorkflowTemplate(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        matter_type_id: 'mt-shtt-01',
        name: 'Đăng ký sáng chế',
        mode: 'STRICT',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith(
        expect.stringContaining('/workflows/templates'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            matter_type_id: 'mt-shtt-01',
            name: 'Đăng ký sáng chế',
            mode: 'STRICT',
          }),
        })
      );
    });
  });

  describe('useUpdateWorkflowTemplate', () => {
    it('gọi PATCH /workflows/templates/{id} để cập nhật name, mode hoặc is_active', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ success: true } as any);

      const { result } = renderHook(() => useUpdateWorkflowTemplate(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        id: 'tpl-1',
        data: { mode: 'FLEXIBLE', name: 'Tên mới' },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith(
        expect.stringContaining('/workflows/templates/tpl-1'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ mode: 'FLEXIBLE', name: 'Tên mới' }),
        })
      );
    });
  });

  describe('useWorkflowVersions & useCreateWorkflowVersion', () => {
    it('useWorkflowVersions gọi GET /workflows/templates/{id}/versions', async () => {
      const mockVersions = [
        { id: 'v1', version_no: 1, status: 'PUBLISHED', published_at: '2026-10-01T00:00:00Z' },
        { id: 'v2', version_no: 2, status: 'DRAFT', published_at: null },
      ];

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockVersions as any);

      const { result } = renderHook(() => useWorkflowVersions('tpl-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith(
        expect.stringContaining('/workflows/templates/tpl-1/versions')
      );
      expect(result.current.data).toEqual(mockVersions);
    });

    it('useCreateWorkflowVersion gọi POST /workflows/templates/{id}/versions để tạo bản DRAFT mới', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ id: 'v3-draft' } as any);

      const { result } = renderHook(() => useCreateWorkflowVersion(), {
        wrapper: createWrapper(),
      });

      result.current.mutate('tpl-1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith(
        expect.stringContaining('/workflows/templates/tpl-1/versions'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  describe('useWorkflowVersion & useSaveWorkflowVersion & usePublishWorkflowVersion', () => {
    it('useWorkflowVersion tải cây phiên bản quy trình GET /workflows/versions/{id}', async () => {
      const mockTree = {
        id: 'ver-draft-1',
        template_id: 'tpl-1',
        version_no: 2,
        status: 'DRAFT',
        mode: 'STRICT',
        stages: [
          {
            key: 's1',
            name: 'Giai đoạn 1',
            order_index: 1,
            requires_approval: true,
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

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockTree as any);

      const { result } = renderHook(() => useWorkflowVersion('ver-draft-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith(
        expect.stringContaining('/workflows/versions/ver-draft-1')
      );
      expect(result.current.data).toEqual(mockTree);
    });

    it('useSaveWorkflowVersion gọi PUT /workflows/versions/{id} với toàn bộ cây quy trình', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ success: true } as any);

      const { result } = renderHook(() => useSaveWorkflowVersion(), {
        wrapper: createWrapper(),
      });

      const payload = {
        id: 'ver-draft-1',
        template_id: 'tpl-1',
        version_no: 2,
        status: 'DRAFT' as const,
        mode: 'STRICT' as const,
        stages: [],
      };

      result.current.mutate({ id: 'ver-draft-1', data: payload });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith(
        expect.stringContaining('/workflows/versions/ver-draft-1'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(payload),
        })
      );
    });

    it('usePublishWorkflowVersion gọi POST /workflows/versions/{id}/publish', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ success: true } as any);

      const { result } = renderHook(() => usePublishWorkflowVersion(), {
        wrapper: createWrapper(),
      });

      result.current.mutate('ver-draft-1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith(
        expect.stringContaining('/workflows/versions/ver-draft-1/publish'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  describe('useCustomFields & useSaveCustomFields', () => {
    it('useCustomFields tải danh sách trường động của loại vụ việc', async () => {
      const mockFields = [
        {
          key: 'so_don_dang_ky',
          label: 'Số đơn đăng ký',
          type: 'text',
          required: true,
        },
      ];

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockFields as any);

      const { result } = renderHook(() => useCustomFields('mt-shtt-01'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith(
        expect.stringContaining('/workflows/matter-types/mt-shtt-01/custom-fields')
      );
    });

    it('useSaveCustomFields gọi PUT /workflows/matter-types/{id}/custom-fields', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ success: true } as any);

      const { result } = renderHook(() => useSaveCustomFields(), {
        wrapper: createWrapper(),
      });

      const fieldsPayload = [
        {
          key: 'loai_hinh_doanh_nghiep',
          label: 'Loại hình doanh nghiệp',
          type: 'select' as const,
          required: true,
          options: ['Cổ phần', 'TNHH 1 thành viên', 'TNHH 2 thành viên trở lên'],
        },
      ];

      result.current.mutate({
        matterTypeId: 'mt-corp-01',
        fields: fieldsPayload,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith(
        expect.stringContaining('/workflows/matter-types/mt-corp-01/custom-fields'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ fields: fieldsPayload }),
        })
      );
    });
  });

  describe('useHolidays & useSaveHolidays', () => {
    it('useHolidays gọi GET /settings/holidays?year=2026', async () => {
      const mockHolidays = {
        year: 2026,
        days: [
          { date: '2026-01-01', name: 'Tết Dương Lịch' },
          { date: '2026-04-30', name: 'Giải phóng miền Nam' },
        ],
      };

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockHolidays as any);

      const { result } = renderHook(() => useHolidays(2026), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\/settings\/holidays\?year=2026/)
      );
      expect(result.current.data).toEqual(mockHolidays);
    });

    it('useSaveHolidays gọi PUT /settings/holidays với { year, days: [...] }', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ success: true } as any);

      const { result } = renderHook(() => useSaveHolidays(), {
        wrapper: createWrapper(),
      });

      const holidayPayload = {
        year: 2026,
        days: [
          { date: '2026-01-01', name: 'Tết Dương Lịch' },
          { date: '2026-09-02', name: 'Quốc Khánh' },
        ],
      };

      result.current.mutate(holidayPayload);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith(
        expect.stringContaining('/settings/holidays'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(holidayPayload),
        })
      );
    });
  });
});
