import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as apiClient from '@/lib/api-client';
import { useAccountingInbox, useConfirmPayment } from '@/hooks/use-accounting';
import {
  useCommissions,
  useCaseMilestones,
  useCaseCommissionPolicy,
  useUpdateCommissionPolicy,
} from '@/hooks/use-finance';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('Hooks dữ liệu Kế toán & Tài chính (TanStack Query & brief mục 4, 5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('useAccountingInbox hook', () => {
    it('gọi GET /accounting/inbox với đầy đủ query parameters (status, q, page, limit)', async () => {
      const mockResponse = {
        data: [
          {
            milestone_id: 'm-1',
            case: {
              id: 'c-1',
              case_code: 'ASL-2026-LD-0001',
              title: 'Vụ việc Tranh chấp lao động',
              client_name: 'Công ty TNHH SmartLogistics',
            },
            name: 'Đợt 1: Tạm ứng khi ký hợp đồng',
            amount: '60000000',
            received_total: '0',
            remaining: '60000000',
            status: 'AWAITING_PAYMENT',
            awaiting_since: '2026-10-25T08:00:00Z',
            payments: [],
          },
        ],
        meta: { page: 1, limit: 20, total_records: 1, total_pages: 1 },
      };

      const apiListSpy = vi.fn().mockResolvedValue(mockResponse);
      vi.spyOn(apiClient, "apiFetchList").mockImplementation(apiListSpy);
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockResponse as any);

      const { result } = renderHook(
        () => useAccountingInbox({ status: 'AWAITING_PAYMENT', q: 'SmartLogistics', page: 1, limit: 20 }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const lastUrl = apiListSpy.mock.calls[0]?.[0] || apiSpy.mock.calls[0]?.[0];
      expect(lastUrl).toMatch(
        /\/accounting\/inbox\?(?=.*status=AWAITING_PAYMENT)(?=.*q=SmartLogistics)(?=.*page=1)/
      );
      expect(result.current.data).toEqual(mockResponse);
    });

    it('bỏ qua các tham số lọc rỗng khi gọi GET /accounting/inbox', async () => {
      const mockResponse = { data: [], meta: { page: 1, limit: 20, total_records: 0, total_pages: 0 } };
      const apiListSpy = vi.fn().mockResolvedValue(mockResponse);
      vi.spyOn(apiClient, "apiFetchList").mockImplementation(apiListSpy);
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockResponse as any);

      const { result } = renderHook(
        () => useAccountingInbox({ status: '', q: '   ' }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const calledUrl = (apiListSpy.mock.calls[0]?.[0] || apiSpy.mock.calls[0]?.[0]) as string;
      expect(calledUrl).not.toContain('status=');
      expect(calledUrl).not.toContain('q=');
    });
  });

  describe('useConfirmPayment hook', () => {
    it('gọi POST /accounting/confirm-payment kèm header Idempotency-Key và payload chuỗi tiền', async () => {
      const mockResponse = {
        success: true,
        data: {
          milestone_status: 'PARTIALLY_PAID',
          received_total: '30000000',
          remaining: '30000000',
          stage_unblocked: false,
          commissions: [
            { user_id: 'u-orig', role_type: 'ORIGINATOR', amount: '1500000' },
            { user_id: 'u-sup', role_type: 'SUPERVISOR', amount: '840000' },
            { user_id: 'u-mgr', role_type: 'CASE_MANAGER', amount: '1260000' },
            { user_id: 'u-exec', role_type: 'EXECUTOR', task_id: 't-1', amount: '2400000' },
          ],
          execution_carried_forward: '0',
        },
        warnings: [],
      };

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockResponse as any);

      const { result } = renderHook(() => useConfirmPayment(), { wrapper: createWrapper() });

      const payload = {
        milestone_id: '7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e',
        misa_invoice_no: 'HD-2026-00456',
        bank_ref_code: 'FT262991048201',
        received_amount: '30000000',
        notes: 'Khách chuyển trước một phần',
        idempotency_key: '550e8400-e29b-41d4-a716-446655440000',
      };

      await result.current.mutateAsync(payload);

      expect(apiSpy).toHaveBeenCalledWith(
        '/accounting/confirm-payment',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Idempotency-Key': '550e8400-e29b-41d4-a716-446655440000',
          }),
          body: expect.stringContaining('"received_amount":"30000000"'),
        })
      );
    });
  });

  describe('useCommissions hook', () => {
    it('gọi GET /finance/commissions với đầy đủ tham số lọc (case_id, user_id, from, to)', async () => {
      const mockResponse = {
        data: [
          {
            id: 'comm-1',
            case: { id: 'c-1', case_code: 'ASL-2026-LD-0001' },
            milestone: { id: 'm-1', name: 'Đợt 1' },
            user: { id: 'u-1', full_name: 'LS. Đặng Hoàng Giang' },
            role_type: 'ORIGINATOR',
            base_amount: '30000000',
            rate_pct: '5.00',
            amount: '1500000',
            created_at: '2026-10-30T10:00:00Z',
          },
        ],
        summary: {
          total_amount: '1500000',
          by_role: {
            ORIGINATOR: '1500000',
            SUPERVISOR: '0',
            CASE_MANAGER: '0',
            EXECUTOR: '0',
          },
        },
        meta: { page: 1, limit: 20, total_records: 1, total_pages: 1 },
      };

      const apiListSpy = vi.fn().mockResolvedValue(mockResponse);
      vi.spyOn(apiClient, "apiFetchList").mockImplementation(apiListSpy);
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockResponse as any);

      const { result } = renderHook(
        () =>
          useCommissions({
            case_id: 'c-1',
            user_id: 'u-1',
            from: '2026-10-01',
            to: '2026-10-31',
            page: 1,
            limit: 20,
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\/finance\/commissions\?(?=.*case_id=c-1)(?=.*user_id=u-1)(?=.*from=2026-10-01)(?=.*to=2026-10-31)/)
      );
      expect(result.current.data).toEqual(mockResponse);
    });
  });

  describe('useCaseMilestones & useCaseCommissionPolicy hooks', () => {
    it('gọi GET /cases/{id}/milestones để lấy danh sách đợt thu của vụ việc', async () => {
      const mockMilestones = [
        {
          id: 'm-1',
          order_index: 1,
          name: 'Đợt 1: Ký hợp đồng',
          amount: '50000000',
          received_total: '50000000',
          status: 'PAID_CONFIRMED',
        },
        {
          id: 'm-2',
          order_index: 2,
          name: 'Đợt 2: Nộp đơn giải trình',
          amount: '50000000',
          received_total: '0',
          status: 'AWAITING_PAYMENT',
        },
      ];

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockMilestones as any);

      const { result } = renderHook(() => useCaseMilestones('case-uuid-100'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith('/cases/case-uuid-100/milestones');
      expect(result.current.data).toEqual(mockMilestones);
    });

    it('gọi GET /cases/{id}/commission-policy để lấy chính sách hoa hồng của vụ việc', async () => {
      const mockPolicy = {
        originator_rate: '5.00',
        management_rate: '7.00',
        supervisor_share_pct: '40.00',
        execution_rate: '8.00',
        locked_at: null,
      };

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockPolicy as any);

      const { result } = renderHook(() => useCaseCommissionPolicy('case-uuid-100'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith('/cases/case-uuid-100/commission-policy');
      expect(result.current.data).toEqual(mockPolicy);
    });

    it('gọi PUT /cases/{id}/commission-policy để cập nhật 4 tỷ lệ hoa hồng', async () => {
      const updatedPolicy = {
        originator_rate: '6.00',
        management_rate: '8.00',
        supervisor_share_pct: '35.00',
        execution_rate: '10.00',
        locked_at: null,
      };

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(updatedPolicy as any);

      const { result } = renderHook(() => useUpdateCommissionPolicy('case-uuid-100'), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync({
        originator_rate: '6.00',
        management_rate: '8.00',
        supervisor_share_pct: '35.00',
        execution_rate: '10.00',
      });

      expect(apiSpy).toHaveBeenCalledWith(
        '/cases/case-uuid-100/commission-policy',
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('"originator_rate":"6.00"'),
        })
      );
    });
  });
});
