'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useApprovals, useDecideApproval } from '@/hooks/use-approvals';
import type { Approval, ApprovalType } from '@/types/tasks';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ApiError } from '@/lib/api-client';

const TYPE_LABELS: Record<ApprovalType, string> = {
  TASK: 'Tác vụ',
  STAGE_GATE: 'Cổng giai đoạn',
  CHANGE_REQUEST: 'Yêu cầu bổ sung',
};

export default function ApprovalsPage() {
  const [selectedType, setSelectedType] = useState<string | undefined>(undefined);
  const [rejectingApproval, setRejectingApproval] = useState<Approval | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    data: approvals,
    isLoading,
    isError,
    error,
    refetch,
  } = useApprovals(selectedType);

  const decideMutation = useDecideApproval();

  const handleApprove = (approval: Approval) => {
    setGeneralError(null);
    setSuccessMessage(null);

    decideMutation.mutate(
      {
        id: approval.id,
        action: 'APPROVE',
      },
      {
        onSuccess: () => {
          setSuccessMessage(`Đã phê duyệt yêu cầu thành công.`);
          refetch();
        },
        onError: (err: unknown) => {
          if (err instanceof ApiError && err.code === 'APPROVAL_NOT_ALLOWED') {
            setGeneralError('Bạn không thể duyệt yêu cầu của chính mình.');
          } else if (err instanceof Error) {
            setGeneralError(err.message);
          } else {
            setGeneralError('Có lỗi xảy ra khi phê duyệt.');
          }
        },
      }
    );
  };

  const handleConfirmReject = (e: React.FormEvent) => {
    e.preventDefault();
    setRejectError(null);
    setGeneralError(null);

    const trimmed = rejectReason.trim();
    if (!trimmed) {
      setRejectError('Lý do bắt buộc: vui lòng nhập lý do trả về.');
      return;
    }

    if (!rejectingApproval) return;

    decideMutation.mutate(
      {
        id: rejectingApproval.id,
        action: 'REJECT',
        comment: trimmed,
      },
      {
        onSuccess: () => {
          setSuccessMessage(`Đã trả về yêu cầu thành công.`);
          setRejectingApproval(null);
          setRejectReason('');
          refetch();
        },
        onError: (err: unknown) => {
          if (err instanceof ApiError && err.code === 'APPROVAL_NOT_ALLOWED') {
            setGeneralError('Bạn không thể duyệt yêu cầu của chính mình.');
          } else if (err instanceof Error) {
            setGeneralError(err.message);
          } else {
            setGeneralError('Có lỗi xảy ra khi trả về.');
          }
        },
      }
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Hàng chờ phê duyệt
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Danh sách các tác vụ, cổng giai đoạn và yêu cầu bổ sung đang chờ bạn xem xét
          </p>
        </div>

        {/* Bộ lọc theo loại */}
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-100 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setSelectedType(undefined)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              selectedType === undefined
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Tất cả
          </button>
          <button
            type="button"
            onClick={() => setSelectedType('TASK')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              selectedType === 'TASK'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Tác vụ
          </button>
          <button
            type="button"
            onClick={() => setSelectedType('STAGE_GATE')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              selectedType === 'STAGE_GATE'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Cổng giai đoạn
          </button>
          <button
            type="button"
            onClick={() => setSelectedType('CHANGE_REQUEST')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              selectedType === 'CHANGE_REQUEST'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Yêu cầu bổ sung
          </button>
        </div>
      </div>

      {/* Thông báo kết quả / lỗi */}
      {generalError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center justify-between dark:bg-red-950/30 dark:border-red-900 dark:text-red-400 text-sm font-medium">
          <span>{generalError}</span>
          <button
            type="button"
            onClick={() => setGeneralError(null)}
            className="text-xs font-semibold hover:underline"
          >
            Đóng
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl flex items-center justify-between dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-400 text-sm font-medium">
          <span>{successMessage}</span>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-xs font-semibold hover:underline"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Danh sách yêu cầu */}
      {isLoading ? (
        <div className="space-y-4">
          <LoadingSkeleton lines={4} />
        </div>
      ) : isError ? (
        <ErrorState
          title="Không thể tải hàng chờ"
          message={error instanceof Error ? error.message : 'Lỗi kết nối máy chủ'}
          onRetry={refetch}
        />
      ) : !approvals || approvals.length === 0 ? (
        <EmptyState
          title="Không có yêu cầu nào chờ duyệt"
          description="Hiện tại không có mục nào đang chờ bạn xử lý."
        />
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Loại</th>
                  <th className="py-3 px-4">Vụ việc</th>
                  <th className="py-3 px-4">Đối tượng xét duyệt</th>
                  <th className="py-3 px-4">Người gửi & Thời gian</th>
                  <th className="py-3 px-4">Ghi chú</th>
                  <th className="py-3 px-4 text-right">Quyết định</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700 text-xs">
                {approvals.map((item, index) => {
                  const isFirstOccurrence = approvals.findIndex((a) => a.case.case_code === item.case.case_code) === index;
                  const displayCaseCode = isFirstOccurrence ? item.case.case_code : `Vụ việc ${item.case.case_code}`;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                          {TYPE_LABELS[item.type] || item.type}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Link
                          href={`/cases/${item.case.id}`}
                          className="font-bold text-blue-600 hover:text-blue-800 dark:text-blue-400 hover:underline block"
                        >
                          {displayCaseCode}
                        </Link>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block line-clamp-1">
                          {item.case.title}
                        </span>
                      </td>
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                      {item.subject.title}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      <div className="font-medium text-slate-800 dark:text-slate-200">
                        {item.requested_by.full_name}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {new Date(item.requested_at).toLocaleString('vi-VN')}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400 max-w-xs truncate">
                      {item.note || '--'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleApprove(item)}
                          disabled={decideMutation.isPending}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                        >
                          Phê duyệt
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRejectingApproval(item);
                            setRejectReason('');
                            setRejectError(null);
                          }}
                          disabled={decideMutation.isPending}
                          className="px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-300 disabled:opacity-50"
                        >
                          Trả về
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Trả về (bắt buộc nhập lý do) */}
      {rejectingApproval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Trả về yêu cầu: {rejectingApproval.subject.title}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Vui lòng nêu rõ lý do yêu cầu cần bổ sung hoặc điều chỉnh để người gửi hoàn thiện lại.
            </p>

            {rejectError && (
              <div className="p-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg dark:bg-red-950/30 dark:border-red-900 dark:text-red-400">
                {rejectError}
              </div>
            )}

            <form onSubmit={handleConfirmReject} className="space-y-4">
              <div>
                <label htmlFor="approval-reject-reason" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Lý do trả về *
                </label>
                <textarea
                  id="approval-reject-reason"
                  rows={3}
                  aria-label="Lý do"
                  placeholder="Nhập lý do trả về..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectingApproval(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={decideMutation.isPending}
                  className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm disabled:opacity-50"
                >
                  {decideMutation.isPending ? 'Đang gửi...' : 'Xác nhận trả về'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
