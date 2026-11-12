import React from 'react';
import type { RevenueReportData } from '@/types/reports';
import { formatVnd, formatPct, barWidths } from '@/lib/reports';
import { EmptyState } from '@/components/ui/empty-state';

export interface RevenueTabProps {
  data: RevenueReportData;
  groupBy: 'month' | 'quarter';
  onGroupByChange: (val: 'month' | 'quarter') => void;
}

export function RevenueTab({ data, groupBy, onGroupByChange }: RevenueTabProps) {
  const isDataEmpty =
    data.summary.received_total === '0' &&
    data.summary.contract_value_total === '0' &&
    data.by_period.length === 0 &&
    data.by_department.length === 0 &&
    data.by_matter_type.length === 0;

  if (isDataEmpty) {
    return (
      <EmptyState
        title="Chưa có số liệu trong kỳ này"
        description="Không tìm thấy dữ liệu phát sinh doanh thu thực thu trong khoảng thời gian đã chọn."
      />
    );
  }

  const periodAmounts = data.by_period.map((p) => p.received_total);
  const widths = barWidths(periodAmounts);

  return (
    <div className="space-y-6">
      {/* 3 KPI Cards + Payment Count */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-gradient-to-br from-[#002D54] to-[#00487C] text-white shadow-md">
          <div className="text-xs font-semibold uppercase tracking-wider text-sky-200">
            Doanh thu thực thu
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold mt-2 font-mono">
            {formatVnd(data.summary.received_total)}
          </div>
          <div className="text-xs text-sky-200 mt-2">
            Tổng cộng <span className="font-bold text-white">{data.summary.payment_count}</span> khoản thu
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Tổng giá trị hợp đồng
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold mt-2 text-slate-900 dark:text-slate-100 font-mono">
            {formatVnd(data.summary.contract_value_total)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Hợp đồng có phát sinh thu trong kỳ
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Tỷ lệ thực thu
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold mt-2 text-emerald-600 dark:text-emerald-400 font-mono">
            {formatPct(data.summary.collection_rate_pct)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            So với tổng giá trị hợp đồng
          </div>
        </div>
      </div>

      {/* Horizontal CSS Bar Chart */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Doanh thu theo kỳ
          </h3>
          <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-medium">
            <button
              type="button"
              onClick={() => onGroupByChange('month')}
              className={`px-3 py-1 rounded-lg transition-all ${
                groupBy === 'month'
                  ? 'bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 shadow-sm font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Tháng
            </button>
            <button
              type="button"
              onClick={() => onGroupByChange('quarter')}
              className={`px-3 py-1 rounded-lg transition-all ${
                groupBy === 'quarter'
                  ? 'bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 shadow-sm font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Quý
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {data.by_period.map((item, idx) => (
            <div key={item.period} className="space-y-1">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-slate-700 dark:text-slate-300 font-mono font-semibold">
                  {item.period}
                </span>
                <span className="text-slate-900 dark:text-slate-100 font-mono font-bold">
                  {formatVnd(item.received_total)}
                </span>
              </div>
              <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden flex">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 to-[#002D54] rounded-lg transition-all duration-500"
                  style={{ width: `${widths[idx] || 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tables: Department & Matter Type */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Department */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">
            Doanh thu theo phòng ban
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="py-2.5 font-semibold">Phòng ban</th>
                  <th className="py-2.5 font-semibold text-right">Doanh thu thực thu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.by_department.map((dept) => (
                  <tr key={dept.department.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2.5 font-medium text-slate-800 dark:text-slate-200">
                      {dept.department.name}
                    </td>
                    <td className="py-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                      {formatVnd(dept.received_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* By Matter Type */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">
            Doanh thu theo loại vụ việc
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="py-2.5 font-semibold">Loại vụ việc</th>
                  <th className="py-2.5 font-semibold text-right">Doanh thu thực thu</th>
                  <th className="py-2.5 font-semibold text-right">Giá trị hợp đồng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.by_matter_type.map((mt) => (
                  <tr key={mt.matter_type.code} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2.5 font-medium text-slate-800 dark:text-slate-200">
                      {mt.matter_type.name}
                    </td>
                    <td className="py-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                      {formatVnd(mt.received_total)}
                    </td>
                    <td className="py-2.5 text-right font-mono text-slate-600 dark:text-slate-400">
                      {formatVnd(mt.contract_value_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
