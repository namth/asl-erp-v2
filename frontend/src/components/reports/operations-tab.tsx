import React from 'react';
import Link from 'next/link';
import type { OperationsReportData } from '@/types/reports';
import { formatPct } from '@/lib/reports';
import { EmptyState } from '@/components/ui/empty-state';

export interface OperationsTabProps {
  data: OperationsReportData;
}

export function OperationsTab({ data }: OperationsTabProps) {
  const isDataEmpty =
    !data.cases_by_status.INITIALIZING &&
    !data.cases_by_status.ACTIVE &&
    !data.cases_by_status.PAUSED &&
    !data.cases_by_status.CLOSED &&
    !data.cases_by_status.TERMINATED &&
    data.overdue_tasks.count === 0 &&
    data.stage_durations.length === 0 &&
    data.opportunity_conversion.created_count === 0;

  if (isDataEmpty) {
    return (
      <EmptyState
        title="Chưa có số liệu trong kỳ này"
        description="Không tìm thấy dữ liệu vận hành trong khoảng thời gian đã chọn."
      />
    );
  }

  const caseStatuses = [
    { label: 'Khởi tạo', value: data.cases_by_status.INITIALIZING ?? 0, color: 'text-sky-600' },
    { label: 'Đang thực hiện', value: data.cases_by_status.ACTIVE ?? 0, color: 'text-emerald-600' },
    { label: 'Tạm dừng', value: data.cases_by_status.PAUSED ?? 0, color: 'text-amber-600' },
    { label: 'Đã đóng', value: data.cases_by_status.CLOSED ?? 0, color: 'text-slate-600' },
    { label: 'Chấm dứt', value: data.cases_by_status.TERMINATED ?? 0, color: 'text-rose-600' },
  ];

  return (
    <div className="space-y-6">
      {/* 5 Status Cards */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">
          Trạng thái vụ việc
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {caseStatuses.map((st) => (
            <div
              key={st.label}
              className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm"
            >
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {st.label}
              </div>
              <div className={`text-2xl font-extrabold mt-1 font-mono ${st.color}`}>
                {st.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Overdue Tasks Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Nhiệm vụ quá hạn
          </h3>
          <span className="text-xs text-rose-600 font-semibold">
            {data.overdue_tasks.count} nhiệm vụ quá hạn
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
              <tr>
                <th className="py-2.5 font-semibold">Công việc</th>
                <th className="py-2.5 font-semibold">Vụ việc</th>
                <th className="py-2.5 font-semibold">Người thực hiện</th>
                <th className="py-2.5 font-semibold">Hạn xử lý</th>
                <th className="py-2.5 font-semibold text-right">Quá hạn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.overdue_tasks.items.map((item) => (
                <tr key={item.task_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="py-2.5 font-medium text-slate-800 dark:text-slate-200">
                    {item.title}
                  </td>
                  <td className="py-2.5">
                    <Link
                      href={`/cases/${item.case.id}`}
                      className="text-sky-600 dark:text-sky-400 hover:underline font-mono font-semibold"
                    >
                      {item.case.case_code}
                    </Link>
                  </td>
                  <td className="py-2.5 text-slate-700 dark:text-slate-300">
                    {item.assignee.full_name}
                  </td>
                  <td className="py-2.5 text-slate-500 font-mono">
                    {item.due_date}
                  </td>
                  <td className="py-2.5 text-right font-bold text-rose-600 font-mono">
                    {item.days_overdue} ngày
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stage Durations & Conversion */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stage Durations */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">
            Thời gian xử lý trung bình theo giai đoạn
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="py-2.5 font-semibold">Giai đoạn</th>
                  <th className="py-2.5 font-semibold text-right">Số vụ hoàn thành</th>
                  <th className="py-2.5 font-semibold text-right">Thời gian TB</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.stage_durations.map((st) => (
                  <tr key={st.stage_name} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2.5 font-medium text-slate-800 dark:text-slate-200">
                      {st.stage_name}
                    </td>
                    <td className="py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">
                      {st.completed_count}
                    </td>
                    <td className="py-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                      {st.avg_days} ngày
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Opportunity Conversion */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">
            Chuyển đổi cơ hội khách hàng
          </h3>
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Tỷ lệ chuyển đổi
              </span>
              <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                {formatPct(data.opportunity_conversion.conversion_rate_pct)}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <div className="text-[11px] text-slate-500">Cơ hội tạo</div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100 font-mono mt-1">
                  {data.opportunity_conversion.created_count}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <div className="text-[11px] text-slate-500">Cơ hội thắng</div>
                <div className="text-lg font-bold text-emerald-600 font-mono mt-1">
                  {data.opportunity_conversion.won_count}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <div className="text-[11px] text-slate-500">Chuyển đổi vụ việc</div>
                <div className="text-lg font-bold text-sky-600 font-mono mt-1">
                  {data.opportunity_conversion.converted_count}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
