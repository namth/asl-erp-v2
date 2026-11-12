'use client';

import React, { useState } from 'react';
import { checkFile } from '@/lib/file-rules';
import { useUploadVersion } from '@/hooks/use-documents';
import { ApiError } from '@/lib/api-client';

interface DocumentVersionUploadModalProps {
  documentId: string;
  documentTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function DocumentVersionUploadModal({
  documentId,
  documentTitle,
  isOpen,
  onClose,
  onSuccess,
}: DocumentVersionUploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const uploadVersionMutation = useUploadVersion(documentId);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    setServerError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }

    const check = checkFile({
      name: file.name,
      size: file.size,
      type: file.type,
    });

    if (!check.ok) {
      if (check.code === 'FILE_TYPE_NOT_ALLOWED') {
        setFileError('Định dạng tệp không được phép (FILE_TYPE_NOT_ALLOWED). Chỉ chấp nhận PDF, DOCX, XLSX, JPG, PNG.');
      } else if (check.code === 'FILE_TOO_LARGE') {
        setFileError('Dung lượng tệp vượt quá giới hạn 50 MB (FILE_TOO_LARGE).');
      }
    }

    setSelectedFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFileError(null);
    setServerError(null);

    if (!selectedFile) {
      setFileError('Vui lòng chọn tệp tin phiên bản mới.');
      return;
    }

    const check = checkFile({
      name: selectedFile.name,
      size: selectedFile.size,
      type: selectedFile.type,
    });

    if (!check.ok) {
      if (check.code === 'FILE_TYPE_NOT_ALLOWED') {
        setFileError('Định dạng tệp không được phép (FILE_TYPE_NOT_ALLOWED). Chỉ chấp nhận PDF, DOCX, XLSX, JPG, PNG.');
      } else if (check.code === 'FILE_TOO_LARGE') {
        setFileError('Dung lượng tệp vượt quá giới hạn 50 MB (FILE_TOO_LARGE).');
      }
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      await uploadVersionMutation.mutateAsync(formData);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === 'FILE_TYPE_NOT_ALLOWED') {
          setFileError(err.message || 'Định dạng tệp không được phép (FILE_TYPE_NOT_ALLOWED).');
        } else if (err.code === 'FILE_TOO_LARGE') {
          setFileError(err.message || 'Dung lượng tệp vượt quá 50 MB (FILE_TOO_LARGE).');
        } else {
          setServerError(`${err.message} (${err.code})`);
        }
      } else if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError('Có lỗi xảy ra khi tải lên phiên bản mới.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
            Tải phiên bản mới
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
            Tải lên bản cập nhật mới cho tài liệu:{' '}
            <strong className="text-slate-800 dark:text-slate-200">
              {documentTitle}
            </strong>
            . Bản cũ sẽ được lưu trong lịch sử phiên bản và không bị ghi đè.
          </p>

          {serverError && (
            <div className="p-3 text-xs text-red-700 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl">
              {serverError}
            </div>
          )}

          <div>
            <label
              htmlFor="upload-version-file-input"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
            >
              Chọn tệp phiên bản mới (PDF, DOCX, XLSX, JPG, PNG - tối đa 50 MB) *
            </label>
            <input
              id="upload-version-file-input"
              type="file"
              onChange={handleFileChange}
              accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png"
              className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-slate-800 dark:file:text-blue-400"
            />
            {fileError && (
              <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 font-medium">
                {fileError}
              </p>
            )}
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={uploadVersionMutation.isPending}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={uploadVersionMutation.isPending}
              className="px-4 py-2 text-xs font-bold text-white rounded-xl bg-gradient-to-r from-[#002D54] to-[#0082B4] hover:from-[#002444] hover:to-[#00709c] transition-all shadow-sm disabled:opacity-50"
            >
              {uploadVersionMutation.isPending ? 'Đang tải lên...' : 'Xác nhận tải lên'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
