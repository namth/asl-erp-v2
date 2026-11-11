import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { Approval } from '@/types/tasks';

const fallbackQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

function useSafeQueryClient(): QueryClient {
  try {
    return useQueryClient();
  } catch {
    return fallbackQueryClient;
  }
}

export function useApprovals(type?: string) {
  const client = useSafeQueryClient();

  return useQuery(
    {
      queryKey: ['approvals', type],
      queryFn: async () => {
        const searchParams = new URLSearchParams({ status: 'PENDING' });
        if (type) {
          searchParams.set('type', type);
        }
        return apiFetch<Approval[]>(`/approvals?${searchParams.toString()}`);
      },
    },
    client
  );
}

export interface DecideApprovalPayload {
  id: string;
  action: 'APPROVE' | 'REJECT';
  comment?: string;
}

export function useDecideApproval() {
  const client = useSafeQueryClient();

  return useMutation(
    {
      mutationFn: async ({ id, action, comment }: DecideApprovalPayload) => {
        const bodyPayload: { action: 'APPROVE' | 'REJECT'; comment?: string } = { action };
        if (comment !== undefined && comment !== null) {
          bodyPayload.comment = comment;
        }

        return apiFetch<{ success: boolean }>(`/approvals/${id}/decide`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(bodyPayload),
        });
      },
      onSuccess: () => {
        client.invalidateQueries({ queryKey: ['approvals'] });
      },
    },
    client
  );
}
