import React from 'react';
import { MyTasksSummary } from '@/hooks/use-my-tasks';
import { CheckCircle2, Clock, AlertCircle, FileCheck } from 'lucide-react';

interface KpiCardsProps {
  summary?: MyTasksSummary;
  isLoading?: boolean;
}

export function KpiCards({ summary, isLoading }: KpiCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 bg-slate-100 dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-800"
          />
        ))}
      </div>
    );
  }

  const todo = summary?.todo ?? 0;
  const inProgress = summary?.in_progress ?? 0;
  const waitingApproval = summary?.waiting_approval ?? 0;
  const overdue = summary?.overdue ?? 0;

  const isOverdueAlert = overdue > 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Cần làm */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">
            Cần làm
          </span>
          <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 mt-1 block">
            {todo}
          </span>
        </div>
        <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
          <Clock className="w-5 h-5" />
        </div>
      </div>

      {/* Đang làm */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">
            Đang làm
          </span>
          <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 mt-1 block">
            {inProgress}
          </span>
        </div>
        <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 text-[#0082B4] flex items-center justify-center">
          <FileCheck className="w-5 h-5" />
        </div>
      </div>

      {/* Chờ duyệt */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">
            Chờ duyệt
          </span>
          <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 mt-1 block">
            {waitingApproval}
          </span>
        </div>
        <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
          <CheckCircle2 className="w-5 h-5" />
        </div>
      </div>

      {/* Quá hạn */}
      <div
        className={`rounded-2xl p-5 border shadow-sm flex items-center justify-between transition-colors ${
          isOverdueAlert
            ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100'
        }`}
      >
        <div>
          <span
            className={`text-xs font-semibold block ${
              isOverdueAlert
                ? 'text-red-700 dark:text-red-300'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            Quá hạn
          </span>
          <span
            className={`text-2xl font-extrabold mt-1 block ${
              isOverdueAlert ? 'text-red-600 dark:text-red-400' : ''
            }`}
          >
            {overdue}
          </span>
        </div>
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            isOverdueAlert
              ? 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
          }`}
        >
          <AlertCircle className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}
