import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useRevenueReport,
  useCommissionsReport,
  useOperationsReport,
  exportReportExcel,
} from '@/hooks/use-reports';
import * as apiClient from '@/lib/api-client';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('Hooks quản lý dữ liệu Báo cáo & Thống kê - hooks/use-reports.ts (brief mục 4 & 5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('useRevenueReport: truy vấn dữ liệu Doanh thu thực thu', () => {
    it('gọi đúng endpoint GET /reports/revenue kèm tham số from, to, group_by', async () => {
      const mockData = {
        summary: {
          received_total: '5280000000',
          contract_value_total: '7400000000',
          collection_rate_pct: '71.35',
          payment_count: 46,
        },
        by_period: [{ period: '2026-10', received_total: '1840000000' }],
        by_department: [{ department: { id: 'd1', name: 'Phòng Sở Hữu Trí Tuệ' }, received_total: '790000000' }],
        by_matter_type: [{ matter_type: { code: 'TM', name: 'Nhãn hiệu' }, received_total: '420000000', contract_value_total: '610000000' }],
        meta: { scope: 'DEPARTMENT', departments: [{ id: 'd1', name: 'Phòng Sở Hữu Trí Tuệ' }], from: '2026-10-01', to: '2026-11-11' },
      };

      const spyApi = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockData);

      const params = {
        from: '2026-10-01',
        to: '2026-11-11',
        group_by: 'month' as const,
      };

      const { result } = renderHook(() => useRevenueReport(params), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(spyApi).toHaveBeenCalledTimes(1);
      const calledUrl = spyApi.mock.calls[0][0];
      expect(calledUrl).toContain('/reports/revenue');
      expect(calledUrl).toContain('from=2026-10-01');
      expect(calledUrl).toContain('to=2026-11-11');
      expect(calledUrl).toContain('group_by=month');
      // Không gửi department_id khi không chọn
      expect(calledUrl).not.toContain('department_id=');

      expect(result.current.data).toEqual(mockData);
    });

    it('gửi department_id khi được chọn trong bộ lọc', async () => {
      const spyApi = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({
        summary: { received_total: '0', contract_value_total: '0', collection_rate_pct: '0.00', payment_count: 0 },
        by_period: [],
        by_department: [],
        by_matter_type: [],
        meta: { scope: 'DEPARTMENT', departments: [], from: '2026-10-01', to: '2026-11-11' },
      });

      const params = {
        from: '2026-10-01',
        to: '2026-11-11',
        department_id: 'dept-ip',
      };

      const { result } = renderHook(() => useRevenueReport(params), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const calledUrl = spyApi.mock.calls[0][0];
      expect(calledUrl).toContain('department_id=dept-ip');
    });
  });

  describe('useCommissionsReport: truy vấn dữ liệu Báo cáo Hoa hồng (DEC-09 & brief mục 5)', () => {
    it('gọi đúng endpoint GET /reports/commissions kèm các tham số và không gửi payout_status', async () => {
      const mockCommissions = {
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
            user: { id: 'u2', full_name: 'LS. Mai Linh', department_name: 'Phòng Sở Hữu Trí Tuệ' },
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
        ],
        meta: { scope: 'FIRM', departments: [], from: '2026-10-01', to: '2026-11-11' },
      };

      const spyApi = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockCommissions);

      const params = {
        from: '2026-10-01',
        to: '2026-11-11',
        department_id: 'dept-ip',
      };

      const { result } = renderHook(() => useCommissionsReport(params), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(spyApi).toHaveBeenCalledTimes(1);
      const calledUrl = spyApi.mock.calls[0][0];
      expect(calledUrl).toContain('/reports/commissions');
      expect(calledUrl).toContain('from=2026-10-01');
      expect(calledUrl).toContain('to=2026-11-11');
      expect(calledUrl).toContain('department_id=dept-ip');
      // DEC-09: tuyệt đối không gửi payout_status
      expect(calledUrl).not.toContain('payout_status=');
      expect(calledUrl).not.toContain('payout');
      expect(result.current.data).toEqual(mockCommissions);
    });

    it('không gửi payout_status theo tiêu chí nghiệm thu 3 (bỏ trạng thái chi trả)', async () => {
      const spyApi = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({
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
        meta: { scope: 'FIRM', departments: [], from: '2026-10-01', to: '2026-11-11' },
      });

      const params = {
        from: '2026-10-01',
        to: '2026-11-11',
      };

      const { result } = renderHook(() => useCommissionsReport(params), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const calledUrl = spyApi.mock.calls[0][0];
      expect(calledUrl).not.toContain('payout_status');
      expect(calledUrl).not.toContain('disburs');
    });
  });

  describe('useOperationsReport: truy vấn dữ liệu Báo cáo Vận hành', () => {
    it('gọi đúng endpoint GET /reports/operations', async () => {
      const mockOperations = {
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
          scope: 'DEPARTMENT',
          departments: [{ id: 'd1', name: 'Phòng Sở Hữu Trí Tuệ' }],
          from: '2026-10-01',
          to: '2026-11-11',
        },
      };

      const spyApi = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockOperations);

      const params = {
        from: '2026-10-01',
        to: '2026-11-11',
      };

      const { result } = renderHook(() => useOperationsReport(params), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(spyApi).toHaveBeenCalledTimes(1);
      const calledUrl = spyApi.mock.calls[0][0];
      expect(calledUrl).toContain('/reports/operations');
      expect(result.current.data).toEqual(mockOperations);
    });
  });

  describe('exportReportExcel: xử lý tải file Excel báo cáo', () => {
    let originalCreateObjectURL: typeof URL.createObjectURL;
    let originalRevokeObjectURL: typeof URL.revokeObjectURL;

    beforeEach(() => {
      originalCreateObjectURL = URL.createObjectURL;
      originalRevokeObjectURL = URL.revokeObjectURL;
      URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/test-uuid');
      URL.revokeObjectURL = vi.fn();
    });

    it('gọi fetch đúng URL và tên file trích xuất từ Content-Disposition (filename*=UTF-8)', async () => {
      const mockBlob = new Blob(['dummy excel binary'], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const mockHeaders = new Headers();
      mockHeaders.set(
        'Content-Disposition',
        "attachment; filename*=UTF-8''bao-cao-doanh-thu-t10.xlsx"
      );

      const mockResponse = {
        ok: true,
        status: 200,
        headers: mockHeaders,
        blob: vi.fn().mockResolvedValue(mockBlob),
      } as unknown as Response;

      const spyFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const clickSpy = vi.fn();
      const appendChildSpy = vi.spyOn(document.body, 'appendChild');
      const removeChildSpy = vi.spyOn(document.body, 'removeChild');

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        const el = originalCreateElement(tagName);
        if (tagName.toLowerCase() === 'a') {
          el.click = clickSpy;
        }
        return el;
      });

      await exportReportExcel('revenue', {
        from: '2026-10-01',
        to: '2026-11-11',
        group_by: 'month',
      });

      expect(spyFetch).toHaveBeenCalled();
      const fetchUrl = spyFetch.mock.calls[0][0] as string;
      expect(fetchUrl).toContain('/reports/revenue/export');
      expect(fetchUrl).toContain('from=2026-10-01');
      expect(fetchUrl).toContain('to=2026-11-11');

      expect(URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
      expect(clickSpy).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/test-uuid');

      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
    });

    it('khi không có Content-Disposition, tự sinh tên từ exportFilename', async () => {
      const mockBlob = new Blob(['data'], { type: 'application/octet-stream' });
      const mockHeaders = new Headers();

      const mockResponse = {
        ok: true,
        status: 200,
        headers: mockHeaders,
        blob: vi.fn().mockResolvedValue(mockBlob),
      } as unknown as Response;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      let createdAnchor: HTMLAnchorElement | null = null;
      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        const el = originalCreateElement(tagName);
        if (tagName.toLowerCase() === 'a') {
          createdAnchor = el as HTMLAnchorElement;
          el.click = vi.fn();
        }
        return el;
      });

      await exportReportExcel('commissions', {
        from: '2026-01-01',
        to: '2026-03-31',
      });

      expect(createdAnchor).not.toBeNull();
      const anchor = createdAnchor as unknown as HTMLAnchorElement;
      expect(anchor.download).toBe('bao-cao-commissions-2026-01-01-2026-03-31.xlsx');
    });

    it('khi máy chủ trả về lỗi (không 200/ok), ném ngoại lệ hoặc trả về lỗi', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue({ message: 'Internal Server Error' }),
      } as unknown as Response;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      await expect(
        exportReportExcel('revenue', { from: '2026-10-01', to: '2026-11-11' })
      ).rejects.toThrow();
    });
  });
});
