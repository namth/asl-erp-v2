import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { User } from '@/types/auth';

export function useMe() {
  return useQuery<User>({
    queryKey: ['auth', 'me'],
    // Hợp đồng docs/07 §3.1: GET /auth/me trả { data: { user } }.
    queryFn: async () => (await apiFetch<{ user: User }>('/auth/me')).user,
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials: { email: string; password?: string }) =>
      apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch('/auth/logout', {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.setQueryData(['auth', 'me'], null);
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}
