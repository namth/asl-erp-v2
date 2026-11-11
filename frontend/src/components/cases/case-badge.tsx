import React from 'react';
import { CaseStatus, StageStatus, RoleInCase } from '@/types/cases';

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  const configs: Record<CaseStatus, { label: string; className: string }> = {
    INITIALIZING: {
      label: 'Khởi tạo',
      className: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300',
    },
    ACTIVE: {
      label: 'Đang thụ lý',
      className: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300',
    },
    PAUSED: {
      label: 'Tạm dừng',
      className: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300',
    },
    TERMINATED: {
      label: 'Đã huỷ',
      className: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300',
    },
    CLOSED: {
      label: 'Đã đóng',
      className: 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-300',
    },
  };

  const config = configs[status] || {
    label: status,
    className: 'bg-slate-100 text-slate-700',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${config.className}`}
    >
      {config.label}
    </span>
  );
}

export function StageStatusBadge({ status }: { status: StageStatus }) {
  const configs: Record<StageStatus, { label: string; className: string }> = {
    LOCKED: {
      label: 'Chưa mở',
      className: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
    },
    ACTIVE: {
      label: 'Đang thực hiện',
      className: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300',
    },
    WAITING_PAYMENT: {
      label: 'Chờ thu tiền',
      className: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300',
    },
    WAITING_APPROVAL: {
      label: 'Chờ duyệt',
      className: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300',
    },
    COMPLETED: {
      label: 'Hoàn thành',
      className: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300',
    },
  };

  const config = configs[status] || {
    label: status,
    className: 'bg-slate-100 text-slate-600',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${config.className}`}
    >
      {config.label}
    </span>
  );
}

export function CaseRoleBadge({ role }: { role?: RoleInCase | null }) {
  if (!role) return <span className="text-slate-400 text-xs">—</span>;

  const configs: Record<RoleInCase, { label: string; className: string }> = {
    CASE_MANAGER: {
      label: 'Quản lý phụ trách',
      className: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300',
    },
    SUPERVISOR: {
      label: 'Giám sát',
      className: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/30 dark:text-cyan-300',
    },
    EXECUTOR: {
      label: 'Thực hiện',
      className: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300',
    },
    ASSISTANT: {
      label: 'Trợ lý',
      className: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300',
    },
  };

  const config = configs[role] || {
    label: role,
    className: 'bg-slate-50 text-slate-700 border-slate-200',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${config.className}`}
    >
      {config.label}
    </span>
  );
}
