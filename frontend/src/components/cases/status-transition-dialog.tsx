import React, { useState } from 'react';
import { CaseStatus } from '@/types/cases';

export interface StatusTransitionDialogProps {
  isOpen: boolean;
  targetStatus: CaseStatus | null;
  onClose: () => void;
  onConfirm: (payload: { status: CaseStatus; reason?: string }) => Promise<void>;
  isSubmitting?: boolean;
}

export function StatusTransitionDialog({
  isOpen,
  targetStatus,
  onClose,
  onConfirm,
  isSubmitting = false,
}: StatusTransitionDialogProps) {
  const [reason, setReason] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !targetStatus) return null;

  const isReasonRequired = targetStatus === 'PAUSED' || targetStatus === 'TERMINATED';
  const isTerminated = targetStatus === 'TERMINATED';
  const isPaused = targetStatus === 'PAUSED';

  const titles: Record<CaseStatus, string> = {
    ACTIVE: 'Kích hoạt / Tiếp tục vụ việc',
    PAUSED: 'Tạm dừng vụ việc',
    TERMINATED: 'Huỷ vụ việc (Chấm dứt hợp đồng)',
    CLOSED: 'Đóng vụ việc (Hoàn tất)',
    INITIALIZING: 'Khởi tạo vụ việc',
  };

  const confirmLabels: Record<CaseStatus, string> = {
    ACTIVE: 'Xác nhận tiếp tục',
    PAUSED: 'Xác nhận tạm dừng',
    TERMINATED: 'Xác nhận huỷ vụ việc',
    CLOSED: 'Xác nhận đóng vụ việc',
    INITIALIZING: 'Xác nhận',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (isReasonRequired && !reason.trim()) {
      setErrorMessage('Vui lòng nhập lý do cho thao tác này');
      return;
    }

    try {
      await onConfirm({
        status: targetStatus,
        reason: reason.trim() || undefined,
      });
      setReason('');
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Không thể cập nhật trạng thái vụ việc');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {titles[targetStatus]}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            {isTerminated && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2.5">
                <svg className="w-4 h-4 mt-0.5 text-rose-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="space-y-1">
                  <div className="font-bold">Cảnh báo huỷ vụ việc:</div>
                  <div>
                    Khi huỷ vụ việc, các đợt thu chưa thu sẽ bị huỷ. Các tác vụ chưa hoàn thành sẽ được giữ nguyên trạng thái để đối soát.
                  </div>
                </div>
              </div>
            )}

            {isPaused && (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-200">
                Khi tạm dừng vụ việc, mọi tác vụ thuộc vụ việc này sẽ bị khoá thay đổi trạng thái và SLA sẽ được tạm dừng tính toán.
              </div>
            )}

            {isReasonRequired && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Lý do <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={
                    isPaused
                      ? 'Nhập lý do tạm dừng vụ việc...'
                      : 'Nhập lý do huỷ hoặc chấm dứt vụ việc...'
                  }
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-300 font-medium">
                {errorMessage}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50/50 dark:bg-slate-900/50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 transition-colors"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2 text-xs font-bold text-white rounded-xl transition-colors shadow-sm disabled:opacity-50 ${
                isTerminated
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-[#002D54] hover:bg-[#001f3b]'
              }`}
            >
              {isSubmitting ? 'Đang xử lý...' : confirmLabels[targetStatus]}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
