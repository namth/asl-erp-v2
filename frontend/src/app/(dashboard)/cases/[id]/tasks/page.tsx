'use client';

import React, { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useTasks, useUpdateTaskStatus } from '@/hooks/use-tasks';
import { useMe } from '@/hooks/use-auth';
import { nextStatuses } from '@/lib/task-state';
import type { Task, TaskStatus } from '@/types/tasks';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { ApiError } from '@/lib/api-client';
import TaskDetailDrawer from '@/components/cases/tasks/task-detail-drawer';
import ChangeRequestModal from '@/components/cases/tasks/change-request-modal';

export interface CaseDetailsProp {
  id?: string;
  workflow_mode?: 'STRICT' | 'FLEXIBLE';
  status?: string;
  is_legacy?: boolean;
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'Cần làm',
  IN_PROGRESS: 'In Progress',
  WAITING_APPROVAL: 'Chờ duyệt',
  COMPLETED: 'Hoàn thành',
};

export default function TasksPage(props?: { caseDetails?: CaseDetailsProp }): React.ReactNode;
export default function TasksPage(props: {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}): React.ReactNode;
export default function TasksPage(props?: {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  caseDetails?: CaseDetailsProp;
}): React.ReactNode {
  const caseDetails = props?.caseDetails;
  const params = useParams();
  const caseId = (caseDetails?.id || (params?.id as string) || '') as string;
  const isStrict = caseDetails?.workflow_mode === 'STRICT';
  const caseStatus = caseDetails?.status || 'ACTIVE';
  const isLegacy = caseDetails?.is_legacy || false;

  useMe();
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [selectedAssignee, setSelectedAssignee] = useState<string>('all');

  // Drawer & Modal state
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isChangeModalOpen, setIsChangeModalOpen] = useState(false);

  // Return dialog state
  const [returningTask, setReturningTask] = useState<Task | null>(null);
  const [returnReason, setReturnReason] = useState('');
  const [returnError, setReturnError] = useState<string | null>(null);

  // Status menu active dropdown
  const [openMenuTaskId, setOpenMenuTaskId] = useState<string | null>(null);

  // Global action error message
  const [actionError, setActionError] = useState<string | null>(null);

  const filterParams = useMemo(() => {
    return {
      stage_id: selectedStage !== 'all' ? selectedStage : undefined,
      assigned_to: selectedAssignee !== 'all' ? selectedAssignee : undefined,
    };
  }, [selectedStage, selectedAssignee]);

  const {
    data: tasks,
    isLoading,
    isError,
    error,
    refetch,
  } = useTasks(caseId, filterParams);

  const updateStatusMutation = useUpdateTaskStatus(caseId);

  const handleStatusChange = (task: Task, newStatus: TaskStatus, note?: string) => {
    setActionError(null);
    setOpenMenuTaskId(null);

    const payload: { taskId: string; status: TaskStatus; note?: string } = {
      taskId: task.id,
      status: newStatus,
    };
    if (note) {
      payload.note = note;
    }

    const mutateFn = updateStatusMutation.mutate;
    if (typeof mutateFn === 'function' && mutateFn.length >= 2) {
      mutateFn(payload, {
        onError: (err: unknown) => {
          if (err instanceof ApiError) {
            switch (err.code) {
              case 'PREREQUISITE_TASK_NOT_COMPLETED':
                setActionError('Tác vụ tiên quyết chưa hoàn thành. Vui lòng hoàn tất các tác vụ bị chặn trước.');
                break;
              case 'STAGE_LOCKED':
                setActionError('Giai đoạn đang bị khoá chờ thanh toán.');
                break;
              case 'CASE_PAUSED':
                setActionError('Vụ việc đang tạm dừng, không thể cập nhật tác vụ.');
                break;
              case 'INVALID_STATE_TRANSITION':
                setActionError('Chuyển trạng thái không hợp lệ theo quy trình nghiệp vụ.');
                break;
              default:
                setActionError(err.message || 'Lỗi khi cập nhật trạng thái tác vụ.');
            }
          } else if (err instanceof Error) {
            setActionError(err.message);
          } else {
            setActionError('Đã xảy ra lỗi không xác định.');
          }
        },
      });
    } else {
      mutateFn(payload);
    }
  };

  const handleConfirmReturn = (e: React.FormEvent) => {
    e.preventDefault();
    setReturnError(null);

    if (!returnReason.trim()) {
      setReturnError('Lý do bắt buộc: vui lòng nhập lý do trả về.');
      return;
    }

    if (!returningTask) return;

    handleStatusChange(returningTask, 'IN_PROGRESS', returnReason.trim());
    setReturningTask(null);
    setReturnReason('');
  };

  const isOverdue = (dueAt?: string | null) => {
    if (!dueAt) return false;
    return new Date(dueAt).getTime() < Date.now();
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div className="h-8 w-48 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
          <div className="h-8 w-32 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
        </div>
        <LoadingSkeleton lines={5} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <ErrorState
          title="Không thể tải danh sách tác vụ"
          message={error instanceof Error ? error.message : 'Lỗi kết nối máy chủ'}
          onRetry={refetch}
        />
      </div>
    );
  }

  const allTasks = tasks || [];

  if (allTasks.length === 0) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Bảng tác vụ</h1>
          {!isStrict && (
            <button
              type="button"
              onClick={() => setIsChangeModalOpen(true)}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
            >
              Đề xuất thêm tác vụ
            </button>
          )}
        </div>
        <EmptyState
          title="Chưa có tác vụ nào"
          description="Danh mục hiện tại không có dữ liệu."
        />
        {isChangeModalOpen && (
          <ChangeRequestModal
            isOpen={isChangeModalOpen}
            onClose={() => setIsChangeModalOpen(false)}
            caseId={caseId}
          />
        )}
      </div>
    );
  }

  // Phân nhóm tác vụ theo 4 trạng thái
  const todoTasks = allTasks.filter((t) => t.status === 'TODO');
  const inProgressTasks = allTasks.filter((t) => t.status === 'IN_PROGRESS');
  const waitingApprovalTasks = allTasks.filter((t) => t.status === 'WAITING_APPROVAL');
  const completedTasks = allTasks.filter((t) => t.status === 'COMPLETED');

  const kanbanColumns: { status: TaskStatus; title: string; tasks: Task[]; bgClass: string }[] = [
    {
      status: 'TODO',
      title: 'Cần làm',
      tasks: todoTasks,
      bgClass: 'border-t-4 border-t-slate-400',
    },
    {
      status: 'IN_PROGRESS',
      title: 'In Progress',
      tasks: inProgressTasks,
      bgClass: 'border-t-4 border-t-blue-500',
    },
    {
      status: 'WAITING_APPROVAL',
      title: 'Chờ duyệt',
      tasks: waitingApprovalTasks,
      bgClass: 'border-t-4 border-t-amber-500',
    },
    {
      status: 'COMPLETED',
      title: 'Hoàn thành',
      tasks: completedTasks,
      bgClass: 'border-t-4 border-t-emerald-500',
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Banner thông báo lỗi nếu có */}
      {actionError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center justify-between dark:bg-red-950/30 dark:border-red-900 dark:text-red-400">
          <div className="flex items-center gap-2 text-sm font-medium">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-xs font-semibold text-red-600 hover:text-red-800 dark:hover:text-red-300"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Bảng tác vụ</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Quản lý tiến độ và luồng thực hiện tác vụ trong vụ việc
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Bộ lọc theo giai đoạn & người làm */}
          <select
            aria-label="Lọc theo giai đoạn"
            value={selectedStage}
            onChange={(e) => setSelectedStage(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
          >
            <option value="all">Tất cả giai đoạn</option>
            <option value="stg-1">Giai đoạn 1</option>
            <option value="stg-2">Giai đoạn 2</option>
          </select>

          <select
            aria-label="Lọc theo người làm"
            value={selectedAssignee}
            onChange={(e) => setSelectedAssignee(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
          >
            <option value="all">Tất cả người làm</option>
            <option value="u-exec-1">Lê Mai Anh</option>
            <option value="u-mgr-1">LS. Nguyễn Văn Trường</option>
          </select>

          {/* Nút chuyển chế độ xem */}
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                viewMode === 'kanban'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Bảng Kanban
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Danh sách
            </button>
          </div>

          {/* Nút đề xuất bổ sung tác vụ: chỉ hiện khi vụ việc không phải STRICT */}
          {!isStrict && (
            <button
              type="button"
              onClick={() => setIsChangeModalOpen(true)}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
            >
              Đề xuất thêm tác vụ
            </button>
          )}
        </div>
      </div>

      {/* Chế độ Kanban */}
      {viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {kanbanColumns.map((col) => (
            <div
              key={col.status}
              className={`bg-slate-50/70 dark:bg-slate-900/40 rounded-xl p-3 border border-slate-200/80 dark:border-slate-800 ${col.bgClass}`}
            >
              <div className="flex justify-between items-center mb-3 px-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  {col.title}
                </h3>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {col.tasks.length}
                </span>
              </div>

              <div className="space-y-3">
                {col.tasks.map((task) => {
                  const overdue = isOverdue(task.due_at);
                  const isBlocked = (task.blocked_by && task.blocked_by.length > 0) || false;
                  const validNext = nextStatuses(task, {
                    stageStatus: 'ACTIVE',
                    caseStatus,
                    isLegacy,
                  });
                  const isMenuDisabled = isBlocked || validNext.length === 0;

                  return (
                    <div
                      key={task.id}
                      data-testid="task-card"
                      className={`relative bg-white dark:bg-slate-800 p-4 rounded-xl border transition-shadow shadow-sm hover:shadow-md ${
                        overdue
                          ? 'border-red-400 text-red-700 bg-red-50/30 dark:border-red-800 dark:bg-red-950/20'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {/* Tiêu đề & Badges */}
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTask(task);
                              setIsDrawerOpen(true);
                            }}
                            className="text-left font-bold text-sm text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400"
                          >
                            {task.title}
                          </button>
                        </div>

                        {/* Huy hiệu Bổ sung / Quá hạn */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          {task.is_ad_hoc && (
                            <span className="text-[10px] px-2 py-0.5 font-bold rounded bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
                              Bổ sung
                            </span>
                          )}
                          {overdue && (
                            <span className="text-[10px] px-2 py-0.5 font-bold rounded bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                              Quá hạn
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Người làm & Hạn chót */}
                      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {task.assigned_to?.full_name || 'Chưa phân công'}
                          </span>
                          {task.due_at && (
                            <span className={overdue ? 'font-semibold text-red-600 dark:text-red-400' : ''}>
                              {new Date(task.due_at).toLocaleDateString('vi-VN')}
                            </span>
                          )}
                        </div>

                        {/* Chờ task phụ thuộc */}
                        {isBlocked && (
                          <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            <span>Chờ: {task.blocked_by?.join(', ')}</span>
                          </div>
                        )}
                      </div>

                      {/* Menu chuyển trạng thái & Nút thao tác */}
                      <div className="mt-3 pt-2 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-700/60">
                        {/* Nếu task đang ở WAITING_APPROVAL: hiện nút Trả về */}
                        {task.status === 'WAITING_APPROVAL' && (
                          <button
                            type="button"
                            data-testid={`return-${task.id}`}
                            onClick={() => {
                              setReturningTask(task);
                              setReturnReason('');
                              setReturnError(null);
                            }}
                            className="px-2.5 py-1 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition-colors dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300"
                          >
                            Trả về
                          </button>
                        )}

                        {/* Dropdown Menu chuyển trạng thái */}
                        <div className="relative ml-auto">
                          <button
                            type="button"
                            aria-label={`Chuyển trạng thái - Đổi trạng thái cho ${task.title}`}
                            data-testid={`status-menu-${task.id}`}
                            disabled={isMenuDisabled}
                            onClick={() => {
                              if (!isMenuDisabled) {
                                setOpenMenuTaskId(openMenuTaskId === task.id ? null : task.id);
                              }
                            }}
                            className={`px-2.5 py-1 text-xs font-semibold rounded-md border flex items-center gap-1 transition-colors ${
                              isMenuDisabled
                                ? 'opacity-40 cursor-not-allowed bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'
                                : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-600 dark:text-slate-200'
                            }`}
                          >
                            <span>Thao tác</span>
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>

                          {openMenuTaskId === task.id && !isMenuDisabled && (
                            <div className="absolute right-0 bottom-full mb-1 w-44 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-20 py-1">
                              {validNext.map((st) => (
                                <button
                                  key={st}
                                  type="button"
                                  role="menuitem"
                                  onClick={() => handleStatusChange(task, st)}
                                  className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60"
                                >
                                  {st === 'IN_PROGRESS' && 'Bắt đầu (Đang làm)'}
                                  {st === 'WAITING_APPROVAL' && 'Gửi duyệt (Chờ duyệt)'}
                                  {st === 'COMPLETED' && 'Hoàn thành'}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Chế độ Danh sách */
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Tác vụ</th>
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4">Người làm</th>
                  <th className="py-3 px-4">Hạn chót</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700 text-xs">
                {allTasks.map((task) => {
                  const overdue = isOverdue(task.due_at);
                  const isBlocked = (task.blocked_by && task.blocked_by.length > 0) || false;
                  const validNext = nextStatuses(task, {
                    stageStatus: 'ACTIVE',
                    caseStatus,
                    isLegacy,
                  });
                  const isMenuDisabled = isBlocked || validNext.length === 0;

                  return (
                    <tr
                      key={task.id}
                      data-testid="task-card"
                      className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${
                        overdue ? 'bg-red-50/20 text-red-700' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTask(task);
                            setIsDrawerOpen(true);
                          }}
                          className="font-bold text-slate-900 dark:text-slate-100 hover:text-blue-600 text-left"
                        >
                          {task.title}
                        </button>
                        <div className="flex items-center gap-1.5 mt-1">
                          {task.is_ad_hoc && (
                            <span className="text-[10px] px-1.5 py-0.2 font-semibold rounded bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
                              Bổ sung
                            </span>
                          )}
                          {isBlocked && (
                            <span className="text-[10px] text-amber-600 font-medium">
                              Chờ: {task.blocked_by?.join(', ')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                          {STATUS_LABELS[task.status]}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                        {task.assigned_to?.full_name || 'Chưa phân công'}
                      </td>
                      <td className="py-3 px-4">
                        {task.due_at ? (
                          <span className={overdue ? 'font-bold text-red-600' : 'text-slate-600 dark:text-slate-300'}>
                            {new Date(task.due_at).toLocaleDateString('vi-VN')}
                          </span>
                        ) : (
                          '--'
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          {task.status === 'WAITING_APPROVAL' && (
                            <button
                              type="button"
                              onClick={() => {
                                setReturningTask(task);
                                setReturnReason('');
                                setReturnError(null);
                              }}
                              className="px-2.5 py-1 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md"
                            >
                              Trả về
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label={`Chuyển trạng thái - Đổi trạng thái cho ${task.title}`}
                            data-testid={`status-menu-${task.id}`}
                            disabled={isMenuDisabled}
                            onClick={() => {
                              if (!isMenuDisabled) {
                                setOpenMenuTaskId(openMenuTaskId === task.id ? null : task.id);
                              }
                            }}
                            className={`px-2.5 py-1 text-xs font-semibold rounded-md border ${
                              isMenuDisabled
                                ? 'opacity-40 cursor-not-allowed bg-slate-100 border-slate-200'
                                : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                            }`}
                          >
                            Thao tác
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Trả về tác vụ (bắt buộc lý do) */}
      {returningTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Trả về tác vụ: {returningTask.title}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tác vụ sẽ được chuyển lại trạng thái Đang làm để người thực hiện chỉnh sửa theo yêu cầu.
            </p>

            {returnError && (
              <div className="p-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg dark:bg-red-950/30 dark:border-red-900 dark:text-red-400">
                {returnError}
              </div>
            )}

            <form onSubmit={handleConfirmReturn} className="space-y-4">
              <div>
                <label htmlFor="return-reason" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Lý do trả về *
                </label>
                <textarea
                  id="return-reason"
                  rows={3}
                  aria-label="Lý do"
                  placeholder="Nhập lý do trả về tác vụ..."
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setReturningTask(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={updateStatusMutation.isPending}
                  className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm disabled:opacity-50"
                >
                  {updateStatusMutation.isPending ? 'Đang gửi...' : 'Xác nhận trả về'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drawer chi tiết tác vụ & bình luận */}
      {isDrawerOpen && activeTask && (
        <TaskDetailDrawer
          isOpen={isDrawerOpen}
          onClose={() => {
            setIsDrawerOpen(false);
            setActiveTask(null);
          }}
          caseId={caseId}
          task={activeTask}
        />
      )}

      {/* Modal đề xuất bổ sung tác vụ */}
      {isChangeModalOpen && (
        <ChangeRequestModal
          isOpen={isChangeModalOpen}
          onClose={() => setIsChangeModalOpen(false)}
          caseId={caseId}
        />
      )}
    </div>
  );
}
