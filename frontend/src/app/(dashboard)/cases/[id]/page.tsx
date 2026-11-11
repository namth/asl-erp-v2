'use client';

import React, { useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useCase, useCaseStages, useSetAssignments, useChangeCaseStatus } from '@/hooks/use-cases';
import { useMe } from '@/hooks/use-auth';
import { CaseStatus } from '@/types/cases';
import { formatVnd } from '@/lib/format';
import { ApiError } from '@/lib/api-client';
import { CaseStatusBadge, CaseRoleBadge } from '@/components/cases/case-badge';
import { StageTimeline } from '@/components/cases/stage-timeline';
import { AssignmentDialog } from '@/components/cases/assignment-dialog';
import { StatusTransitionDialog } from '@/components/cases/status-transition-dialog';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ui/error-state';

export default function CaseWorkspacePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = (params?.id as string) || '';

  const { data: user } = useMe();
  const isAccountantOrProgress =
    user?.system_role === 'ACCOUNTANT' || searchParams.get('view') === 'progress';

  // Fetch case detail
  const {
    data: caseData,
    isLoading: isCaseLoading,
    isError: isCaseError,
    error: caseError,
    refetch: refetchCase,
  } = useCase(id, isAccountantOrProgress ? { view: 'progress' } : undefined);

  // Fetch stages (only for professional scope)
  const {
    data: stages,
    isLoading: isStagesLoading,
  } = useCaseStages(id);

  // Mutations
  const setAssignmentsMutation = useSetAssignments(id);
  const changeStatusMutation = useChangeCaseStatus(id);

  // Dialog states
  const [isAssignmentOpen, setIsAssignmentOpen] = useState(false);
  const [statusDialogTarget, setStatusDialogTarget] = useState<CaseStatus | null>(null);

  // Loading state
  if (isCaseLoading) {
    return (
      <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
        <LoadingSkeleton lines={6} />
      </div>
    );
  }

  // Error state
  if (isCaseError) {
    if (caseError instanceof ApiError && caseError.code === 'NEED_TO_KNOW_DENIED') {
      return (
        <ErrorState
          title="Truy cập bị từ chối"
          message={caseError.message || 'Bạn không thuộc phạm vi vụ việc này'}
        />
      );
    }
    return (
      <ErrorState
        title="Lỗi tải thông tin vụ việc"
        message={caseError instanceof Error ? caseError.message : 'Có lỗi xảy ra'}
        onRetry={() => refetchCase()}
      />
    );
  }

  if (!caseData) return null;

  // Permissions & capabilities
  const isLegacy = Boolean(caseData.is_legacy);
  const isManager = user?.system_role === 'MANAGER' || user?.system_role === 'ADMIN';
  const canEdit = isManager && !isLegacy && !isAccountantOrProgress;

  // Check start readiness for INITIALIZING state
  const assignments = caseData.assignments || [];
  const caseManagersCount = assignments.filter((a) => a.role_in_case === 'CASE_MANAGER').length;
  const executorsCount = assignments.filter((a) => a.role_in_case === 'EXECUTOR').length;
  const canStartInitializing = caseManagersCount === 1 && executorsCount >= 1;

  // Render custom fields
  const renderCustomData = (data?: Record<string, unknown>) => {
    if (!data || Object.keys(data).length === 0) return null;

    const labels: Record<string, string> = {
      application_no: 'Số đơn đăng ký',
      filing_date: 'Ngày nộp đơn',
      classes: 'Nhóm sản phẩm / dịch vụ',
    };

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2">
        {Object.entries(data).map(([key, val]) => {
          const displayLabel = labels[key] || key;

          if (Array.isArray(val)) {
            return (
              <div key={key} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  {displayLabel}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {val.map((item, i) => (
                    <span
                      key={i}
                      className="inline-block px-2 py-0.5 rounded-lg bg-slate-200/80 dark:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100"
                    >
                      {String(item)}
                    </span>
                  ))}
                </div>
              </div>
            );
          }

          return (
            <div key={key} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                {displayLabel}
              </span>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 mt-0.5 block">
                {String(val ?? '—')}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Legacy Read-Only Banner */}
      {isLegacy && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 flex items-center gap-3 text-amber-900 dark:text-amber-200 shadow-sm">
          <svg className="w-5 h-5 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <span className="text-xs font-bold block">
              Vụ việc lịch sử — chỉ đọc
            </span>
            <span className="text-[11px] text-amber-700 dark:text-amber-300">
              Dữ liệu được lưu trữ từ hệ thống cũ và không hỗ trợ thay đổi trạng thái hoặc chỉnh sửa phân công.
            </span>
          </div>
        </div>
      )}

      {/* Case Header Card */}
      <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#002D54] text-white font-mono">
                {caseData.case_code}
              </span>
              <CaseStatusBadge status={caseData.status} />
              {caseData.workflow_mode && (
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {caseData.workflow_mode}
                </span>
              )}
            </div>

            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {caseData.title}
            </h2>

            {caseData.client?.name && (
              <div className="text-xs text-slate-600 dark:text-slate-400">
                <span>Khách hàng: <strong>{caseData.client.name}</strong></span>
              </div>
            )}
          </div>

          {/* Action buttons (Only for Manager in active cases, hidden for Legacy & Accountant) */}
          {canEdit && (
            <div className="flex items-center gap-2 flex-wrap">
              {caseData.status === 'INITIALIZING' && (
                <button
                  type="button"
                  disabled={!canStartInitializing || changeStatusMutation.isPending}
                  onClick={() => changeStatusMutation.mutateAsync({ status: 'ACTIVE' })}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Bắt đầu vụ việc
                </button>
              )}

              {caseData.status === 'ACTIVE' && (
                <>
                  <button
                    type="button"
                    onClick={() => setStatusDialogTarget('PAUSED')}
                    className="px-3.5 py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-600 text-white transition-colors shadow-sm"
                  >
                    Tạm dừng
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusDialogTarget('TERMINATED')}
                    className="px-3.5 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white transition-colors shadow-sm"
                  >
                    Huỷ vụ việc
                  </button>
                </>
              )}

              {caseData.status === 'PAUSED' && (
                <>
                  <button
                    type="button"
                    disabled={changeStatusMutation.isPending}
                    onClick={() => changeStatusMutation.mutateAsync({ status: 'ACTIVE' })}
                    className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm"
                  >
                    Tiếp tục vụ việc
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusDialogTarget('TERMINATED')}
                    className="px-3.5 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white transition-colors shadow-sm"
                  >
                    Huỷ vụ việc
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Progress & Financial Overview */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Tiến độ hoàn thành
            </span>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, caseData.progress_pct || 0))}%` }}
                />
              </div>
              <span className="font-mono font-bold text-xs text-slate-800 dark:text-slate-100">
                {caseData.progress_pct || 0}%
              </span>
            </div>
          </div>

          {caseData.contract_value && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Giá trị hợp đồng
              </span>
              <span className="text-xs font-bold font-mono text-slate-800 dark:text-slate-100 mt-1 block">
                {formatVnd(caseData.contract_value)}
              </span>
            </div>
          )}
        </div>

        {/* Custom Data Section */}
        {caseData.custom_data && renderCustomData(caseData.custom_data)}
      </div>

      {/* ACCOUNTANT / view=progress VIEW: Milestones summary */}
      {isAccountantOrProgress && caseData.billing_milestones && (
        <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Tình trạng các đợt thu phí
          </h3>
          <div className="space-y-2">
            {caseData.billing_milestones.map((ms) => (
              <div
                key={ms.id}
                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {ms.name}
                  </span>
                  <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    {ms.status}
                  </span>
                </div>
                <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                  {formatVnd(ms.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* NORMAL PROFESSIONAL SCOPE: Stages Timeline & Assignments */}
      {!isAccountantOrProgress && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Stages Timeline Column (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Dòng thời gian giai đoạn vụ việc
              </h3>
              {isStagesLoading ? (
                <LoadingSkeleton lines={4} />
              ) : (
                <StageTimeline
                  stages={stages || []}
                  currentStageId={caseData.current_stage?.id}
                />
              )}
            </div>
          </div>

          {/* Assignments Column (1 col) */}
          <div className="space-y-4">
            <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Danh sách nhân sự phân công
                </h3>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setIsAssignmentOpen(true)}
                    className="px-3 py-1 text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg transition-colors"
                  >
                    Sửa phân công
                  </button>
                )}
              </div>

              {assignments.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                  Chưa có nhân sự nào được phân công
                </div>
              ) : (
                <div className="space-y-2.5">
                  {assignments.map((a, idx) => (
                    <div
                      key={`${a.user_id}-${idx}`}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                          {a.full_name || a.user_id}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate">
                          {a.user_id}
                        </div>
                      </div>
                      <CaseRoleBadge role={a.role_in_case} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Assignment Modal */}
      {isAssignmentOpen && (
        <AssignmentDialog
          isOpen={isAssignmentOpen}
          onClose={() => setIsAssignmentOpen(false)}
          assignments={assignments}
          onSave={async (newAssignments) => {
            await setAssignmentsMutation.mutateAsync({ assignments: newAssignments });
            refetchCase();
          }}
          isSaving={setAssignmentsMutation.isPending}
        />
      )}

      {/* Status Transition Dialog */}
      {statusDialogTarget && (
        <StatusTransitionDialog
          isOpen={Boolean(statusDialogTarget)}
          targetStatus={statusDialogTarget}
          onClose={() => setStatusDialogTarget(null)}
          onConfirm={async (payload) => {
            await changeStatusMutation.mutateAsync(payload);
            refetchCase();
          }}
          isSubmitting={changeStatusMutation.isPending}
        />
      )}
    </div>
  );
}
