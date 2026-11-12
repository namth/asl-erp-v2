import React from 'react';
import type { DepartmentMeta } from '@/types/reports';

export interface ReportFiltersProps {
  from: string;
  to: string;
  onFromChange: (val: string) => void;
  onToChange: (val: string) => void;
  dateError: string | null;
  departments: DepartmentMeta[];
  departmentId: string;
  onDepartmentChange: (val: string) => void;
  onExport: () => void;
  isExporting: boolean;
  exportError: string | null;
}

export function ReportFilters({
  from,
  to,
  onFromChange,
  onToChange,
  dateError,
  departments,
  departmentId,
  onDepartmentChange,
  onExport,
  isExporting,
  exportError,
}: ReportFiltersProps) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Từ</span>
            <input
              type="date"
              role="textbox"
              aria-label="Ngày bắt đầu"
              value={from}
              onChange={(e) => onFromChange(e.target.value)}
              className="px-3 py-1.5 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Đến</span>
            <input
              type="date"
              role="textbox"
              aria-label="Ngày kết thúc"
              value={to}
              onChange={(e) => onToChange(e.target.value)}
              className="px-3 py-1.5 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {departments && departments.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Phòng ban</span>
              <select
                aria-label="Phòng ban"
                value={departmentId}
                onChange={(e) => onDepartmentChange(e.target.value)}
                className="px-3 py-1.5 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="">Tất cả phòng ban</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExport}
            disabled={isExporting}
            className="px-4 py-2 text-xs font-bold text-white rounded-xl bg-gradient-to-r from-[#002D54] to-[#0082B4] hover:from-[#002444] hover:to-[#00709c] disabled:opacity-50 transition-all shadow-sm flex items-center gap-2"
          >
            {isExporting ? 'Đang xuất...' : 'Xuất Excel'}
          </button>
        </div>
      </div>

      {dateError && (
        <p className="text-xs font-semibold text-red-600 dark:text-red-400">{dateError}</p>
      )}

      {exportError && (
        <p className="text-xs font-semibold text-red-600 dark:text-red-400">{exportError}</p>
      )}
    </div>
  );
}
