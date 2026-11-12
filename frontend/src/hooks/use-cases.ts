import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchList } from '@/lib/api-client';
import {
  CaseDetail,
  CaseListFilters,
  CaseListResponse,
  CaseStage,
  CaseAssignment,
  SetAssignmentsPayload,
  ChangeStatusPayload,
} from '@/types/cases';

export function useCases(filters?: CaseListFilters) {
  const params = new URLSearchParams();

  if (filters?.q && filters.q.trim()) {
    params.set('q', filters.q.trim());
  }
  if (filters?.status && filters.status.trim()) {
    params.set('status', filters.status.trim());
  }
  if (filters?.department_id && filters.department_id.trim()) {
    params.set('department_id', filters.department_id.trim());
  }
  if (filters?.mine !== undefined && filters?.mine !== null) {
    params.set('mine', String(filters.mine));
  }
  if (filters?.page !== undefined && filters?.page !== null) {
    params.set('page', String(filters.page));
  }
  if (filters?.limit !== undefined && filters?.limit !== null) {
    params.set('limit', String(filters.limit));
  }

  const queryStr = params.toString();
  const endpoint = queryStr ? `/cases?${queryStr}` : '/cases';

  return useQuery<CaseListResponse>({
    queryKey: ['cases', filters],
    queryFn: () => apiFetchList(endpoint),
  });
}

export function useCase(id: string, options?: { view?: 'progress' | 'professional' }) {
  const queryString = options?.view ? `?view=${options.view}` : '';
  const endpoint = `/cases/${id}${queryString}`;

  return useQuery<CaseDetail>({
    queryKey: ['case', id, options?.view],
    queryFn: () => apiFetch<CaseDetail>(endpoint),
    enabled: Boolean(id),
  });
}

export function useCaseStages(id: string) {
  return useQuery<CaseStage[]>({
    queryKey: ['case', id, 'stages'],
    queryFn: () => apiFetch<CaseStage[]>(`/cases/${id}/stages`),
    enabled: Boolean(id),
  });
}

export function useAssignments(id: string) {
  return useQuery<CaseAssignment[]>({
    queryKey: ['case', id, 'assignments'],
    queryFn: () => apiFetch<CaseAssignment[]>(`/cases/${id}/assignments`),
    enabled: Boolean(id),
  });
}

export function useSetAssignments(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SetAssignmentsPayload) =>
      apiFetch<{ success: boolean }>(`/cases/${id}/assignments`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case', id] });
    },
  });
}

export function useChangeCaseStatus(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ChangeStatusPayload) =>
      apiFetch<{ success: boolean }>(`/cases/${id}/status`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case', id] });
    },
  });
}
