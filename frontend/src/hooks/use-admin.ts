import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchList } from '@/lib/api-client';
import {
  Department,
  UserSummary,
  UsersResponse,
  UsersQueryParams,
  CreateUserPayload,
  UpdateUserPayload,
  DeactivateUserPayload,
  ResetTwoFactorPayload,
  CreateDepartmentPayload,
  SetDepartmentLeadersPayload,
} from '@/types/admin';

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

export function useUsers(params?: UsersQueryParams) {
  const queryClient = useSafeQueryClient();
  const searchParams = new URLSearchParams();
  if (params?.q) searchParams.set('q', params.q);
  if (params?.role) searchParams.set('role', params.role);
  if (params?.department_id) searchParams.set('department_id', params.department_id);
  if (params?.page !== undefined) searchParams.set('page', String(params.page));
  if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));

  const qs = searchParams.toString();
  const endpoint = qs ? `/users?${qs}` : '/users';

  return useQuery<UsersResponse>(
    {
      queryKey: ['admin', 'users', params],
      queryFn: () => apiFetchList(endpoint),
    },
    queryClient
  );
}

export function useUser(id: string) {
  const queryClient = useSafeQueryClient();
  return useQuery<UserSummary>(
    {
      queryKey: ['admin', 'users', id],
      queryFn: () => apiFetch<UserSummary>(`/users/${id}`),
      enabled: !!id,
    },
    queryClient
  );
}

export function useCreateUser() {
  const queryClient = useSafeQueryClient();
  return useMutation(
    {
      mutationFn: (data: CreateUserPayload) =>
        apiFetch<UserSummary & { temporary_password?: string }>('/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      },
    },
    queryClient
  );
}

export function useUpdateUser(id: string) {
  const queryClient = useSafeQueryClient();
  return useMutation(
    {
      mutationFn: (data: UpdateUserPayload) =>
        apiFetch<UserSummary>(`/users/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
        queryClient.invalidateQueries({ queryKey: ['admin', 'users', id] });
      },
    },
    queryClient
  );
}

export function useDeactivateUser(id: string) {
  const queryClient = useSafeQueryClient();
  return useMutation(
    {
      mutationFn: (payload: DeactivateUserPayload) =>
        apiFetch<{ success: boolean }>(`/users/${id}/deactivate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
        queryClient.invalidateQueries({ queryKey: ['admin', 'users', id] });
      },
    },
    queryClient
  );
}

export function useActivateUser(id: string) {
  const queryClient = useSafeQueryClient();
  return useMutation(
    {
      mutationFn: () =>
        apiFetch<{ success: boolean }>(`/users/${id}/activate`, {
          method: 'POST',
        }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
        queryClient.invalidateQueries({ queryKey: ['admin', 'users', id] });
      },
    },
    queryClient
  );
}

export function useResetTwoFactor(id: string) {
  const queryClient = useSafeQueryClient();
  return useMutation(
    {
      mutationFn: (payload: ResetTwoFactorPayload) =>
        apiFetch<{ success: boolean }>(`/users/${id}/2fa/reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
        queryClient.invalidateQueries({ queryKey: ['admin', 'users', id] });
      },
    },
    queryClient
  );
}

export function useDepartments() {
  const queryClient = useSafeQueryClient();
  return useQuery<Department[]>(
    {
      queryKey: ['admin', 'departments'],
      queryFn: () => apiFetch<Department[]>('/departments'),
    },
    queryClient
  );
}

export function useCreateDepartment() {
  const queryClient = useSafeQueryClient();
  return useMutation(
    {
      mutationFn: (data: CreateDepartmentPayload) =>
        apiFetch<Department>('/departments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['admin', 'departments'] });
      },
    },
    queryClient
  );
}

export function useSetDepartmentLeaders(id: string) {
  const queryClient = useSafeQueryClient();
  return useMutation(
    {
      mutationFn: (payload: SetDepartmentLeadersPayload) =>
        apiFetch<{ success: boolean }>(`/departments/${id}/leaders`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['admin', 'departments'] });
      },
    },
    queryClient
  );
}
