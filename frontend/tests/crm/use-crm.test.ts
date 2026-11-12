import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as apiClient from '@/lib/api-client';
import {
  useClients,
  useClient,
  useCreateClient,
  useOpportunities,
  useUpdateOpportunityStage,
  useConvertOpportunity,
} from '@/hooks/use-crm';

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

describe('Hooks dữ liệu CRM - use-crm.ts (TanStack Query & brief mục 4)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('useClients hook', () => {
    it('gọi GET /crm/clients với đầy đủ query parameters (q, category_group, page, limit=20)', async () => {
      const mockResponse = {
        data: [
          {
            id: 'client-1',
            client_type: 'ENTERPRISE',
            name: 'Công ty Cổ phần ASL Tech',
            tax_code: '0109988776',
            phone: '0912345678',
            category_group: 'VIP',
          },
        ],
        meta: { page: 2, limit: 20, total_records: 45, total_pages: 3 },
      };

      const apiListSpy = vi.fn().mockResolvedValue(mockResponse);
      vi.spyOn(apiClient, "apiFetchList").mockImplementation(apiListSpy);
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockResponse as any);

      const { result } = renderHook(
        () => useClients({ q: 'ASL Tech', category_group: 'VIP', page: 2 }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const lastUrl = apiListSpy.mock.calls[0]?.[0] || apiSpy.mock.calls[0]?.[0];
      expect(lastUrl).toMatch(
        /\/crm\/clients\?(?=.*q=ASL\+Tech|q=ASL%20Tech)(?=.*category_group=VIP)(?=.*page=2)(?=.*limit=20)/
      );
      expect(result.current.data).toEqual(mockResponse);
    });

    it('gọi GET /crm/clients với giá trị mặc định khi không truyền filter', async () => {
      const mockResponse = {
        data: [],
        meta: { page: 1, limit: 20, total_records: 0, total_pages: 0 },
      };
      const apiListSpy = vi.fn().mockResolvedValue(mockResponse);
      vi.spyOn(apiClient, "apiFetchList").mockImplementation(apiListSpy);
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockResponse as any);

      const { result } = renderHook(() => useClients(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      const lastUrl = apiListSpy.mock.calls[0]?.[0] || apiSpy.mock.calls[0]?.[0];
      expect(lastUrl).toContain('/crm/clients');
    });
  });

  describe('useClient hook', () => {
    it('gọi GET /crm/clients/{id} để lấy chi tiết khách hàng', async () => {
      const mockClient = {
        id: 'client-123',
        name: 'Tập đoàn Đầu tư Alpha',
        client_type: 'ENTERPRISE',
        tax_code: '0101234567',
        phone: '0909123456',
        address: 'Tầng 10, Toà nhà Keangnam, Hà Nội',
        cases: [
          { id: 'case-1', case_code: 'ASL-2026-TM-001', title: 'Đăng ký nhãn hiệu' },
        ],
      };

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockClient as any);

      const { result } = renderHook(() => useClient('client-123'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(apiSpy).toHaveBeenCalledWith('/crm/clients/client-123');
      expect(result.current.data).toEqual(mockClient);
    });
  });

  describe('useCreateClient mutation', () => {
    it('gọi POST /crm/clients với payload hợp lệ và invalidate danh sách', async () => {
      const newClientPayload = {
        client_type: 'ENTERPRISE' as const,
        name: 'Công ty Cổ phần Tân Thời Đại',
        tax_code: '0109988776',
        phone: '0987654321',
        address: '12 Duy Tân, Cầu Giấy, Hà Nội',
        category_group: 'NEW' as const,
      };

      const mockCreated = { id: 'client-new', ...newClientPayload };
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockCreated as any);

      const { result } = renderHook(() => useCreateClient(), { wrapper: createWrapper() });

      await result.current.mutateAsync(newClientPayload);

      expect(apiSpy).toHaveBeenCalledWith(
        '/crm/clients',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(newClientPayload),
        })
      );
    });
  });

  describe('useOpportunities hook', () => {
    it('gọi GET /crm/opportunities lấy danh sách cơ hội kinh doanh', async () => {
      const mockOpportunities = [
        {
          id: 'opp-1',
          title: 'Tư vấn M&A Bất động sản',
          client_id: 'client-1',
          stage: 'NEW_LEAD',
          expected_value: '500000000',
        },
        {
          id: 'opp-2',
          title: 'Đăng ký bảo hộ nhãn hiệu',
          client_id: 'client-2',
          stage: 'WON',
          expected_value: '150000000',
        },
      ];

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockOpportunities as any);

      const { result } = renderHook(() => useOpportunities(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(apiSpy).toHaveBeenCalledWith(expect.stringContaining('/crm/opportunities'));
      expect(result.current.data).toEqual(mockOpportunities);
    });
  });

  describe('useUpdateOpportunityStage mutation', () => {
    it('gọi PATCH /crm/opportunities/{id} với stage mới và lý do lost_reason nếu chuyển sang LOST', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ success: true } as any);

      const { result } = renderHook(() => useUpdateOpportunityStage(), { wrapper: createWrapper() });

      await result.current.mutateAsync({
        id: 'opp-1',
        stage: 'LOST',
        lost_reason: 'Khách hàng tạm dừng kế hoạch kinh doanh',
      });

      expect(apiSpy).toHaveBeenCalledWith(
        '/crm/opportunities/opp-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            stage: 'LOST',
            lost_reason: 'Khách hàng tạm dừng kế hoạch kinh doanh',
          }),
        })
      );
    });
  });

  describe('useConvertOpportunity mutation & Idempotency-Key', () => {
    it('gọi POST /crm/opportunities/{id}/convert đính kèm header Idempotency-Key dạng UUID', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({
        case_id: 'case-999',
        case_code: 'ASL-2026-TM-0045',
        status: 'INITIALIZING',
      } as any);

      const convertPayload = {
        matter_type_id: 'matter-type-tm',
        title: 'Đăng ký nhãn hiệu ASL GATEWAY',
        contract_value: '150000000',
        milestones: [
          { name: 'Đợt 1 - Ký HĐ', amount: '50000000' },
          { name: 'Đợt 2 - Có đơn hợp lệ', amount: '100000000' },
        ],
      };

      const idempotencyKey = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

      const { result } = renderHook(() => useConvertOpportunity(), { wrapper: createWrapper() });

      await result.current.mutateAsync({
        id: 'opp-won-1',
        data: convertPayload,
        idempotencyKey,
      });

      expect(apiSpy).toHaveBeenCalledWith(
        '/crm/opportunities/opp-won-1/convert',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Idempotency-Key': idempotencyKey,
          }),
        })
      );
    });
  });
});
