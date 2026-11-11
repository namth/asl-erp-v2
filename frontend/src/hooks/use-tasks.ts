import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { ChangeRequest, Task, TaskComment, TaskStatus } from '@/types/tasks';

const fallbackQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

export function useSafeQueryClient(): QueryClient {
  try {
    return useQueryClient();
  } catch {
    return fallbackQueryClient;
  }
}

export interface TaskFilters {
  stage_id?: string;
  status?: string;
  assigned_to?: string;
}

export function useTasks(caseId: string, filters?: TaskFilters) {
  const client = useSafeQueryClient();

  return useQuery(
    {
      queryKey: ['tasks', caseId, filters],
      queryFn: async () => {
        const searchParams = new URLSearchParams();
        if (filters?.stage_id) searchParams.set('stage_id', filters.stage_id);
        if (filters?.status) searchParams.set('status', filters.status);
        if (filters?.assigned_to) searchParams.set('assigned_to', filters.assigned_to);

        const qs = searchParams.toString();
        const path = qs ? `/cases/${caseId}/tasks?${qs}` : `/cases/${caseId}/tasks`;
        return apiFetch<Task[]>(path);
      },
      enabled: Boolean(caseId),
    },
    client
  );
}

export interface UpdateTaskStatusPayload {
  taskId: string;
  status: TaskStatus;
  note?: string;
}

export function useUpdateTaskStatus(caseId: string) {
  const client = useSafeQueryClient();

  return useMutation(
    {
      mutationFn: async ({ taskId, status, note }: UpdateTaskStatusPayload) => {
        return apiFetch<{ success: boolean }>(`/cases/${caseId}/tasks/${taskId}/status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status, note }),
        });
      },
      onSuccess: () => {
        client.invalidateQueries({ queryKey: ['tasks', caseId] });
      },
    },
    client
  );
}

export interface UpdateTaskPayload {
  taskId: string;
  data: {
    assigned_to?: string;
    due_at?: string;
    description?: string;
  };
}

export function useUpdateTask(caseId: string) {
  const client = useSafeQueryClient();

  return useMutation(
    {
      mutationFn: async ({ taskId, data }: UpdateTaskPayload) => {
        return apiFetch<{ success: boolean }>(`/cases/${caseId}/tasks/${taskId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        });
      },
      onSuccess: () => {
        client.invalidateQueries({ queryKey: ['tasks', caseId] });
      },
    },
    client
  );
}

export function useTaskComments(caseId: string, taskId: string) {
  const client = useSafeQueryClient();

  return useQuery(
    {
      queryKey: ['task-comments', caseId, taskId],
      queryFn: async () => {
        return apiFetch<TaskComment[]>(`/cases/${caseId}/tasks/${taskId}/comments`);
      },
      enabled: Boolean(caseId && taskId),
    },
    client
  );
}

export function useAddComment(caseId: string, taskId: string) {
  const client = useSafeQueryClient();

  return useMutation(
    {
      mutationFn: async ({ body }: { body: string }) => {
        return apiFetch<{ success: boolean }>(`/cases/${caseId}/tasks/${taskId}/comments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ body }),
        });
      },
      onSuccess: () => {
        client.invalidateQueries({ queryKey: ['task-comments', caseId, taskId] });
      },
    },
    client
  );
}

export function useChangeRequests(caseId: string) {
  const client = useSafeQueryClient();

  return useQuery(
    {
      queryKey: ['change-requests', caseId],
      queryFn: async () => {
        return apiFetch<ChangeRequest[]>(`/cases/${caseId}/change-requests`);
      },
      enabled: Boolean(caseId),
    },
    client
  );
}

export interface CreateChangeRequestPayload {
  kind: 'ADD_TASK';
  reason: string;
  proposal: {
    stage_id: string;
    title: string;
    assigned_to?: string;
    due_at?: string;
    complexity_weight?: number;
  };
}

export function useCreateChangeRequest(caseId: string) {
  const client = useSafeQueryClient();

  return useMutation(
    {
      mutationFn: async (payload: CreateChangeRequestPayload) => {
        return apiFetch<{ success: boolean }>(`/cases/${caseId}/change-requests`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
      },
      onSuccess: () => {
        client.invalidateQueries({ queryKey: ['change-requests', caseId] });
      },
    },
    client
  );
}
