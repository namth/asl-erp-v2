import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type {
  WorkflowTemplate,
  WorkflowVersion,
  CustomField,
  HolidaysConfig,
  WorkflowMode,
  HolidayDay,
} from '@/types/workflow';

const defaultFallbackClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

function useSafeQueryClient(): QueryClient {
  try {
    return useQueryClient();
  } catch {
    return defaultFallbackClient;
  }
}

// 1. Quản lý Workflow Templates
export function useWorkflowTemplates(matterTypeId?: string) {
  const queryClient = useSafeQueryClient();
  return useQuery<WorkflowTemplate[]>(
    {
      queryKey: ['workflow-templates', matterTypeId],
      queryFn: () => {
        const url = matterTypeId
          ? `/workflows/templates?matter_type_id=${encodeURIComponent(matterTypeId)}`
          : '/workflows/templates';
        return apiFetch<WorkflowTemplate[]>(url);
      },
    },
    queryClient
  );
}

export function useCreateWorkflowTemplate() {
  const queryClient = useSafeQueryClient();
  return useMutation(
    {
      mutationFn: (data: {
        matter_type_id: string;
        name: string;
        mode: WorkflowMode;
      }) =>
        apiFetch<WorkflowTemplate>('/workflows/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['workflow-templates'] });
      },
    },
    queryClient
  );
}

export function useUpdateWorkflowTemplate() {
  const queryClient = useSafeQueryClient();
  return useMutation(
    {
      mutationFn: ({
        id,
        data,
      }: {
        id: string;
        data: Partial<{
          name: string;
          mode: WorkflowMode;
          is_active: boolean;
        }>;
      }) =>
        apiFetch<{ success: boolean }>(`/workflows/templates/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['workflow-templates'] });
      },
    },
    queryClient
  );
}

// 2. Lịch sử & Khởi tạo phiên bản Workflow
export interface WorkflowVersionSummary {
  id: string;
  version_no: number;
  status: string;
  published_at: string | null;
  published_by?: string | null;
}

export function useWorkflowVersions(templateId: string) {
  const queryClient = useSafeQueryClient();
  return useQuery<WorkflowVersionSummary[]>(
    {
      queryKey: ['workflow-versions', templateId],
      queryFn: () =>
        apiFetch<WorkflowVersionSummary[]>(
          `/workflows/templates/${encodeURIComponent(templateId)}/versions`
        ),
      enabled: !!templateId,
    },
    queryClient
  );
}

export function useCreateWorkflowVersion() {
  const queryClient = useSafeQueryClient();
  return useMutation(
    {
      mutationFn: (templateId: string) =>
        apiFetch<{ id: string }>(
          `/workflows/templates/${encodeURIComponent(templateId)}/versions`,
          {
            method: 'POST',
          }
        ),
      onSuccess: (_res, templateId) => {
        queryClient.invalidateQueries({ queryKey: ['workflow-versions', templateId] });
        queryClient.invalidateQueries({ queryKey: ['workflow-templates'] });
      },
    },
    queryClient
  );
}

// 3. Quản lý chi tiết phiên bản (GET, PUT, PUBLISH)
export function useWorkflowVersion(versionId?: string) {
  const queryClient = useSafeQueryClient();
  return useQuery<WorkflowVersion>(
    {
      queryKey: ['workflow-version', versionId],
      queryFn: () =>
        apiFetch<WorkflowVersion>(`/workflows/versions/${encodeURIComponent(versionId!)}`),
      enabled: !!versionId,
    },
    queryClient
  );
}

export function useSaveWorkflowVersion() {
  const queryClient = useSafeQueryClient();
  return useMutation(
    {
      mutationFn: ({ id, data }: { id: string; data: WorkflowVersion }) =>
        apiFetch<{ success: boolean }>(`/workflows/versions/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }),
      onSuccess: (_res, { id }) => {
        queryClient.invalidateQueries({ queryKey: ['workflow-version', id] });
      },
    },
    queryClient
  );
}

export function usePublishWorkflowVersion() {
  const queryClient = useSafeQueryClient();
  return useMutation(
    {
      mutationFn: (versionId: string) =>
        apiFetch<{ success: boolean }>(
          `/workflows/versions/${encodeURIComponent(versionId)}/publish`,
          {
            method: 'POST',
          }
        ),
      onSuccess: (_res, versionId) => {
        queryClient.invalidateQueries({ queryKey: ['workflow-version', versionId] });
        queryClient.invalidateQueries({ queryKey: ['workflow-templates'] });
        queryClient.invalidateQueries({ queryKey: ['workflow-versions'] });
      },
    },
    queryClient
  );
}

// 4. Trường động của loại vụ việc (Custom Fields)
export function useCustomFields(matterTypeId: string) {
  const queryClient = useSafeQueryClient();
  return useQuery<CustomField[]>(
    {
      queryKey: ['custom-fields', matterTypeId],
      queryFn: () =>
        apiFetch<CustomField[]>(
          `/workflows/matter-types/${encodeURIComponent(matterTypeId)}/custom-fields`
        ),
      enabled: !!matterTypeId,
    },
    queryClient
  );
}

export function useSaveCustomFields() {
  const queryClient = useSafeQueryClient();
  return useMutation(
    {
      mutationFn: ({
        matterTypeId,
        fields,
      }: {
        matterTypeId: string;
        fields: CustomField[];
      }) =>
        apiFetch<{ success: boolean }>(
          `/workflows/matter-types/${encodeURIComponent(matterTypeId)}/custom-fields`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields }),
          }
        ),
      onSuccess: (_res, { matterTypeId }) => {
        queryClient.invalidateQueries({ queryKey: ['custom-fields', matterTypeId] });
      },
    },
    queryClient
  );
}

// 5. Cấu hình ngày nghỉ lễ (Holidays)
export function useHolidays(year: number) {
  const queryClient = useSafeQueryClient();
  return useQuery<HolidaysConfig>(
    {
      queryKey: ['holidays', year],
      queryFn: () =>
        apiFetch<HolidaysConfig>(`/settings/holidays?year=${encodeURIComponent(year)}`),
    },
    queryClient
  );
}

export function useSaveHolidays() {
  const queryClient = useSafeQueryClient();
  return useMutation(
    {
      mutationFn: (payload: { year: number; days: HolidayDay[] }) =>
        apiFetch<{ success: boolean }>('/settings/holidays', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      onSuccess: (_res, payload) => {
        queryClient.invalidateQueries({ queryKey: ['holidays', payload.year] });
      },
    },
    queryClient
  );
}
