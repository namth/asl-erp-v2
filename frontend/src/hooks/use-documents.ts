import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchList } from '@/lib/api-client';
import type {
  DocumentItem,
  DocumentsMeta,
  DocumentsResponse,
  DocumentVersion,
} from '@/types/documents';

export interface UseDocumentsParams {
  folder: string;
  include_archived?: boolean;
}

export function useDocuments(caseId: string, params: UseDocumentsParams) {
  const includeArchived = params.include_archived ?? false;
  return useQuery<DocumentsResponse>({
    queryKey: ['cases', caseId, 'documents', params.folder, includeArchived],
    queryFn: async () => {
      const search = new URLSearchParams({
        folder: params.folder,
        include_archived: String(includeArchived),
      });
      // Giữ cả meta (allowed_folders, can_upload) — apiFetch chỉ trả data[] (docs/07 §3.8).
      const res = await apiFetchList<DocumentItem>(`/cases/${caseId}/documents?${search.toString()}`);
      return { data: res.data, meta: res.meta as unknown as DocumentsMeta };
    },
    enabled: Boolean(caseId && params.folder),
  });
}

export function useDocumentVersions(documentId: string) {
  return useQuery<DocumentVersion[]>({
    queryKey: ['documents', documentId, 'versions'],
    queryFn: () => apiFetch<DocumentVersion[]>(`/documents/${documentId}/versions`),
    enabled: Boolean(documentId),
  });
}

export function useUploadDocument(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) =>
      apiFetch<{ id: string }>(`/cases/${caseId}/documents`, {
        method: 'POST',
        body: formData,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases', caseId, 'documents'] });
    },
  });
}

export function useUploadVersion(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) =>
      apiFetch<{ id: string }>(`/documents/${documentId}/versions`, {
        method: 'POST',
        body: formData,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', documentId, 'versions'] });
    },
  });
}

export interface ArchiveDocumentPayload {
  reason: string;
}

export function useArchiveDocument(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ArchiveDocumentPayload) =>
      apiFetch<{ success: boolean }>(`/documents/${documentId}/archive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['documents', documentId] });
    },
  });
}

export async function downloadDocumentVersion(
  documentId: string,
  versionId: string
): Promise<void> {
  const base = process.env.NEXT_PUBLIC_API_BASE || '/api/v1';
  const url = `${base}/documents/${documentId}/versions/${versionId}/download`;

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    let message = 'Tệp chưa sẵn sàng để tải (FILE_NOT_AVAILABLE)';
    try {
      const data = await response.json();
      if (data?.error?.message) {
        message = data.error.message;
      } else if (data?.error?.code) {
        message = data.error.code;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  let filename = 'tailieu';

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match && utf8Match[1]) {
    try {
      filename = decodeURIComponent(utf8Match[1].trim());
    } catch {
      filename = utf8Match[1].trim();
    }
  } else {
    const fnMatch = disposition.match(/filename="?([^";]+)"?/i);
    if (fnMatch && fnMatch[1]) {
      filename = fnMatch[1].trim();
    }
  }

  const objectUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(objectUrl);
}
