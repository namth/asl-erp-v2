import React from 'react';
import { CaseStage } from '@/types/cases';
import { StageStatusBadge } from './case-badge';

export interface StageTimelineProps {
  stages?: CaseStage[];
  currentStageId?: string;
}

export function StageTimeline({ stages = [], currentStageId }: StageTimelineProps) {
  const sortedStages = [...stages].sort((a, b) => a.order_index - b.order_index);

  if (sortedStages.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-slate-500">
        Chưa có thông tin giai đoạn
      </div>
    );
  }

  return (
    <div className="relative border-l-2 border-slate-200 dark:border-slate-800 ml-4 pl-6 space-y-6">
      {sortedStages.map((stage, idx) => {
        const isCurrent = stage.id === currentStageId;
        const isCompleted = stage.status === 'COMPLETED';
        const isWaitingPayment = stage.status === 'WAITING_PAYMENT';
        const isWaitingApproval = stage.status === 'WAITING_APPROVAL';

        return (
          <div
            key={stage.id}
            data-testid="case-stage-item"
            className="relative group"
          >
            {/* Timeline Dot */}
            <div
              className={`absolute -left-[31px] top-1 w-4 h-4 rounded-full border-2 transition-all ${
                isCompleted
                  ? 'bg-emerald-500 border-emerald-500'
                  : isWaitingPayment
                  ? 'bg-amber-500 border-amber-500 ring-4 ring-amber-100 dark:ring-amber-950/50'
                  : isWaitingApproval
                  ? 'bg-purple-500 border-purple-500 ring-4 ring-purple-100 dark:ring-purple-950/50'
                  : isCurrent
                  ? 'bg-blue-600 border-blue-600 ring-4 ring-blue-100 dark:ring-blue-950/50'
                  : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
              }`}
            />

            <div
              className={`p-4 rounded-2xl border transition-all ${
                isCurrent
                  ? 'bg-blue-50/40 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900/40'
                  : 'bg-white dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800/80'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-slate-400">
                    #{stage.order_index || idx + 1}
                  </span>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {stage.name}
                  </h4>
                </div>
                <StageStatusBadge status={stage.status} />
              </div>

              {/* Waiting Payment Alert */}
              {isWaitingPayment && (
                <div className="mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200">
                  <svg
                    className="w-4 h-4 mt-0.5 text-amber-600 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-label="Biểu tượng khoá"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                  <div className="space-y-0.5">
                    {stage.blocking_milestone?.name && (
                      <div className="font-semibold text-amber-900 dark:text-amber-100">
                        {stage.blocking_milestone.name}
                      </div>
                    )}
                    <div className="text-amber-700 dark:text-amber-300">
                      Chờ Kế toán xác nhận thu tiền
                    </div>
                  </div>
                </div>
              )}

              {/* Waiting Approval Alert */}
              {isWaitingApproval && (
                <div className="mt-3 p-3 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/50 flex items-center gap-2 text-xs text-purple-800 dark:text-purple-200">
                  <svg
                    className="w-4 h-4 text-purple-600 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span className="font-medium">Chờ duyệt cổng giai đoạn</span>
                </div>
              )}

              {/* Task counts if available */}
              {stage.task_counts && (
                <div className="mt-3 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span>Hoàn thành: {stage.task_counts.completed}</span>
                  <span>Đang làm: {stage.task_counts.in_progress}</span>
                  <span>Chờ duyệt: {stage.task_counts.waiting_approval}</span>
                  <span>Chưa làm: {stage.task_counts.todo}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
