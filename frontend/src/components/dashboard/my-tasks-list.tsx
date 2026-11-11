import React from 'react';
import Link from 'next/link';
import { MyTaskItem } from '@/hooks/use-my-tasks';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { CheckSquare, ChevronRight, Clock } from 'lucide-react';

interface MyTasksListProps {
  items?: MyTaskItem[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  activeDue?: string;
  onDueChange: (due?: 'overdue' | 'today' | 'week') => void;
}

export function MyTasksList({
  items,
  isLoading,
  isError,
  onRetry,
  activeDue,
  onDueChange,
}: MyTasksListProps) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-[#002D54] dark:text-cyan-400" />
            Nhiệm vụ được phân công
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Danh sách tác vụ trực tiếp của bạn
          </p>
        </div>

        {/* Bộ lọc nhanh: Quá hạn / Hôm nay / Tuần này / Tất cả */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 text-xs">
          <button
            type="button"
            onClick={() => onDueChange(undefined)}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              !activeDue
                ? 'bg-white dark:bg-slate-700 text-[#002D54] dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Tất cả
          </button>
          <button
            type="button"
            aria-label="Quá hạn"
            onClick={() => onDueChange('overdue')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeDue === 'overdue'
                ? 'bg-red-500 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-red-600'
            }`}
          >
            Trễ hạn
          </button>
          <button
            type="button"
            onClick={() => onDueChange('today')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeDue === 'today'
                ? 'bg-[#0082B4] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-cyan-600'
            }`}
          >
            Hôm nay
          </button>
          <button
            type="button"
            onClick={() => onDueChange('week')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeDue === 'week'
                ? 'bg-[#002D54] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-blue-600'
            }`}
          >
            Tuần này
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3 animate-pulse p-4">
          <LoadingSkeleton lines={4} />
        </div>
      )}

      {isError && (
        <ErrorState
          title="Thông báo gián đoạn"
          message="Hệ thống không thể kết nối tới máy chủ tác vụ."
          onRetry={onRetry}
        />
      )}

      {!isLoading && !isError && (!items || items.length === 0) && (
        <EmptyState
          icon={<CheckSquare className="w-10 h-10 text-slate-400" />}
          title="Chưa có tác vụ nào"
          description="Danh mục này hiện tại không phát sinh dữ liệu cần xử lý."
        />
      )}

      {!isLoading && !isError && items && items.length > 0 && (
        <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {items.map((task) => {
            const caseId = task.case?.id || '';
            const taskLink = caseId ? `/cases/${caseId}/tasks` : '#';

            return (
              <div
                key={task.id}
                className="py-3 px-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-xl transition-colors group"
              >
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={taskLink}
                      className="text-xs font-bold text-slate-800 dark:text-slate-100 hover:text-[#0082B4] dark:hover:text-cyan-400 truncate block transition-colors"
                    >
                      {task.title}
                    </Link>
                    {task.is_overdue && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 shrink-0">
                        Hạn trễ
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                    {task.case && (
                      <span className="font-mono text-slate-600 dark:text-slate-300 font-medium">
                        Mã hồ sơ: {task.case.case_code}
                      </span>
                    )}
                    {task.stage && (
                      <span className="flex items-center gap-1">
                        <span>•</span>
                        <span>{task.stage.name}</span>
                      </span>
                    )}
                    {task.due_at && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{new Date(task.due_at).toLocaleDateString('vi-VN')}</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <Link
                    href={taskLink}
                    className="p-1.5 text-slate-400 group-hover:text-[#0082B4] dark:group-hover:text-cyan-400 rounded-lg group-hover:bg-cyan-50 dark:group-hover:bg-cyan-950/30 transition-all"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
