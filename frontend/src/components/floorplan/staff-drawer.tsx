/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from 'react';
import type { ApprovalQueueItem, FloorplanUser } from '@/types/floorplan';
import { useDecideApproval } from '@/hooks/use-approvals';
import { ApiError } from '@/lib/api-client';

interface StaffDrawerProps {
  user: FloorplanUser | null;
  queueItem?: ApprovalQueueItem;
  onClose: () => void;
  onDecideSuccess?: () => void;
}

function getInitials(name: string): string {
  if (!name) return '';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  const first = words[words.length - 2][0];
  const last = words[words.length - 1][0];
  return (first + last).toUpperCase();
}

export function StaffDrawer({
  user,
  queueItem,
  onClose,
  onDecideSuccess,
}: StaffDrawerProps) {
  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [validationError, setValidationError] = useState<string>('');
  const [apiErrorMessage, setApiErrorMessage] = useState<string>('');

  const decideMutation = useDecideApproval();

  if (!user) return null;

  const requests = queueItem?.requests || [];

  const handleApprove = (requestId: string) => {
    setApiErrorMessage('');
    setValidationError('');
    const options = {
      onSuccess: () => {
        onDecideSuccess?.();
      },
      onError: (err: unknown) => {
        const anyErr = err as any;
        if (anyErr?.code === 'APPROVAL_NOT_ALLOWED' || (err instanceof ApiError && err.code === 'APPROVAL_NOT_ALLOWED')) {
          setApiErrorMessage('Bạn không thể duyệt yêu cầu của chính mình');
        } else if (err instanceof Error) {
          setApiErrorMessage(err.message);
        } else {
          setApiErrorMessage('Đã xảy ra lỗi khi phê duyệt');
        }
      },
    };

    (decideMutation.mutate as any)(
      {
        id: requestId,
        action: 'APPROVE',
        ...options,
      },
      options
    );
  };

  const handleRejectClick = (requestId: string) => {
    setApiErrorMessage('');
    if (rejectingRequestId !== requestId) {
      setRejectingRequestId(requestId);
      setValidationError('Vui lòng nhập lý do trả về');
      return;
    }

    if (!rejectReason.trim()) {
      setValidationError('Vui lòng nhập lý do trả về');
      return;
    }

    setValidationError('');
    const options = {
      onSuccess: () => {
        setRejectingRequestId(null);
        setRejectReason('');
        onDecideSuccess?.();
      },
      onError: (err: unknown) => {
        const anyErr = err as any;
        if (anyErr?.code === 'APPROVAL_NOT_ALLOWED' || (err instanceof ApiError && err.code === 'APPROVAL_NOT_ALLOWED')) {
          setApiErrorMessage('Bạn không thể duyệt yêu cầu của chính mình');
        } else if (err instanceof Error) {
          setApiErrorMessage(err.message);
        } else {
          setApiErrorMessage('Đã xảy ra lỗi khi từ chối hồ sơ');
        }
      },
    };

    (decideMutation.mutate as any)(
      {
        id: requestId,
        action: 'REJECT',
        comment: rejectReason.trim(),
        ...options,
      },
      options
    );
  };

  return (
    <div
      role="dialog"
      data-drawer="true"
      aria-labelledby="drawer-user-title"
      className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
        <h3 id="drawer-user-title" className="text-sm font-bold text-slate-800 dark:text-slate-100">
          Thông tin nhân sự
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          aria-label="Đóng ngăn chi tiết"
        >
          Đóng
        </button>
      </div>

      {/* User Info */}
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-lg font-bold text-slate-700 dark:text-slate-300">
                {getInitials(user.name)}
              </span>
            )}
          </div>
          <div>
            <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {user.name}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {user.title}
            </p>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {apiErrorMessage && (
          <div className="p-3 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 text-xs text-red-600 dark:text-red-400">
            {apiErrorMessage}
          </div>
        )}

        {/* Danh sách yêu cầu chờ duyệt */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Hồ sơ chờ phê duyệt ({requests.length})
            </h5>
          </div>

          {requests.length === 0 ? (
            <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
              Không có hồ sơ nào đang chờ duyệt.
            </div>
          ) : (
            <div className="space-y-4">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400">
                      {req.case_code}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {req.requested_at ? new Date(req.requested_at).toLocaleDateString('vi-VN') : ''}
                    </span>
                  </div>

                  <h6 className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-3">
                    {req.title}
                  </h6>

                  {/* Reject Input box if opened */}
                  {rejectingRequestId === req.id && (
                    <div className="mt-2 mb-3">
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Lý do trả về (bắt buộc):
                      </label>
                      <textarea
                        value={rejectReason}
                        onChange={(e) => {
                          setRejectReason(e.target.value);
                          if (e.target.value.trim()) {
                            setValidationError('');
                          }
                        }}
                        placeholder="Nhập lý do trả về hồ sơ..."
                        rows={2}
                        className="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                      {validationError && (
                        <p className="mt-1 text-[11px] text-red-500 font-medium">
                          {validationError}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      disabled={decideMutation.isPending}
                      onClick={() => handleApprove(req.id)}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                    >
                      Duyệt
                    </button>

                    {rejectingRequestId === req.id ? (
                      <div className="flex items-center space-x-1.5">
                        <button
                          type="button"
                          disabled={decideMutation.isPending}
                          onClick={() => handleRejectClick(req.id)}
                          className="px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                        >
                          Xác nhận trả về
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRejectingRequestId(null);
                            setRejectReason('');
                            setValidationError('');
                          }}
                          className="px-2 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                        >
                          Hủy
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={decideMutation.isPending}
                        onClick={() => handleRejectClick(req.id)}
                        className="px-3 py-1.5 text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors border border-red-200 dark:border-red-900/50 disabled:opacity-50"
                      >
                        Trả về
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
