'use client';

import React, { useState } from 'react';
import { checkFile } from '@/lib/file-rules';
import { useUploadDocument } from '@/hooks/use-documents';
import { ApiError } from '@/lib/api-client';
import type { DocumentFolder } from '@/types/documents';
import { FOLDER_LABELS } from '@/types/documents';

interface DocumentUploadModalProps {
  caseId: string;
  allowedFolders: DocumentFolder[];
  defaultFolder: DocumentFolder;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function DocumentUploadModal({
  caseId,
  allowedFolders,
  defaultFolder,
  isOpen,
  onClose,
  onSuccess,
}: DocumentUploadModalProps) {
  const [folder, setFolder] = useState<DocumentFolder>(defaultFolder);
  const [title, setTitle] = useState('');
  const [taskId, setTaskId] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [titleError, setTitleError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const uploadMutation = useUploadDocument(caseId);

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
    setTitleError(null);
    setFileError(null);
    setServerError(null);

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setTitleError('Tiêu đề tài liệu là bắt buộc (1 - 255 ký tự).');
      return;
    }
    if (cleanTitle.length > 255) {
      setTitleError('Tiêu đề tài liệu không được vượt quá 255 ký tự.');
      return;
    }

    if (!selectedFile) {
      setFileError('Vui lòng chọn tệp tin cần tải lên.');
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
    formData.append('folder', folder);
    formData.append('title', cleanTitle);
    if (taskId.trim()) {
      formData.append('task_id', taskId.trim());
    }
    formData.append('file', selectedFile);

    try {
      await uploadMutation.mutateAsync(formData);
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
        setServerError('Có lỗi xảy ra khi tải lên tài liệu.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
            Tải lên tài liệu mới
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
          {serverError && (
            <div className="p-3 text-xs text-red-700 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl">
              {serverError}
            </div>
          )}

          <div>
            <label htmlFor="upload-folder-select" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Thư mục lưu trữ *
            </label>
            <select
              id="upload-folder-select"
              value={folder}
              onChange={(e) => setFolder(e.target.value as DocumentFolder)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {allowedFolders.map((f) => (
                <option key={f} value={f}>
                  {FOLDER_LABELS[f] || f}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="upload-title-input" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Tiêu đề tài liệu *
            </label>
            <input
              id="upload-title-input"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError) setTitleError(null);
              }}
              placeholder="Nhập tiêu đề tài liệu (1 - 255 ký tự)"
              className={`w-full px-3 py-2 text-xs rounded-xl border bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 ${
                titleError
                  ? 'border-red-400 focus:ring-red-400'
                  : 'border-slate-200 dark:border-slate-700 focus:ring-blue-500'
              }`}
            />
            {titleError && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400 font-medium">{titleError}</p>
            )}
          </div>

          <div>
            <label htmlFor="upload-task-input" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Mã công việc gắn kèm (tuỳ chọn)
            </label>
            <input
              id="upload-task-input"
              type="text"
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              placeholder="Nhập mã công việc hoặc để trống"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="upload-file-input" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Tệp đính kèm (PDF, DOCX, XLSX, JPG, PNG - tối đa 50 MB) *
            </label>
            <input
              id="upload-file-input"
              type="file"
              onChange={handleFileChange}
              accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png"
              className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-slate-800 dark:file:text-blue-400"
            />
            {fileError && (
              <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 font-medium">{fileError}</p>
            )}
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={uploadMutation.isPending}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={uploadMutation.isPending}
              className="px-4 py-2 text-xs font-bold text-white rounded-xl bg-gradient-to-r from-[#002D54] to-[#0082B4] hover:from-[#002444] hover:to-[#00709c] transition-all shadow-sm disabled:opacity-50"
            >
              {uploadMutation.isPending ? 'Đang tải lên...' : 'Xác nhận tải lên'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
