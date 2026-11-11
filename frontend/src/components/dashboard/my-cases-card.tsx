import React from 'react';
import Link from 'next/link';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Briefcase, ChevronRight, Folder } from 'lucide-react';
import { CaseListItem } from '@/types/cases';

interface MyCasesCardProps {
  items?: CaseListItem[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function MyCasesCard({
  items,
  isLoading,
  isError,
  onRetry,
}: MyCasesCardProps) {
  const displayItems = items ? items.slice(0, 5) : [];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-[#002D54] dark:text-cyan-400" />
            Vụ việc của tôi
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Các hồ sơ pháp lý bạn tham gia thực hiện hoặc quản lý
          </p>
        </div>

        <Link
          href="/cases?mine=true"
          className="text-xs font-semibold text-[#0082B4] dark:text-cyan-400 hover:underline flex items-center gap-1"
        >
          Xem tất cả
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {isLoading && (
        <div className="space-y-3 animate-pulse p-4">
          <LoadingSkeleton lines={3} />
        </div>
      )}

      {isError && (
        <ErrorState
          title="Thông báo gián đoạn"
          message="Hệ thống không thể tải danh sách hồ sơ vụ việc."
          onRetry={onRetry}
        />
      )}

      {!isLoading && !isError && displayItems.length === 0 && (
        <EmptyState
          icon={<Folder className="w-10 h-10 text-slate-400" />}
          title="Danh mục hồ sơ hiện rỗng"
          description="Hiện tại không phát sinh vụ việc nào được phân công."
        />
      )}

      {!isLoading && !isError && displayItems.length > 0 && (
        <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {displayItems.map((c) => (
            <div
              key={c.id}
              className="py-3 px-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-xl transition-colors group"
            >
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[#002D54] dark:text-cyan-300">
                    {c.case_code}
                  </span>
                  <span className="text-xs text-slate-800 dark:text-slate-100 font-medium truncate">
                    {c.title}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <span>{c.client_name}</span>
                  {c.current_stage && (
                    <span className="flex items-center gap-1">
                      <span>•</span>
                      <span>{c.current_stage.name}</span>
                    </span>
                  )}
                  {c.progress_pct !== undefined && (
                    <span className="flex items-center gap-1">
                      <span>•</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {c.progress_pct}%
                      </span>
                    </span>
                  )}
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                <Link
                  href={`/cases/${c.id}`}
                  className="p-1.5 text-slate-400 group-hover:text-[#0082B4] dark:group-hover:text-cyan-400 rounded-lg group-hover:bg-cyan-50 dark:group-hover:bg-cyan-950/30 transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
