import React from 'react';
import type { CommissionsReportData } from '@/types/reports';
import { formatVnd } from '@/lib/format';
import { EmptyState } from '@/components/ui/empty-state';

export interface CommissionsTabProps {
  data: CommissionsReportData;
}

function formatPeriod(period: string): string {
  const parts = period.split('-');
  if (parts.length === 2) {
    return `${parts[1]}/${parts[0]}`;
  }
  return period;
}

export function CommissionsTab({ data }: CommissionsTabProps) {
  const isDataEmpty = !data?.by_user || data.by_user.length === 0;

  if (isDataEmpty) {
    return (
      <EmptyState
        title="Chưa có số liệu trong kỳ này"
        description="Dữ liệu hoa hồng trống trong khoảng thời gian đã chọn."
      />
    );
  }

  const periods = data.periods || [];

  return (
    <div className="space-y-6">
      {/* 2 KPI Cards: Tổng hoa hồng & Số bút toán */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Số bút toán
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold mt-2 text-slate-900 dark:text-slate-100 font-mono">
            {data.summary.transaction_count}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Giao dịch ghi nhận trong kỳ
          </div>
        </div>
      </div>

      {/* Bảng 1: Hoa hồng theo tháng */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">
          Hoa hồng theo tháng
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
              <tr>
                <th className="py-2.5 font-semibold">Nhân sự</th>
                <th className="py-2.5 font-semibold">Phòng ban</th>
                {periods.map((p) => (
                  <th key={p} className="py-2.5 font-semibold text-right">
                    {formatPeriod(p)}
                  </th>
                ))}
                <th className="py-2.5 font-semibold text-right">Tổng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.by_user.map((item) => (
                <tr key={item.user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="py-2.5 font-semibold text-slate-900 dark:text-slate-100">
                    {item.user.full_name}
                  </td>
                  <td className="py-2.5 text-slate-500 dark:text-slate-400">
                    {item.user.department_name || '—'}
                  </td>
                  {periods.map((p) => {
                    const periodItem = item.by_period?.find((bp) => bp.period === p);
                    return (
                      <td key={p} className="py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">
                        {formatVnd(periodItem?.total_amount || '0')}
                      </td>
                    );
                  })}
                  <td className="py-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                    {formatVnd(item.total_amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-300 dark:border-slate-700 font-bold">
              <tr className="bg-slate-50/50 dark:bg-slate-800/30">
                <td className="py-2.5 text-slate-900 dark:text-slate-100">Tổng cộng</td>
                <td className="py-2.5 text-slate-500 dark:text-slate-400">—</td>
                {periods.map((p) => {
                  const periodItem = data.by_period?.find((bp) => bp.period === p);
                  return (
                    <td key={p} className="py-2.5 text-right font-mono text-slate-900 dark:text-slate-100">
                      {formatVnd(periodItem?.total_amount || '0')}
                    </td>
                  );
                })}
                <td className="py-2.5 text-right font-mono text-slate-900 dark:text-slate-100">
                  {formatVnd(data.summary?.total_amount || '0')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Bảng 2: Theo vai trò */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">
          Theo vai trò
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
              <tr>
                <th className="py-2.5 font-semibold">Nhân sự</th>
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
                  <td className="py-2.5 font-semibold text-slate-900 dark:text-slate-100">
                    {item.user.full_name} {item.user.department_name ? `(${item.user.department_name})` : ''}
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
