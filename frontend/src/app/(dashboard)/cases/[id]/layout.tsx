'use client';

import React from 'react';
import Link from 'next/link';
import { useParams, usePathname, useSearchParams } from 'next/navigation';
import { useMe } from '@/hooks/use-auth';

export default function CaseWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: user } = useMe();

  const id = (params?.id as string) || '';
  const isAccountantOrProgress =
    user?.system_role === 'ACCOUNTANT' || searchParams.get('view') === 'progress';

  const isOverviewActive = pathname === `/cases/${id}`;
  const isTasksActive = pathname.startsWith(`/cases/${id}/tasks`);
  const isFinanceActive = pathname.startsWith(`/cases/${id}/finance`);
  const isDocumentsActive = pathname.startsWith(`/cases/${id}/documents`);

  return (
    <div className="space-y-6">
      {/* Workspace Navigation Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-t-2xl px-6 pt-3 shadow-sm">
        <nav className="flex space-x-6 text-xs font-bold" aria-label="Tabs">
          {/* Overview Tab */}
          <Link
            href={`/cases/${id}`}
            className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
              isOverviewActive
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Tổng quan</span>
          </Link>

          {/* Tasks Tab (Hidden for ACCOUNTANT or view=progress) */}
          {!isAccountantOrProgress && (
            <Link
              href={`/cases/${id}/tasks`}
              className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
                isTasksActive
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <span>Tác vụ</span>
            </Link>
          )}

          {/* Finance Tab */}
          <Link
            href={`/cases/${id}/finance`}
            className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
              isFinanceActive
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Tài chính</span>
          </Link>
          {/* Documents Tab (ACCOUNTANT chỉ thấy thư mục Hợp đồng — server lọc) */}
          {searchParams.get('view') !== 'progress' && (
            <Link
              href={`/cases/${id}/documents`}
              className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
                isDocumentsActive
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
              <span>Tài liệu</span>
            </Link>
          )}
        </nav>
      </div>

      {/* Main Workspace Body */}
      <div>{children}</div>
    </div>
  );
}
