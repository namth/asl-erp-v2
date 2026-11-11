import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import {
  CommissionsFilters,
  CommissionsResponse,
  CaseMilestone,
  CommissionPolicy,
  UpdateCommissionPolicyPayload,
} from '@/types/finance';

export function useCommissions(filters?: CommissionsFilters) {
  const params = new URLSearchParams();

  if (filters?.case_id && filters.case_id.trim()) {
    params.set('case_id', filters.case_id.trim());
  }
  if (filters?.user_id && filters.user_id.trim()) {
    params.set('user_id', filters.user_id.trim());
  }
  if (filters?.from && filters.from.trim()) {
    params.set('from', filters.from.trim());
  }
  if (filters?.to && filters.to.trim()) {
    params.set('to', filters.to.trim());
  }
  if (filters?.page !== undefined && filters?.page !== null) {
    params.set('page', String(filters.page));
  }
  if (filters?.limit !== undefined && filters?.limit !== null) {
    params.set('limit', String(filters.limit));
  }

  const queryStr = params.toString();
  const endpoint = queryStr ? `/finance/commissions?${queryStr}` : '/finance/commissions';

  return useQuery<CommissionsResponse>({
    queryKey: ['commissions', filters],
    queryFn: () => apiFetch<CommissionsResponse>(endpoint),
  });
}

export function useCaseMilestones(caseId: string) {
  return useQuery<CaseMilestone[]>({
    queryKey: ['case', caseId, 'milestones'],
    queryFn: () => apiFetch<CaseMilestone[]>(`/cases/${caseId}/milestones`),
    enabled: Boolean(caseId),
  });
}

export function useCaseCommissionPolicy(caseId: string) {
  return useQuery<CommissionPolicy>({
    queryKey: ['case', caseId, 'commission-policy'],
    queryFn: () => apiFetch<CommissionPolicy>(`/cases/${caseId}/commission-policy`),
    enabled: Boolean(caseId),
  });
}

export function useUpdateCommissionPolicy(caseId: string) {
  const queryClient = useQueryClient();

  return useMutation<CommissionPolicy, Error, UpdateCommissionPolicyPayload>({
    mutationFn: async (payload: UpdateCommissionPolicyPayload) => {
      return apiFetch<CommissionPolicy>(`/cases/${caseId}/commission-policy`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case', caseId, 'commission-policy'] });
    },
  });
}
