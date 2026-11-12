'use client';

import React, { useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useAuditLogs, useAuditIntegrity } from '@/hooks/use-audit-logs';
import { useMe } from '@/hooks/use-auth';
import { ActorType, AuditLogsFilter, AuditLogItem } from '@/types/audit';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { AuditTable } from '@/components/audit/audit-table';
import { AuditFilters } from '@/components/audit/audit-filters';
import { AuditDiffDrawer } from '@/components/audit/audit-diff-drawer';
import { AuditIntegrityBadge } from '@/components/audit/audit-integrity-badge';

export default function AuditLogsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { data: currentUser } = useMe();
  const isAdmin = currentUser?.system_role === 'ADMIN';

  // Read filters from URL search params
  const currentFilters: AuditLogsFilter = useMemo(() => {
    const action = searchParams.get('action') || undefined;
    const actorTypeRaw = searchParams.get('actor_type');
    const actor_type = (actorTypeRaw === 'USER' || actorTypeRaw === 'SYSTEM')
      ? (actorTypeRaw as ActorType)
      : undefined;
    const actor_id = searchParams.get('actor_id') || undefined;
    const entity_name = searchParams.get('entity_name') || undefined;
    const entity_id = searchParams.get('entity_id') || undefined;
    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;

    const pageRaw = searchParams.get('page');
    const page = pageRaw ? parseInt(pageRaw, 10) : 1;

    const limitRaw = searchParams.get('limit');
    const limit = limitRaw ? parseInt(limitRaw, 10) : 50;

    return {
      action,
      actor_type,
      actor_id,
      entity_name,
      entity_id,
      from,
      to,
      page: isNaN(page) ? 1 : page,
      limit: isNaN(limit) ? 50 : limit,
    };
  }, [searchParams]);

  // Queries
  const {
    data: auditData,
    isLoading,
    isError,
    error,
    refetch,
  } = useAuditLogs(currentFilters);

  const {
    data: integrityData,
    isLoading: isIntegrityLoading,
  } = useAuditIntegrity();

  // Selected log for diff drawer
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  // Update URL on filter changes
  const handleFilterChange = (nextFilters: AuditLogsFilter) => {
    const params = new URLSearchParams();

    const keys: (keyof AuditLogsFilter)[] = [
      'actor_id',
      'actor_type',
      'action',
      'entity_name',
      'entity_id',
      'from',
      'to',
      'page',
      'limit',
    ];

    for (const key of keys) {
      const val = nextFilters[key];
      if (val !== undefined && val !== null && val !== '') {
        params.set(key, String(val));
      }
    }

    const qs = params.toString();
    const targetUrl = qs ? `${pathname}?${qs}` : pathname;
    router.push(targetUrl);
  };

  const handlePageChange = (newPage: number) => {
    handleFilterChange({
      ...currentFilters,
      page: newPage,
    });
  };

  const items = auditData?.data || [];

  const handleJumpToBrokenId = (brokenId: number) => {
    const foundLog = items.find((item) => item.id === brokenId);
    if (foundLog) {
      setSelectedLog(foundLog);
    }
    if (typeof document !== 'undefined') {
      const el = document.getElementById(`audit-row-${brokenId}`);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  // RBAC check: only ADMIN allowed
  if (currentUser && !isAdmin) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <ErrorState
          title="Không có quyền truy cập"
          message="Chỉ Quản trị viên mới có quyền truy cập nhật ký kiểm toán."
        />
      </div>
    );
  }

  const meta = auditData?.meta;
  const totalPages = meta?.total_pages || 1;
  const currentPage = meta?.page || currentFilters.page || 1;

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-[#002D54] dark:bg-blue-950 dark:text-cyan-300 border border-blue-200 dark:border-blue-800">
              SỔ KIỂM TOÁN BẤT BIẾN
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#002D54] dark:text-slate-100 tracking-tight">
            Nhật ký kiểm toán
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Tra cứu lịch sử tác vụ và xác minh toàn vẹn chuỗi mã băm.
          </p>
        </div>
      </div>

      {/* Integrity Badge */}
      <AuditIntegrityBadge
        integrity={integrityData}
        isLoading={isIntegrityLoading}
        onJumpToId={handleJumpToBrokenId}
      />

      {/* Search & Filters */}
      <AuditFilters
        filters={currentFilters}
        onChange={handleFilterChange}
      />

      {/* Content based on 4-states */}
      {isLoading ? (
        <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800">
          <LoadingSkeleton lines={6} />
        </div>
      ) : isError ? (
        <ErrorState
          title=""
          message={error?.message || 'Không thể tải nhật ký kiểm toán'}
          onRetry={refetch}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="Chưa có nhật ký kiểm toán"
          description="Không tìm thấy bản ghi nhật ký kiểm toán nào phù hợp với điều kiện lọc."
        />
      ) : (
        <div className="space-y-4">
          <AuditTable
            logs={items}
            onSelectLog={(log) => setSelectedLog(log)}
            selectedLogId={selectedLog?.id}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2 text-xs text-slate-500">
              <div>
                Trang <span className="font-bold text-slate-700 dark:text-slate-300">{currentPage}</span> / {totalPages} (Tổng {meta?.total_records} bản ghi)
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => handlePageChange(currentPage - 1)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Trang trước
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => handlePageChange(currentPage + 1)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Trang sau
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Diff Drawer Modal */}
      <AuditDiffDrawer
        log={selectedLog}
        onClose={() => setSelectedLog(null)}
      />
    </div>
  );
}
