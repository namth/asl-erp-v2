import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as apiClient from '@/lib/api-client';
import {
  useDocuments,
  useDocumentVersions,
  useUploadDocument,
  useUploadVersion,
  useArchiveDocument,
  downloadDocumentVersion,
} from '@/hooks/use-documents';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('Hooks dữ liệu Tài liệu - use-documents.ts (brief mục 4 & 5, API contracts §3.8)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('useDocuments hook', () => {
    it('gọi GET /cases/{id}/documents với tham số folder và include_archived', async () => {
      const mockResponse = {
        data: [
          {
            id: 'doc-1',
            folder: 'LEGAL_CONTRACTS',
            title: 'Hợp đồng dịch vụ tư vấn pháp lý',
            task: { id: 'task-1', title: 'Soạn thảo hợp đồng' },
            is_archived: false,
            created_at: '2026-11-02T03:00:00Z',
            current_version: {
              id: 'ver-2',
              version_no: 2,
              original_filename: 'hop-dong-v2.pdf',
              mime_type: 'application/pdf',
              size_bytes: 482133,
              scan_status: 'CLEAN',
              uploaded_by: { id: 'usr-02', name: 'LS. Mai Linh' },
              uploaded_at: '2026-11-05T08:10:00Z',
            },
          },
        ],
        meta: {
          allowed_folders: ['LEGAL_CONTRACTS', 'CLIENT_SUBMISSIONS', 'OFFICIAL_FILINGS', 'INTERNAL_DRAFTS'],
          can_upload: true,
        },
      };

      const apiSpy = vi.spyOn(apiClient, 'apiFetchList').mockResolvedValue(mockResponse as any);

      const { result } = renderHook(
        () =>
          useDocuments('case-100', {
            folder: 'LEGAL_CONTRACTS',
            include_archived: false,
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.meta.can_upload).toBe(true);
      expect(result.current.data?.data).toHaveLength(1);

      expect(apiSpy).toHaveBeenCalledTimes(1);
      const calledUrl = apiSpy.mock.calls[0][0];
      expect(calledUrl).toContain('/cases/case-100/documents');
      expect(calledUrl).toContain('folder=LEGAL_CONTRACTS');
      expect(calledUrl).toContain('include_archived=false');
    });

    it('gọi đúng query param khi include_archived=true', async () => {
      const mockResponse = {
        data: [],
        meta: {
          allowed_folders: ['LEGAL_CONTRACTS'],
          can_upload: false,
        },
      };

      const apiSpy = vi.spyOn(apiClient, 'apiFetchList').mockResolvedValue(mockResponse as any);

      const { result } = renderHook(
        () =>
          useDocuments('case-200', {
            folder: 'LEGAL_CONTRACTS',
            include_archived: true,
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      const calledUrl = apiSpy.mock.calls[0][0];
      expect(calledUrl).toContain('include_archived=true');
    });
  });

  describe('useDocumentVersions hook', () => {
    it('gọi GET /documents/{id}/versions để lấy lịch sử phiên bản (mới nhất trước)', async () => {
      const mockVersions = [
        {
          id: 'ver-2',
          version_no: 2,
          original_filename: 'hop-dong-v2.pdf',
          mime_type: 'application/pdf',
          size_bytes: 482133,
          scan_status: 'CLEAN',
          uploaded_by: { id: 'usr-02', name: 'LS. Mai Linh' },
          uploaded_at: '2026-11-05T08:10:00Z',
        },
        {
          id: 'ver-1',
          version_no: 1,
          original_filename: 'hop-dong-v1.pdf',
          mime_type: 'application/pdf',
          size_bytes: 450000,
          scan_status: 'CLEAN',
          uploaded_by: { id: 'usr-01', name: 'LS. Nguyễn Văn An' },
          uploaded_at: '2026-11-02T03:00:00Z',
        },
      ];

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockVersions as any);

      const { result } = renderHook(() => useDocumentVersions('doc-100'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(apiSpy).toHaveBeenCalledWith('/documents/doc-100/versions');
      expect(result.current.data?.[0].version_no).toBe(2);
      expect(result.current.data?.[1].version_no).toBe(1);
    });
  });

  describe('useUploadDocument mutation', () => {
    it('gửi FormData đúng các trường lên POST /cases/{id}/documents và KHÔNG đặt Content-Type thủ công', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ id: 'doc-new' } as any);

      const { result } = renderHook(() => useUploadDocument('case-100'), {
        wrapper: createWrapper(),
      });

      const formData = new FormData();
      formData.append('folder', 'LEGAL_CONTRACTS');
      formData.append('title', 'Hợp đồng mới tạo');
      formData.append('task_id', 'task-5');
      formData.append(
        'file',
        new File(['sample text content'], 'sample.pdf', { type: 'application/pdf' })
      );

      await result.current.mutateAsync(formData);

      expect(apiSpy).toHaveBeenCalledTimes(1);
      const [url, init] = apiSpy.mock.calls[0];
      expect(url).toBe('/cases/case-100/documents');
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe(formData);

      // Bắt buộc không đặt Content-Type thủ công để trình duyệt tự tạo boundary
      const headers = init?.headers ? new Headers(init.headers) : new Headers();
      expect(headers.get('Content-Type')).toBeNull();
    });
  });

  describe('useUploadVersion mutation', () => {
    it('gửi FormData lên POST /documents/{id}/versions', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ id: 'ver-new' } as any);

      const { result } = renderHook(() => useUploadVersion('doc-100'), {
        wrapper: createWrapper(),
      });

      const formData = new FormData();
      formData.append(
        'file',
        new File(['new version text'], 'hop-dong-v3.pdf', { type: 'application/pdf' })
      );

      await result.current.mutateAsync(formData);

      expect(apiSpy).toHaveBeenCalledTimes(1);
      const [url, init] = apiSpy.mock.calls[0];
      expect(url).toBe('/documents/doc-100/versions');
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe(formData);
    });
  });

  describe('useArchiveDocument mutation', () => {
    it('gửi lý do lưu trữ bắt buộc lên POST /documents/{id}/archive', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ success: true } as any);

      const { result } = renderHook(() => useArchiveDocument('doc-100'), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync({ reason: 'Bản thảo đã thay bằng hồ sơ nộp chính thức' });

      expect(apiSpy).toHaveBeenCalledTimes(1);
      const [url, init] = apiSpy.mock.calls[0];
      expect(url).toBe('/documents/doc-100/archive');
      expect(init?.method).toBe('POST');
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
      expect(body).toEqual({ reason: 'Bản thảo đã thay bằng hồ sơ nộp chính thức' });
    });
  });

  describe('downloadDocumentVersion function', () => {
    it('tải xuống bằng fetch gửi cookie, đọc Content-Disposition UTF-8 và thu hồi URL tạm', async () => {
      const mockBlob = new Blob(['sample pdf content'], { type: 'application/pdf' });
      const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/test-uuid');
      const revokeObjectURLMock = vi.fn();
      globalThis.URL.createObjectURL = createObjectURLMock;
      globalThis.URL.revokeObjectURL = revokeObjectURLMock;

      const clickMock = vi.fn();
      const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') {
          return {
            href: '',
            download: '',
            click: clickMock,
            setAttribute: vi.fn(),
            style: {},
          } as any;
        }
        return document.createElement(tag);
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'Content-Disposition': "attachment; filename*=UTF-8''hop-dong-tieng-viet.pdf",
        }),
        blob: async () => mockBlob,
      } as any);

      await downloadDocumentVersion('doc-1', 'ver-2');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/documents/doc-1/versions/ver-2/download'),
        expect.objectContaining({
          credentials: 'include',
        })
      );
      expect(createObjectURLMock).toHaveBeenCalledWith(mockBlob);
      expect(clickMock).toHaveBeenCalled();
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:http://localhost/test-uuid');

      createElementSpy.mockRestore();
    });

    it('báo lỗi khi gặp HTTP 409 FILE_NOT_AVAILABLE (tệp chưa quét xong hoặc nhiễm virus)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          error: {
            code: 'FILE_NOT_AVAILABLE',
            message: 'Tệp chưa sẵn sàng để tải',
          },
        }),
      } as any);

      await expect(downloadDocumentVersion('doc-1', 'ver-pending')).rejects.toThrow(
        /chưa sẵn sàng để tải|FILE_NOT_AVAILABLE/i
      );
    });
  });
});
