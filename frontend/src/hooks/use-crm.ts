import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchList } from '@/lib/api-client';
import {
  Client,
  ClientsResponse,
  ClientFilterParams,
  CreateClientPayload,
  Opportunity,
  UpdateOpportunityStagePayload,
  ConvertOpportunityParams,
  ConvertOpportunityResponse,
} from '@/types/crm';

const fallbackQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

function useSafeQueryClient(): QueryClient {
  try {
    return useQueryClient() || fallbackQueryClient;
  } catch {
    return fallbackQueryClient;
  }
}

export function useClients(params?: ClientFilterParams) {
  const queryClient = useSafeQueryClient();
  return useQuery<ClientsResponse>(
    {
      queryKey: ['crm', 'clients', params],
      queryFn: () => {
        const searchParams = new URLSearchParams();
        if (params?.q) {
          searchParams.set('q', params.q);
        }
        if (params?.category_group) {
          searchParams.set('category_group', params.category_group);
        }
        searchParams.set('page', String(params?.page || 1));
        searchParams.set('limit', String(params?.limit || 20));
        return apiFetchList<Client>(`/crm/clients?${searchParams.toString()}`);
      },
    },
    queryClient
  );
}

export function useClient(id: string) {
  const queryClient = useSafeQueryClient();
  return useQuery<Client>(
    {
      queryKey: ['crm', 'client', id],
      queryFn: () => apiFetch<Client>(`/crm/clients/${id}`),
      enabled: !!id,
    },
    queryClient
  );
}

export function useCreateClient() {
  const queryClient = useSafeQueryClient();
  return useMutation<Client, Error, CreateClientPayload>(
    {
      mutationFn: (payload: CreateClientPayload) =>
        apiFetch<Client>('/crm/clients', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['crm', 'clients'] });
      },
    },
    queryClient
  );
}

export function useOpportunities() {
  const queryClient = useSafeQueryClient();
  return useQuery<Opportunity[]>(
    {
      queryKey: ['crm', 'opportunities'],
      queryFn: () => apiFetch<Opportunity[]>('/crm/opportunities'),
    },
    queryClient
  );
}

export function useUpdateOpportunityStage() {
  const queryClient = useSafeQueryClient();
  return useMutation<Opportunity, Error, UpdateOpportunityStagePayload>(
    {
      mutationFn: ({ id, stage, lost_reason }) =>
        apiFetch<Opportunity>(`/crm/opportunities/${id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            stage,
            ...(lost_reason !== undefined ? { lost_reason } : {}),
          }),
        }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['crm', 'opportunities'] });
      },
    },
    queryClient
  );
}

export function useConvertOpportunity() {
  const queryClient = useSafeQueryClient();
  return useMutation<ConvertOpportunityResponse, Error, ConvertOpportunityParams>(
    {
      mutationFn: ({ id, data, idempotencyKey }) =>
        apiFetch<ConvertOpportunityResponse>(`/crm/opportunities/${id}/convert`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify(data),
        }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['crm', 'opportunities'] });
      },
    },
    queryClient
  );
}
