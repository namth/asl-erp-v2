import { useQuery } from '@tanstack/react-query';
import { apiFetchList, type ListMeta } from '@/lib/api-client';

export interface MyTaskItem {
  id: string;
  title: string;
  status: string;
  due_at?: string | null;
  is_overdue?: boolean;
  case?: {
    id: string;
    case_code: string;
    title: string;
  };
  stage?: {
    name: string;
    status: string;
  };
  blocked_by_count?: number;
}

export interface MyTasksSummary {
  todo: number;
  in_progress: number;
  waiting_approval: number;
  overdue: number;
}

export interface MyTasksFilters {
  due?: 'overdue' | 'today' | 'week' | string;
  status?: string;
  page?: number;
  limit?: number;
}

// docs/07: GET /me/tasks trả data[] + meta (§1.2) có summary nằm trong meta.
export type MyTasksMeta = ListMeta & { summary: MyTasksSummary };

export interface MyTasksResponse {
  data: MyTaskItem[];
  meta: MyTasksMeta;
  summary: MyTasksSummary;
}

export function useMyTasks(filters?: MyTasksFilters) {
  const params = new URLSearchParams();

  if (filters?.due && filters.due.trim()) {
    params.set('due', filters.due.trim());
  }
  if (filters?.status && filters.status.trim()) {
    params.set('status', filters.status.trim());
  }
  if (filters?.page !== undefined && filters?.page !== null) {
    params.set('page', String(filters.page));
  }
  if (filters?.limit !== undefined && filters?.limit !== null) {
    params.set('limit', String(filters.limit));
  }

  const queryStr = params.toString();
  const endpoint = queryStr ? `/me/tasks?${queryStr}` : '/me/tasks';

  return useQuery<MyTasksResponse>({
    queryKey: ['my-tasks', filters],
    queryFn: async () => {
      const { data, meta } = await apiFetchList<MyTaskItem>(endpoint);
      const m = meta as MyTasksMeta;
      return { data, meta: m, summary: m.summary };
    },
  });
}
