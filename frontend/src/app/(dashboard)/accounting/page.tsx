'use client';

import React, { useState } from 'react';
import { useMe } from '@/hooks/use-auth';
import { useAccountingInbox } from '@/hooks/use-accounting';
import { AccountingInboxItem } from '@/types/finance';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ConfirmPaymentModal } from '@/components/accounting/confirm-payment-modal';
import { formatVnd } from '@/lib/format';

export default function AccountingInboxPage() {
  const { data: user, isLoading: isUserLoading } = useMe();
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMilestone, setSelectedMilestone] = useState<AccountingInboxItem | null>(null);

  const {
    data: inboxData,
    isLoading: isInboxLoading,
    isError,
    error,
    refetch,
  } = useAccountingInbox({
    status: statusFilter || undefined,
    q: searchQuery || undefined,
    page: 1,
    limit: 20,
  });

  // Kiểm tra phân quyền truy cập: chỉ dành cho ACCOUNTANT
  if (!isUserLoading && user && user.system_role !== 'ACCOUNTANT') {
    return (
      <div className="p-8">
        <ErrorState
          title="Không có quyền truy cập"
          message="Chức năng Bàn làm việc Kế toán chỉ dành cho Kế toán viên (ACCOUNTANT)."
        />
      </div>
    );
  }

  const isDataLoading = isUserLoading || isInboxLoading;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Bàn làm việc Kế toán & Đối soát đợt thu
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Xử lý hàng chờ đối soát thanh toán với phần mềm hoá đơn MISA và ngân hàng
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo mã vụ việc, tiêu đề hoặc khách hàng..."
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="w-full sm:w-48">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="AWAITING_PAYMENT">Chờ thanh toán</option>
            <option value="PARTIALLY_PAID">Thu một phần</option>
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      {isDataLoading ? (
        <div className="p-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <LoadingSkeleton lines={6} />
        </div>
      ) : isError ? (
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <ErrorState
            title="Lỗi tải dữ liệu"
            message={
              error instanceof Error
                ? error.message
                : 'Không thể kết nối máy chủ.'
            }
            onRetry={() => refetch()}
          />
        </div>
      ) : !inboxData?.data || inboxData.data.length === 0 ? (
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <EmptyState
            title="Danh sách trống"
            description="Không có đợt thu nào cần đối soát hoặc xử lý trong danh sách."
          />
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-200 dark:border-slate-800 font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-4">Vụ việc & Khách hàng</th>
                  <th className="p-4">Tên đợt thu</th>
                  <th className="p-4 text-right">Số tiền</th>
                  <th className="p-4 text-right">Đã thu</th>
                  <th className="p-4 text-right">Còn lại</th>
                  <th className="p-4">Chờ từ ngày</th>
                  <th className="p-4 text-center">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {inboxData.data.map((item) => {
                  const awaitingDate = new Date(item.awaiting_since);
                  const daysWaiting = Math.floor(
                    (Date.now() - awaitingDate.getTime()) / (24 * 60 * 60 * 1000)
                  );
                  const isOverdue = daysWaiting > 7;

                  return (
                    <tr
                      key={item.milestone_id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="p-4 space-y-1">
                        <div className="font-bold text-blue-600 dark:text-blue-400 font-mono">
                          {item.case.case_code}
                        </div>
                        <div className="font-semibold text-slate-800 dark:text-slate-100 line-clamp-1">
                          {item.case.title}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {item.case.client_name}
                        </div>
                      </td>
                      <td className="p-4 font-semibold text-slate-800 dark:text-slate-200">
                        {item.name}
                      </td>
                      <td className="p-4 text-right font-mono font-bold">
                        {formatVnd(item.amount)}
                      </td>
                      <td className="p-4 text-right font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                        {formatVnd(item.received_total)}
                      </td>
                      <td className="p-4 text-right font-mono text-amber-600 dark:text-amber-400 font-bold">
                        {formatVnd(item.remaining)}
                      </td>
                      <td className="p-4 space-y-1">
                        <div>{awaitingDate.toLocaleDateString('vi-VN')}</div>
                        {isOverdue && (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                            Quá hạn (&gt; 7 ngày)
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedMilestone(item)}
                          className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-sm"
                        >
                          Xác nhận đã thu
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal xác nhận thanh toán */}
      {selectedMilestone && (
        <ConfirmPaymentModal
          item={selectedMilestone}
          isOpen={Boolean(selectedMilestone)}
          onClose={() => setSelectedMilestone(null)}
          onRefreshInbox={() => refetch()}
        />
      )}
    </div>
  );
}
