import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface CommissionDefaultItem {
  matter_type_id: string;
  name: string;
  code: string;
  default_originator_rate: string;
  default_management_rate: string;
  default_supervisor_share_pct: string;
  default_execution_rate: string;
}

export function useCommissionDefaults() {
  return useQuery<CommissionDefaultItem[]>({
    queryKey: ['settings', 'commission-defaults'],
    queryFn: () => apiFetch<CommissionDefaultItem[]>('/settings/commission-defaults'),
  });
}

export function useUpdateCommissionDefaults() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CommissionDefaultItem[]) =>
      apiFetch('/settings/commission-defaults', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'commission-defaults'] });
    },
  });
}
