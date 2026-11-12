import React from 'react';
import type { CommissionsReportData } from '@/types/reports';
import { formatVnd } from '@/lib/reports';
import { EmptyState } from '@/components/ui/empty-state';

export interface CommissionsTabProps {
  data: CommissionsReportData;
  payoutStatus: 'ACCUMULATED' | 'DISBURSED' | '';
  onPayoutStatusChange: (val: 'ACCUMULATED' | 'DISBURSED' | '') => void;
}

export function CommissionsTab({
  data,
  payoutStatus,
  onPayoutStatusChange,
}: CommissionsTabProps) {
  const isDataEmpty =
    data.summary.total_amount === '0' &&
    data.summary.accumulated_amount === '0' &&
    data.summary.disbursed_amount === '0' &&
    data.by_user.length === 0;

  if (isDataEmpty) {
    return (
      <EmptyState
        title="Chưa có số liệu trong kỳ này"
        description="Không tìm thấy dữ liệu phát sinh hoa hồng trong khoảng thời gian đã chọn."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* 3 KPI Cards & Payout Filter */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Trạng thái chi trả
          </span>
          <select
            aria-label="Trạng thái chi trả"
            value={payoutStatus}
            onChange={(e) =>
              onPayoutStatusChange(e.target.value as 'ACCUMULATED' | 'DISBURSED' | '')
            }
            className="px-3 py-1.5 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="">Tất cả</option>
            <option value="ACCUMULATED">Tích luỹ</option>
            <option value="DISBURSED">Đã chi</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-gradient-to-br from-[#002D54] to-[#00487C] text-white shadow-md">
          <div className="text-xs font-semibold uppercase tracking-wider text-sky-200">
            Tổng hoa hồng
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold mt-2 font-mono">
            {formatVnd(data.summary.total_amount)}
          </div>
          <div className="text-xs text-sky-200 mt-2">Toàn bộ hoa hồng phát sinh</div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            Tích luỹ
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold mt-2 text-slate-900 dark:text-slate-100 font-mono">
            {formatVnd(data.summary.accumulated_amount)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">Chưa chi trả</div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Đã chi
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold mt-2 text-slate-900 dark:text-slate-100 font-mono">
            {formatVnd(data.summary.disbursed_amount)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">Đã thực hiện chi trả</div>
        </div>
      </div>

      {/* Table by User */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">
          Hoa hồng theo nhân sự
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
              <tr>
                <th className="py-2.5 font-semibold">Nhân sự</th>
                <th className="py-2.5 font-semibold text-right">Tổng hoa hồng</th>
                <th className="py-2.5 font-semibold text-right">Tích luỹ</th>
                <th className="py-2.5 font-semibold text-right">Đã chi</th>
                <th className="py-2.5 font-semibold text-right">Mang khách về</th>
                <th className="py-2.5 font-semibold text-right">Giám sát</th>
                <th className="py-2.5 font-semibold text-right">Quản lý vụ việc</th>
                <th className="py-2.5 font-semibold text-right">Thực hiện</th>
                <th className="py-2.5 font-semibold text-right">Hỗ trợ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.by_user.map((item) => (
                <tr key={item.user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="py-2.5">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {item.user.full_name}
                    </div>
                    {item.user.department_name && (
                      <div className="text-[10px] text-slate-500">
                        {item.user.department_name}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                    {formatVnd(item.total_amount)}
                  </td>
                  <td className="py-2.5 text-right font-mono text-amber-600 dark:text-amber-400">
                    {formatVnd(item.accumulated_amount)}
                  </td>
                  <td className="py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400">
                    {formatVnd(item.disbursed_amount)}
                  </td>
                  <td className="py-2.5 text-right font-mono text-slate-600 dark:text-slate-400">
                    {formatVnd(item.by_role?.ORIGINATOR || '0')}
                  </td>
                  <td className="py-2.5 text-right font-mono text-slate-600 dark:text-slate-400">
                    {formatVnd(item.by_role?.SUPERVISOR || '0')}
                  </td>
                  <td className="py-2.5 text-right font-mono text-slate-600 dark:text-slate-400">
                    {formatVnd(item.by_role?.CASE_MANAGER || '0')}
                  </td>
                  <td className="py-2.5 text-right font-mono text-slate-600 dark:text-slate-400">
                    {formatVnd(item.by_role?.EXECUTOR || '0')}
                  </td>
                  <td className="py-2.5 text-right font-mono text-slate-600 dark:text-slate-400">
                    {formatVnd(item.by_role?.ASSISTANT || '0')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
