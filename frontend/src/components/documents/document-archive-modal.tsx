'use client';

import React, { useState } from 'react';
import { useArchiveDocument } from '@/hooks/use-documents';

interface DocumentArchiveModalProps {
  documentId: string;
  documentTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function DocumentArchiveModal({
  documentId,
  documentTitle,
  isOpen,
  onClose,
  onSuccess,
}: DocumentArchiveModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const archiveMutation = useArchiveDocument(documentId);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanReason = reason.trim();
    if (!cleanReason) {
      setError('Lý do lưu trữ là bắt buộc (1 - 500 ký tự).');
      return;
    }
    if (cleanReason.length > 500) {
      setError('Lý do lưu trữ không được vượt quá 500 ký tự.');
      return;
    }

    try {
      await archiveMutation.mutateAsync({ reason: cleanReason });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Có lỗi xảy ra khi lưu trữ tài liệu.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
            Lưu trữ tài liệu
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
            aria-label="Đóng hộp thoại"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Bạn đang yêu cầu chuyển tài liệu{' '}
            <strong className="text-slate-800 dark:text-slate-200">
              &quot;{documentTitle}&quot;
            </strong>{' '}
            vào kho lưu trữ. Tài liệu đã lưu trữ sẽ bị ẩn khỏi danh sách mặc định và không thể chỉnh sửa.
          </p>

          <div>
            <label
              htmlFor="archive-reason-input"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
            >
              Lý do lưu trữ *
            </label>
            <textarea
              id="archive-reason-input"
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Nhập lý do lưu trữ (1 - 500 ký tự)..."
              className={`w-full px-3 py-2 text-xs rounded-xl border bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 ${
                error
                  ? 'border-red-400 focus:ring-red-400'
                  : 'border-slate-200 dark:border-slate-700 focus:ring-blue-500'
              }`}
            />
            {error && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400 font-medium">
                {error}
              </p>
            )}
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={archiveMutation.isPending}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={archiveMutation.isPending}
              className="px-4 py-2 text-xs font-bold text-white rounded-xl bg-amber-600 hover:bg-amber-700 transition-colors shadow-sm disabled:opacity-50"
            >
              {archiveMutation.isPending ? 'Đang xử lý...' : 'Xác nhận lưu trữ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
