'use client';

import React, { useState } from 'react';
import { useCreateChangeRequest } from '@/hooks/use-tasks';
import { ApiError } from '@/lib/api-client';

export interface ChangeRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  stages?: { id: string; name: string }[];
  members?: { id: string; full_name: string }[];
}

export default function ChangeRequestModal({
  isOpen,
  onClose,
  caseId,
  stages = [],
  members = [],
}: ChangeRequestModalProps) {
  const [title, setTitle] = useState('');
  const [reason, setReason] = useState('');
  const [stageId, setStageId] = useState(stages[0]?.id || 's-1');
  const [assignedTo, setAssignedTo] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [complexityWeight, setComplexityWeight] = useState<number>(1);

  const [validationError, setValidationError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const createMutation = useCreateChangeRequest(caseId);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setApiError(null);
    setSuccessMessage(null);

    const trimmedTitle = title.trim();
    const trimmedReason = reason.trim();

    if (!trimmedReason) {
      setValidationError('Lý do bắt buộc: vui lòng nhập lý do đề xuất bổ sung tác vụ.');
      return;
    }

    if (!trimmedTitle) {
      setValidationError('Vui lòng nhập tiêu đề tác vụ.');
      return;
    }

    createMutation.mutate(
      {
        kind: 'ADD_TASK',
        reason: trimmedReason,
        proposal: {
          stage_id: stageId || stages[0]?.id || 's-1',
          title: trimmedTitle,
          assigned_to: assignedTo || undefined,
          due_at: dueAt ? `${dueAt}T17:00:00Z` : undefined,
          complexity_weight: Number(complexityWeight) || 1,
        },
      },
      {
        onSuccess: () => {
          setSuccessMessage('Đã gửi, chờ Quản lý duyệt yêu cầu bổ sung tác vụ.');
          setTitle('');
          setReason('');
        },
        onError: (err: unknown) => {
          if (err instanceof ApiError && err.code === 'STRICT_GOVERNANCE_VIOLATION') {
            setApiError('Không thể bổ sung tác vụ trong quy trình khung cứng (vi phạm quy tắc khung cứng).');
          } else if (err instanceof Error) {
            setApiError(err.message);
          } else {
            setApiError('Đã xảy ra lỗi khi gửi yêu cầu đề xuất.');
          }
        },
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Đề xuất bổ sung tác vụ mới
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
            aria-label="Đóng hộp thoại"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {validationError && (
            <div className="p-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg dark:bg-red-950/30 dark:border-red-900 dark:text-red-400">
              {validationError}
            </div>
          )}

          {apiError && (
            <div className="p-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg dark:bg-red-950/30 dark:border-red-900 dark:text-red-400">
              {apiError}
            </div>
          )}

          {successMessage && (
            <div className="p-3 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-400">
              {successMessage}
            </div>
          )}

          <div>
            <label htmlFor="cr-title" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Tiêu đề tác vụ *
            </label>
            <input
              id="cr-title"
              type="text"
              aria-label="Tiêu đề tác vụ"
              placeholder="Nhập tiêu đề tác vụ cần bổ sung..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="cr-stage" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Giai đoạn thực hiện *
            </label>
            <select
              id="cr-stage"
              aria-label="Giai đoạn"
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {stages.length > 0 ? (
                stages.map((stg) => (
                  <option key={stg.id} value={stg.id}>
                    {stg.name}
                  </option>
                ))
              ) : (
                <>
                  <option value="s-1">Giai đoạn 1: Chuẩn bị hồ sơ</option>
                  <option value="s-2">Giai đoạn 2: Nộp đơn</option>
                </>
              )}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="cr-assignee" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Phân công người làm
              </label>
              <select
                id="cr-assignee"
                aria-label="Phân công"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Chưa phân công --</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
                <option value="u-atty-1">Lê Mai Anh</option>
                <option value="u-mgr-1">LS. Nguyễn Văn Trường</option>
              </select>
            </div>

            <div>
              <label htmlFor="cr-weight" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Trọng số độ phức tạp (1–4) *
              </label>
              <select
                id="cr-weight"
                aria-label="Trọng số độ phức tạp"
                value={complexityWeight}
                onChange={(e) => setComplexityWeight(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="1">1 - Cơ bản</option>
                <option value="2">2 - Trung bình</option>
                <option value="3">3 - Phức tạp</option>
                <option value="4">4 - Rất phức tạp</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="cr-due" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Hạn chót mong muốn
            </label>
            <input
              id="cr-due"
              type="date"
              aria-label="Hạn chót mong muốn"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="cr-reason" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Lý do đề xuất bổ sung *
            </label>
            <textarea
              id="cr-reason"
              rows={3}
              aria-label="Lý do đề xuất"
              placeholder="Nhập lý do chi tiết cần đề xuất bổ sung tác vụ này..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
            >
              {createMutation.isPending ? 'Đang gửi...' : 'Gửi đề xuất'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
