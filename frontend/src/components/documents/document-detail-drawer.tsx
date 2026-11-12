'use client';

import React, { useState } from 'react';
import { useDocumentVersions, downloadDocumentVersion } from '@/hooks/use-documents';
import { formatBytes } from '@/lib/file-rules';
import { DocumentVersionUploadModal } from '@/components/documents/document-version-upload-modal';
import { DocumentArchiveModal } from '@/components/documents/document-archive-modal';
import type { DocumentItem, DocumentVersion } from '@/types/documents';
import { FOLDER_LABELS } from '@/types/documents';

interface DocumentDetailDrawerProps {
  document: DocumentItem | null;
  canUpload: boolean;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

export function DocumentDetailDrawer({
  document: doc,
  canUpload,
  isOpen,
  onClose,
  onRefresh,
}: DocumentDetailDrawerProps) {
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingVerId, setDownloadingVerId] = useState<string | null>(null);

  const { data: versions, isLoading, isError, refetch } = useDocumentVersions(doc?.id || '');

  if (!isOpen || !doc) return null;

  const sortedVersions: DocumentVersion[] = versions
    ? [...versions].sort((a, b) => b.version_no - a.version_no)
    : [doc.current_version];

  const handleDownload = async (versionId: string) => {
    setDownloadError(null);
    setDownloadingVerId(versionId);
    try {
      await downloadDocumentVersion(doc.id, versionId);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setDownloadError(err.message);
      } else {
        setDownloadError('Có lỗi xảy ra khi tải xuống tệp.');
      }
    } finally {
      setDownloadingVerId(null);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-xs" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              {FOLDER_LABELS[doc.folder] || doc.folder}
            </span>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 line-clamp-1">
              {doc.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
            aria-label="Đóng ngăn chi tiết"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {downloadError && (
            <div className="p-3 text-xs text-red-700 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl">
              {downloadError}
            </div>
          )}

          {/* Document Summary */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Trạng thái:</span>
              <span>
                {doc.is_archived ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                    Đã lưu trữ
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    Đang sử dụng
                  </span>
                )}
              </span>
            </div>
            {doc.task && (
              <div className="flex justify-between">
                <span className="text-slate-500">Công việc gắn kèm:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">{doc.task.title}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Tệp hiện tại:</span>
              <span className="font-bold text-slate-800 dark:text-slate-100">
                <span>{doc.current_version.original_filename}</span>
              </span>
            </div>
          </div>

          {/* Actions Bar */}
          {canUpload && !doc.is_archived && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsVersionModalOpen(true)}
                className="px-3.5 py-1.5 text-xs font-bold text-white rounded-xl bg-gradient-to-r from-[#002D54] to-[#0082B4] hover:from-[#002444] hover:to-[#00709c] transition-all shadow-sm"
              >
                Tải phiên bản mới
              </button>
            </div>
          )}

          {/* Versions List */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              Lịch sử phiên bản
            </h4>

            {isLoading && (
              <div className="space-y-2 animate-pulse" role="status">
                <div className="h-14 bg-slate-100 dark:bg-slate-800 rounded-xl w-full" />
                <div className="h-14 bg-slate-100 dark:bg-slate-800 rounded-xl w-full" />
              </div>
            )}

            {isError && (
              <p className="text-xs text-red-500">
                Không thể tải lịch sử phiên bản.
              </p>
            )}

            {!isLoading && sortedVersions.length > 0 && (
              <div className="space-y-2">
                {sortedVersions.map((ver) => {
                  const isClean = doc.current_version.scan_status === 'CLEAN' && ver.scan_status === 'CLEAN';
                  const isPending = ver.scan_status === 'PENDING';
                  const isInfected = ver.scan_status === 'INFECTED';
                  const isDownloading = downloadingVerId === ver.id;

                  return (
                    <div
                      key={ver.id}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 transition-colors flex items-center justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                            v{ver.version_no}
                          </span>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            <span>{ver.original_filename}</span>
                          </span>
                          {isPending && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                              Đang quét
                            </span>
                          )}
                          {isInfected && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300">
                              Nhiễm virus
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {formatBytes(ver.size_bytes)} · Người tải: {ver.uploaded_by.name} · {new Date(ver.uploaded_at).toLocaleDateString('vi-VN')}
                        </div>
                      </div>

                      <div>
                        <button
                          type="button"
                          onClick={() => handleDownload(ver.id)}
                          disabled={!isClean || isDownloading}
                          aria-disabled={!isClean}
                          title={!isClean ? 'Tệp chưa sẵn sàng để tải' : 'Tải xuống tệp này'}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors ${
                            isClean
                              ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/60'
                              : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed opacity-60'
                          }`}
                        >
                          {isDownloading ? 'Đang tải...' : 'Tải xuống'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {isVersionModalOpen && (
        <DocumentVersionUploadModal
          documentId={doc.id}
          documentTitle={doc.title}
          isOpen={isVersionModalOpen}
          onClose={() => setIsVersionModalOpen(false)}
          onSuccess={() => {
            refetch();
            onRefresh();
          }}
        />
      )}

      {isArchiveModalOpen && (
        <DocumentArchiveModal
          documentId={doc.id}
          documentTitle={doc.title}
          isOpen={isArchiveModalOpen}
          onClose={() => setIsArchiveModalOpen(false)}
          onSuccess={() => {
            onRefresh();
            onClose();
          }}
        />
      )}
    </>
  );
}
