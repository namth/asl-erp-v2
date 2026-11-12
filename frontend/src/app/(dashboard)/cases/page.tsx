'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCases } from '@/hooks/use-cases';
import { useMe } from '@/hooks/use-auth';
import { CaseStatusBadge, StageStatusBadge, CaseRoleBadge } from '@/components/cases/case-badge';
import type { CaseListItem } from '@/types/cases';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';

export default function CasesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: currentUser } = useMe();

  // Read initial filter values from URL searchParams
  const initialQuery = searchParams.get('q') || '';
  const initialStatus = searchParams.get('status') || '';
  const initialDept = searchParams.get('department_id') || '';
  const initialMine = searchParams.get('mine') === 'true';
  const initialPage = parseInt(searchParams.get('page') || '1', 10) || 1;

  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [departmentFilter, setDepartmentFilter] = useState(initialDept);
  const [mineOnly, setMineOnly] = useState(initialMine);
  const [currentPage, setCurrentPage] = useState(initialPage);

  // Sync state if searchParams change externally
  useEffect(() => {
    const qParam = searchParams.get('q') || '';
    const statusParam = searchParams.get('status') || '';
    const deptParam = searchParams.get('department_id') || '';
    const mineParam = searchParams.get('mine') === 'true';
    const pageParam = parseInt(searchParams.get('page') || '1', 10) || 1;

    setSearchQuery(qParam);
    setStatusFilter(statusParam);
    setDepartmentFilter(deptParam);
    setMineOnly(mineParam);
    setCurrentPage(pageParam);
  }, [searchParams]);

  // Update URL helper
  const updateUrl = useCallback(
    (q: string, status: string, dept: string, mine: boolean, page: number) => {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (status.trim()) params.set('status', status.trim());
      if (dept.trim()) params.set('department_id', dept.trim());
      if (mine) params.set('mine', 'true');
      if (page > 1) params.set('page', String(page));

      const queryStr = params.toString();
      const newPath = queryStr ? `/cases?${queryStr}` : '/cases';
      router.replace(newPath);
    },
    [router]
  );

  // Filter params to pass to hook (omitting empty/whitespace strings)
  const filters = useMemo(() => {
    const trimmedQ = searchQuery.trim();
    const trimmedStatus = statusFilter.trim();
    const trimmedDept = departmentFilter.trim();

    return {
      q: trimmedQ ? trimmedQ : undefined,
      status: trimmedStatus ? trimmedStatus : undefined,
      department_id: trimmedDept ? trimmedDept : undefined,
      mine: mineOnly ? true : undefined,
      page: currentPage,
      limit: 20,
    };
  }, [searchQuery, statusFilter, departmentFilter, mineOnly, currentPage]);

  const { data, isLoading, isError, error, refetch } = useCases(filters);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
    updateUrl(val, statusFilter, departmentFilter, mineOnly, 1);
  };

  const handleStatusChange = (val: string) => {
    setStatusFilter(val);
    setCurrentPage(1);
    updateUrl(searchQuery, val, departmentFilter, mineOnly, 1);
  };

  const handleMineToggle = (checked: boolean) => {
    setMineOnly(checked);
    setCurrentPage(1);
    updateUrl(searchQuery, statusFilter, departmentFilter, checked, 1);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    updateUrl(searchQuery, statusFilter, departmentFilter, mineOnly, newPage);
  };

  const items = data?.data || [];
  const meta = data?.meta || { page: 1, limit: 20, total_records: 0, total_pages: 0 };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Hồ sơ vụ việc
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Danh sách vụ việc thuộc phạm vi xử lý và quản lý
          </p>
        </div>

        {currentUser?.system_role !== 'ACCOUNTANT' && (
          <Link
            href="/cases/create"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#002D54] to-[#0082B4] hover:from-[#002444] hover:to-[#00709c] text-white text-xs font-bold transition-all shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            <span>Tạo vụ việc mới</span>
          </Link>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Tìm kiếm mã, tên vụ việc, khách hàng..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Status Filter */}
          <select
            aria-label="Lọc theo trạng thái"
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="ACTIVE">Đang thụ lý</option>
            <option value="INITIALIZING">Khởi tạo</option>
            <option value="PAUSED">Tạm dừng</option>
            <option value="TERMINATED">Đã huỷ</option>
            <option value="CLOSED">Đã đóng</option>
          </select>

          {/* Mine Only Toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={(e) => handleMineToggle(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
            />
            <span>Vụ việc của tôi</span>
          </label>
        </div>
      </div>

      {/* Main Content States */}
      {isLoading ? (
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <LoadingSkeleton lines={6} />
        </div>
      ) : isError ? (
        <ErrorState
          title="Thông báo lỗi"
          message={
            error instanceof Error && error.message
              ? error.message
              : 'Không thể kết nối đến máy chủ'
          }
          onRetry={() => refetch()}
        />
      ) : !items.length && (!meta.total_records || meta.total_records === 0) ? (
        <EmptyState
          title="Chưa có vụ việc"
          description="Hiện tại không tìm thấy vụ việc nào phù hợp với bộ lọc tìm kiếm của bạn."
        />
      ) : (
        <div className="space-y-4">
          {/* Cases Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-950/50 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Mã vụ việc</th>
                    <th className="py-3 px-4">Tên vụ việc & Khách hàng</th>
                    <th className="py-3 px-4">Giai đoạn hiện tại</th>
                    <th className="py-3 px-4">Tiến độ</th>
                    <th className="py-3 px-4">Hạn gần nhất</th>
                    <th className="py-3 px-4">Vai trò của tôi</th>
                    <th className="py-3 px-4 text-center">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {items.map((item: CaseListItem) => (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Code */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <Link
                          href={`/cases/${item.id}`}
                          className="font-mono font-bold text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {item.case_code}
                        </Link>
                      </td>

                      {/* Title & Client */}
                      <td className="py-3.5 px-4 min-w-[220px]">
                        <Link
                          href={`/cases/${item.id}`}
                          className="font-semibold text-slate-800 dark:text-slate-100 hover:text-blue-600 transition-colors line-clamp-1"
                        >
                          {item.title}
                        </Link>
                        {item.client_name && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            {item.client_name}
                          </div>
                        )}
                      </td>

                      {/* Current Stage */}
                      <td className="py-3.5 px-4">
                        {item.current_stage ? (
                          <div className="space-y-1">
                            <div className="font-medium text-slate-700 dark:text-slate-200">
                              {item.current_stage.name}
                            </div>
                            <StageStatusBadge status={item.current_stage.status} />
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Progress */}
                      <td className="py-3.5 px-4 whitespace-nowrap min-w-[120px]">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                              style={{ width: `${Math.min(100, Math.max(0, item.progress_pct || 0))}%` }}
                            />
                          </div>
                          <span className="font-mono font-semibold text-[11px] text-slate-700 dark:text-slate-300">
                            {item.progress_pct || 0}%
                          </span>
                        </div>
                      </td>

                      {/* Due date */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-600 dark:text-slate-400">
                        {item.due_at_nearest ? (
                          <span className="font-mono text-[11px]">
                            {new Date(item.due_at_nearest).toLocaleDateString('vi-VN')}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* My Role */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <CaseRoleBadge role={item.my_role_in_case} />
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <CaseStatusBadge status={item.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
              <div>
                Tổng số{' '}
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {meta.total_records}
                </span>{' '}
                vụ việc
                {meta.total_pages > 1 && (
                  <span>
                    {' '}· Trang {meta.page} / {meta.total_pages}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  Trang trước
                </button>
                <button
                  type="button"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= meta.total_pages}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  Trang sau
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
