import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import {
  AccountingInboxFilters,
  AccountingInboxResponse,
  ConfirmPaymentPayload,
  ConfirmPaymentResponse,
} from '@/types/finance';

export function useAccountingInbox(filters?: AccountingInboxFilters) {
  const params = new URLSearchParams();

  if (filters?.status && filters.status.trim()) {
    params.set('status', filters.status.trim());
  }
  if (filters?.q && filters.q.trim()) {
    params.set('q', filters.q.trim());
  }
  if (filters?.page !== undefined && filters?.page !== null) {
    params.set('page', String(filters.page));
  }
  if (filters?.limit !== undefined && filters?.limit !== null) {
    params.set('limit', String(filters.limit));
  }

  const queryStr = params.toString();
  const endpoint = queryStr ? `/accounting/inbox?${queryStr}` : '/accounting/inbox';

  return useQuery<AccountingInboxResponse>({
    queryKey: ['accounting-inbox', filters],
    queryFn: () => apiFetch<AccountingInboxResponse>(endpoint),
  });
}

export function useConfirmPayment() {
  const queryClient = useQueryClient();

  return useMutation<ConfirmPaymentResponse, Error, ConfirmPaymentPayload>({
    mutationFn: async (payload: ConfirmPaymentPayload) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (payload.idempotency_key) {
        headers['Idempotency-Key'] = payload.idempotency_key;
      }

      return apiFetch<ConfirmPaymentResponse>('/accounting/confirm-payment', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-inbox'] });
    },
  });
}
