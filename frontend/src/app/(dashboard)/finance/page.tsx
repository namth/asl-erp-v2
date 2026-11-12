'use client';

import React, { useState } from 'react';
import { useMe } from '@/hooks/use-auth';
import { useCommissions } from '@/hooks/use-finance';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { formatVnd } from '@/lib/format';

export default function CommissionsPage() {
  const { data: user, isLoading: isUserLoading } = useMe();

  const [caseId, setCaseId] = useState('');
  const [userId, setUserId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const isAttorney = user?.system_role === 'ATTORNEY';

  // Nếu là ATTORNEY, không truyền user_id lọc của người khác
  const effectiveUserId = isAttorney ? undefined : (userId.trim() || undefined);

  const {
    data: commissionsData,
    isLoading: isCommissionsLoading,
    isError,
    error,
    refetch,
  } = useCommissions({
    case_id: caseId.trim() || undefined,
    user_id: effectiveUserId,
    from: fromDate || undefined,
    to: toDate || undefined,
    page: 1,
    limit: 20,
  });

  const handleExportExcel = () => {
    const params = new URLSearchParams();
    if (caseId.trim()) params.set('case_id', caseId.trim());
    if (effectiveUserId) params.set('user_id', effectiveUserId);
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);

    const queryStr = params.toString();
    const exportUrl = `/finance/commissions/export${queryStr ? `?${queryStr}` : ''}`;
    window.open(exportUrl);
  };

  const isDataLoading = isUserLoading || isCommissionsLoading;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Sổ hoa hồng thực thu
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Theo dõi phân bổ hoa hồng thực tế theo từng đợt thanh toán của vụ việc
          </p>
        </div>
        <div>
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-sm flex items-center gap-2"
          >
            <span>Xuất Excel</span>
          </button>
        </div>
      </div>

      {/* Summary bar */}
      {commissionsData?.summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="p-4 rounded-2xl bg-[#002D54] text-white shadow-sm space-y-1">
            <span className="text-[11px] font-bold text-cyan-200 uppercase tracking-wider">
              Tổng hoa hồng
            </span>
            <div className="text-lg font-bold font-mono">
              {formatVnd(commissionsData.summary.total_amount)}
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Người tạo (ORIGINATOR)
            </span>
            <div className="text-base font-bold font-mono text-slate-800 dark:text-slate-100">
              {formatVnd(commissionsData.summary.by_role?.ORIGINATOR || '0')}
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Giám sát (SUPERVISOR)
            </span>
            <div className="text-base font-bold font-mono text-slate-800 dark:text-slate-100">
              {formatVnd(commissionsData.summary.by_role?.SUPERVISOR || '0')}
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Quản lý (CASE_MANAGER)
            </span>
            <div className="text-base font-bold font-mono text-slate-800 dark:text-slate-100">
              {formatVnd(commissionsData.summary.by_role?.CASE_MANAGER || '0')}
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Thực hiện (EXECUTOR)
            </span>
            <div className="text-base font-bold font-mono text-slate-800 dark:text-slate-100">
              {formatVnd(commissionsData.summary.by_role?.EXECUTOR || '0')}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label htmlFor="case_id" className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
            Mã vụ việc
          </label>
          <input
            id="case_id"
            type="text"
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            placeholder="Mã vụ việc..."
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Bộ lọc người: chỉ hiển thị cho ACCOUNTANT, MANAGER, ADMIN */}
        {!isAttorney && (
          <div>
            <label htmlFor="user_id" className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
              Chọn nhân sự
            </label>
            <input
              id="user_id"
              name="user_id"
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Tất cả nhân sự"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        <div>
          <label htmlFor="from_date" className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
            Từ ngày
          </label>
          <input
            id="from_date"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="to_date" className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
            Đến ngày
          </label>
          <input
            id="to_date"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Main Content Table */}
      {isDataLoading ? (
        <div className="p-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <LoadingSkeleton lines={6} />
        </div>
      ) : isError ? (
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <ErrorState
            title="Lỗi tải dữ liệu"
            message={error instanceof Error ? error.message : 'Không thể kết nối máy chủ.'}
            onRetry={() => refetch()}
          />
        </div>
      ) : !commissionsData?.data || commissionsData.data.length === 0 ? (
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <EmptyState
            title="Danh sách trống"
            description="Chưa có hoa hồng nào được ghi nhận."
          />
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-200 dark:border-slate-800 font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-4">Vụ việc</th>
                  <th className="p-4">Đợt thu</th>
                  <th className="p-4">Nhân sự</th>
                  <th className="p-4">Vai trò</th>
                  <th className="p-4">Tác vụ liên quan</th>
                  <th className="p-4 text-right">Căn cứ tính</th>
                  <th className="p-4 text-right">Tỷ lệ</th>
                  <th className="p-4 text-right">Hoa hồng thực nhận</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {commissionsData.data.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="p-4 font-mono font-bold text-blue-600 dark:text-blue-400">
                      {item.case?.case_code}
                    </td>
                    <td className="p-4 font-semibold text-slate-800 dark:text-slate-200">
                      {item.milestone?.name}
                    </td>
                    <td className="p-4 font-medium text-slate-800 dark:text-slate-100">
                      {item.user?.full_name}
                    </td>
                    <td className="p-4 font-semibold text-slate-600 dark:text-slate-300">
                      {item.role_type}
                    </td>
                    <td className="p-4 text-slate-500">
                      {item.task?.title || '—'}
                    </td>
                    <td className="p-4 text-right font-mono">
                      {formatVnd(item.base_amount)}
                    </td>
                    <td className="p-4 text-right font-mono font-semibold">
                      {item.rate_pct}%
                    </td>
                    <td className="p-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {formatVnd(item.amount).replace(/\./g, ' ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
