import React from 'react';
import Link from 'next/link';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ClipboardCheck, ChevronRight, User, ExternalLink } from 'lucide-react';
import { Approval } from '@/types/tasks';

interface ApprovalsCardProps {
  items?: Approval[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function ApprovalsCard({
  items,
  isLoading,
  isError,
  onRetry,
}: ApprovalsCardProps) {
  const displayItems = items ? items.slice(0, 5) : [];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-[#FF7A00]" />
            Chờ tôi duyệt
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Hàng chờ phê duyệt tác vụ và cổng chuyển giai đoạn
          </p>
        </div>

        <Link
          href="/approvals"
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
          message="Sự cố kết nối khi nạp danh sách mục chờ duyệt."
          onRetry={onRetry}
        />
      )}

      {!isLoading && !isError && displayItems.length === 0 && (
        <EmptyState
          icon={<ClipboardCheck className="w-10 h-10 text-slate-400" />}
          title="Hàng chờ duyệt đã xử lý hết"
          description="Hiện tại không có mục nào phát sinh cần phê duyệt."
        />
      )}

      {!isLoading && !isError && displayItems.length > 0 && (
        <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {displayItems.map((appr) => (
            <div
              key={appr.id}
              className="py-3 px-2 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-xl transition-colors"
            >
              <div className="space-y-1 flex-1 min-w-0">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                  {appr.subject?.title || 'Yêu cầu phê duyệt'}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  {appr.case && (
                    <span className="font-mono text-slate-600 dark:text-slate-300 font-medium">
                      Mã hồ sơ: {appr.case.case_code}
                    </span>
                  )}
                  {appr.requested_by && (
                    <span className="flex items-center gap-1">
                      <span>•</span>
                      <User className="w-3 h-3 text-slate-400" />
                      <span>{appr.requested_by.full_name}</span>
                    </span>
                  )}
                </div>
              </div>

              <Link
                href="/approvals"
                className="shrink-0 p-1.5 text-slate-400 hover:text-[#0082B4] dark:hover:text-cyan-400 rounded-lg hover:bg-cyan-50 dark:hover:bg-cyan-950/30 transition-all"
              >
                <ExternalLink className="w-4 h-4" />
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
