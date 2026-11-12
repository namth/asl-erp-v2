import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchList } from '@/lib/api-client';

export type MenuCountKey = 'approvals' | 'cases' | 'tasks';

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

export interface MenuCounts {
  approvals: number;
  cases: number;
  tasks: number;
}

export interface UseMenuCountsResult {
  counts: MenuCounts;
  approvals: number;
  cases: number;
  tasks: number;
  isLoading: boolean;
  isError: boolean;
}

export function useMenuCounts(role?: string): UseMenuCountsResult {
  const client = useSafeQueryClient();
  const normalizedRole = (role || '').toUpperCase();

  // Phân quyền theo Brief mục 4 và docs/07:
  // - ADMIN: không gọi /cases, /me/tasks
  // - ACCOUNTANT: không gọi /approvals, không gọi /me/tasks (không có menu tác vụ)
  const canFetchApprovals = Boolean(role) && normalizedRole !== 'ACCOUNTANT';
  const canFetchCases = Boolean(role) && normalizedRole !== 'ADMIN';
  const canFetchTasks =
    Boolean(role) && normalizedRole !== 'ADMIN' && normalizedRole !== 'ACCOUNTANT';

  const approvalsQuery = useQuery(
    {
      queryKey: ['menu-counts', 'approvals', role],
      queryFn: async () => {
        const res = await apiFetch<unknown[]>('/approvals?status=PENDING');
        return Array.isArray(res) ? res.length : 0;
      },
      enabled: canFetchApprovals,
      staleTime: 60 * 1000,
    },
    client
  );

  const casesQuery = useQuery(
    {
      queryKey: ['menu-counts', 'cases', role],
      queryFn: async () => {
        const res = await apiFetchList('/cases?mine=true&limit=1');
        return res?.meta?.total_records ?? 0;
      },
      enabled: canFetchCases,
      staleTime: 60 * 1000,
    },
    client
  );

  const tasksQuery = useQuery(
    {
      queryKey: ['menu-counts', 'tasks', role],
      queryFn: async () => {
        const res = await apiFetchList<{ id: string }>('/me/tasks');
        const meta = res?.meta as
          | (typeof res.meta & { summary?: { todo?: number; in_progress?: number } })
          | undefined;
        const summary = meta?.summary;
        const todo = typeof summary?.todo === 'number' ? summary.todo : 0;
        const inProgress = typeof summary?.in_progress === 'number' ? summary.in_progress : 0;
        return todo + inProgress;
      },
      enabled: canFetchTasks,
      staleTime: 60 * 1000,
    },
    client
  );

  const approvals =
    approvalsQuery.isSuccess && typeof approvalsQuery.data === 'number'
      ? approvalsQuery.data
      : 0;
  const cases =
    casesQuery.isSuccess && typeof casesQuery.data === 'number'
      ? casesQuery.data
      : 0;
  const tasks =
    tasksQuery.isSuccess && typeof tasksQuery.data === 'number'
      ? tasksQuery.data
      : 0;

  const counts: MenuCounts = {
    approvals,
    cases,
    tasks,
  };

  return {
    counts,
    approvals,
    cases,
    tasks,
    isLoading: approvalsQuery.isLoading || casesQuery.isLoading || tasksQuery.isLoading,
    isError: approvalsQuery.isError || casesQuery.isError || tasksQuery.isError,
  };
}
