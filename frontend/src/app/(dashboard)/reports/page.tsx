'use client';

import React, { useState, useMemo, useContext } from 'react';
import { flushSync } from 'react-dom';
import { QueryClient, QueryClientProvider, QueryClientContext } from '@tanstack/react-query';
import { useMe } from '@/hooks/use-auth';
import {
  useRevenueReport,
  useCommissionsReport,
  useOperationsReport,
  exportReportExcel,
} from '@/hooks/use-reports';
import { defaultRange, validateRange } from '@/lib/reports';
import type { ReportTab, DepartmentMeta } from '@/types/reports';
import { ScopeBadge } from '@/components/reports/scope-badge';
import { ReportFilters } from '@/components/reports/report-filters';
import { RevenueTab } from '@/components/reports/revenue-tab';
import { CommissionsTab } from '@/components/reports/commissions-tab';
import { OperationsTab } from '@/components/reports/operations-tab';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ui/error-state';

function SafeQueryClientProvider({ children }: { children: React.ReactNode }) {
  const existingClient = useContext(QueryClientContext);
  const [fallbackClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
          },
        },
      })
  );

  if (existingClient) {
    return <>{children}</>;
  }

  return <QueryClientProvider client={fallbackClient}>{children}</QueryClientProvider>;
}

function ReportsContent() {
  const { data: user, isLoading: isUserLoading } = useMe();
  const isAdmin = user?.system_role === 'ADMIN';
  const isAccountant = user?.system_role === 'ACCOUNTANT';

  // Date ranges
  const initialRange = useMemo(() => defaultRange(new Date()), []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const dateRangeError = validateRange(from, to);

  // Filters
  const [activeTab, setActiveTab] = useState<ReportTab>('revenue');
  const [departmentId, setDepartmentId] = useState('');
  const [groupBy, setGroupBy] = useState<'month' | 'quarter'>('month');

  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Queries (called unconditionally)
  const isEnabled = !isAdmin && !dateRangeError;

  const revenueQuery = useRevenueReport(
    {
      from,
      to,
      department_id: departmentId || undefined,
      group_by: groupBy,
    },
    { enabled: isEnabled && activeTab === 'revenue' }
  );

  const commissionsQuery = useCommissionsReport(
    {
      from,
      to,
      department_id: departmentId || undefined,
    },
    { enabled: isEnabled && activeTab === 'commissions' }
  );

  const operationsQuery = useOperationsReport(
    {
      from,
      to,
      department_id: departmentId || undefined,
    },
    { enabled: isEnabled && !isAccountant && activeTab === 'operations' }
  );

  // Extract departments from meta
  const departments: DepartmentMeta[] = useMemo(() => {
    return (
      revenueQuery.data?.meta?.departments ||
      commissionsQuery.data?.meta?.departments ||
      operationsQuery.data?.meta?.departments ||
      []
    );
  }, [
    revenueQuery.data?.meta?.departments,
    commissionsQuery.data?.meta?.departments,
    operationsQuery.data?.meta?.departments,
  ]);

  // Current scope
  const currentScope = useMemo(() => {
    if (activeTab === 'revenue') return revenueQuery.data?.meta?.scope;
    if (activeTab === 'commissions') return commissionsQuery.data?.meta?.scope;
    if (activeTab === 'operations') return operationsQuery.data?.meta?.scope;
    return undefined;
  }, [
    activeTab,
    revenueQuery.data?.meta?.scope,
    commissionsQuery.data?.meta?.scope,
    operationsQuery.data?.meta?.scope,
  ]);

  // Admin access control
  if (isAdmin) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <ErrorState
          title="Không có quyền truy cập"
          message="Tài khoản Quản trị viên không có quyền truy cập màn hình báo cáo & thống kê."
        />
      </div>
    );
  }

  const handleExport = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const params: Record<string, string | undefined> = {
        from,
        to,
        department_id: departmentId || undefined,
      };
      if (activeTab === 'revenue') params.group_by = groupBy;
      await exportReportExcel(activeTab, params);
    } catch {
      setExportError('Không xuất được báo cáo, thử lại sau');
    } finally {
      setIsExporting(false);
    }
  };

  // Determine current active query
  const currentQuery =
    activeTab === 'revenue'
      ? revenueQuery
      : activeTab === 'commissions'
      ? commissionsQuery
      : operationsQuery;

  const renderContent = () => {
    if (currentQuery.isLoading || isUserLoading) {
      return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
          <LoadingSkeleton lines={6} />
        </div>
      );
    }

    if (currentQuery.isError) {
      const err = currentQuery.error as { status?: number; code?: string; message?: string };
      const is403 =
        err?.status === 403 ||
        err?.code === 'NEED_TO_KNOW_DENIED' ||
        err?.code === 'FORBIDDEN_ROLE';
      const is422 = err?.status === 422;

      if (is403) {
        return (
          <ErrorState
            title="Không có quyền truy cập"
            message="Bạn không có quyền truy cập dữ liệu báo cáo này."
          />
        );
      }

      if (is422) {
        return (
          <ErrorState
            title="Lỗi"
            message={err?.message || 'Dữ liệu bộ lọc không hợp lệ'}
          />
        );
      }

      return (
        <ErrorState
          title="Đã xảy ra sự cố"
          message={err?.message || 'Không thể tải dữ liệu báo cáo'}
          onRetry={() => currentQuery.refetch()}
        />
      );
    }

    if (activeTab === 'revenue' && revenueQuery.data) {
      return (
        <RevenueTab
          data={revenueQuery.data}
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
        />
      );
    }

    if (activeTab === 'commissions' && commissionsQuery.data) {
      return (
        <CommissionsTab
          data={commissionsQuery.data}
        />
      );
    }

    if (activeTab === 'operations' && operationsQuery.data) {
      return <OperationsTab data={operationsQuery.data} />;
    }

    return null;
  };

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100">
            Báo cáo & Thống kê
          </h1>
          <ScopeBadge scope={currentScope} />
        </div>
      </div>

      {/* Tabs list */}
      <div
        role="tablist"
        aria-label="Các phân hệ báo cáo"
        className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'revenue'}
          onClick={() => flushSync(() => setActiveTab('revenue'))}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'revenue'
              ? 'bg-[#002D54] text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Doanh thu
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'commissions'}
          onClick={() => flushSync(() => setActiveTab('commissions'))}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'commissions'
              ? 'bg-[#002D54] text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Hoa hồng
        </button>

        {!isAccountant && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'operations'}
            onClick={() => flushSync(() => setActiveTab('operations'))}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'operations'
                ? 'bg-[#002D54] text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Vận hành
          </button>
        )}
      </div>

      {/* Filters */}
      <ReportFilters
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        dateError={dateRangeError}
        departments={departments}
        departmentId={departmentId}
        onDepartmentChange={setDepartmentId}
        onExport={handleExport}
        isExporting={isExporting}
        exportError={exportError}
      />

      {/* Content */}
      {renderContent()}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <SafeQueryClientProvider>
      <ReportsContent />
    </SafeQueryClientProvider>
  );
}
