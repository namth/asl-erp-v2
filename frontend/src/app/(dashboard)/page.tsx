'use client';

import React, { useState } from 'react';
import { useQueryClient, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMe } from '@/hooks/use-auth';
import { useMyTasks } from '@/hooks/use-my-tasks';
import type { MyTaskItem } from '@/hooks/use-my-tasks';
import { useApprovals } from '@/hooks/use-approvals';
import { useCases } from '@/hooks/use-cases';
import { useAccountingInbox } from '@/hooks/use-accounting';
import { KpiCards } from '@/components/dashboard/kpi-cards';
import { MyTasksList } from '@/components/dashboard/my-tasks-list';
import { ApprovalsCard } from '@/components/dashboard/approvals-card';
import { MyCasesCard } from '@/components/dashboard/my-cases-card';
import { AccountantInboxCard } from '@/components/dashboard/accountant-inbox-card';
import { AdminShortcutsCard } from '@/components/dashboard/admin-shortcuts-card';
import { EmptyState } from '@/components/ui/empty-state';
import { User } from '@/types/auth';

const fallbackClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

function DashboardContent() {
  const { data: user, isLoading: isAuthLoading } = useMe();

  if (isAuthLoading || !user) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Bàn làm việc cá nhân
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Theo dõi hồ sơ và tác vụ của bạn
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
          <EmptyState
            title="Bắt đầu công việc"
            description="Danh mục này hiện thời không phát sinh dữ liệu cần xử lý."
          />
        </div>
      </div>
    );
  }

  if (user?.system_role === 'ADMIN') {
    return <AdminDashboardView user={user} />;
  }

  if (user?.system_role === 'ACCOUNTANT') {
    return <AccountantDashboardView user={user} />;
  }

  return <AttorneyManagerDashboardView user={user} />;
}

export default function DashboardPage() {
  let hasClient = true;
  try {
    useQueryClient();
  } catch {
    hasClient = false;
  }

  if (!hasClient) {
    return (
      <QueryClientProvider client={fallbackClient}>
        <DashboardContent />
      </QueryClientProvider>
    );
  }

  return <DashboardContent />;
}

function AdminDashboardView({ user }: { user?: User | null }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
          Bàn làm việc — {user?.full_name || 'Quản trị viên'}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Trung tâm điều hành và thiết lập hệ thống toàn diện
        </p>
      </div>

      <AdminShortcutsCard />
    </div>
  );
}

function AccountantDashboardView({ user }: { user?: User | null }) {
  const {
    data: inboxData,
    isLoading,
    isError,
    refetch,
  } = useAccountingInbox();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
          Bàn làm việc — {user?.full_name || 'Kế toán viên'}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Theo dõi các mốc thanh toán và tiến độ thu phí dịch vụ
        </p>
      </div>

      <AccountantInboxCard
        items={inboxData?.data}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
      />
    </div>
  );
}

function AttorneyManagerDashboardView({ user }: { user?: User | null }) {
  const [dueFilter, setDueFilter] = useState<'overdue' | 'today' | 'week' | undefined>(undefined);

  const {
    data: myTasksData,
    isLoading: isLoadingTasks,
    isError: isErrorTasks,
    refetch: refetchTasks,
  } = useMyTasks(dueFilter ? { due: dueFilter } : undefined);

  const {
    data: approvalsData,
    isLoading: isLoadingApprovals,
    isError: isErrorApprovals,
    refetch: refetchApprovals,
  } = useApprovals();

  const {
    data: casesData,
    isLoading: isLoadingCases,
    isError: isErrorCases,
    refetch: refetchCases,
  } = useCases({ mine: true });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
          Bàn làm việc — {user?.full_name || 'Luật sư'}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Theo dõi tiến độ hồ sơ, công việc và phê duyệt trong ngày
        </p>
      </div>

      <KpiCards
        summary={myTasksData?.summary}
        isLoading={isLoadingTasks}
      />

      <MyTasksList
        items={myTasksData?.data ?? (Object.values(myTasksData || {}).find(Array.isArray) as MyTaskItem[] | undefined)}
        isLoading={isLoadingTasks}
        isError={isErrorTasks}
        onRetry={() => refetchTasks()}
        activeDue={dueFilter}
        onDueChange={(due) => setDueFilter(due)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ApprovalsCard
          items={approvalsData}
          isLoading={isLoadingApprovals}
          isError={isErrorApprovals}
          onRetry={() => refetchApprovals()}
        />

        <MyCasesCard
          items={casesData?.data}
          isLoading={isLoadingCases}
          isError={isErrorCases}
          onRetry={() => refetchCases()}
        />
      </div>
    </div>
  );
}
