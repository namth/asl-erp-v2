'use client';

import React, { useState } from 'react';
import { AuditIntegrityResponse } from '@/types/audit';
import { useRecheckIntegrity } from '@/hooks/use-audit-logs';
import { ApiError } from '@/lib/api-client';

interface AuditIntegrityBadgeProps {
  integrity?: AuditIntegrityResponse;
  isLoading?: boolean;
  onJumpToId?: (id: number) => void;
}

export function AuditIntegrityBadge({
  integrity,
  isLoading,
  onJumpToId,
}: AuditIntegrityBadgeProps) {
  const recheckMutation = useRecheckIntegrity();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleRecheck = async () => {
    setErrorMessage(null);
    try {
      await recheckMutation.mutateAsync();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 429 || err.code === 'RATE_LIMITED') {
          setErrorMessage(err.message || 'Vừa kiểm tra, thử lại sau ít phút');
          return;
        }
        setErrorMessage(err.message || 'Không thể kiểm tra toàn vẹn chuỗi băm');
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Không thể kiểm tra toàn vẹn chuỗi băm');
      }
    }
  };

  const status = integrity?.status || 'NEVER_CHECKED';
  const checkedRows = integrity?.checked_rows ?? 0;
  const formattedCheckedRows = checkedRows.toLocaleString('vi-VN');

  return (
    <div className="space-y-2">
      <div className="rounded-2xl p-4 sm:p-5 border transition-all duration-200 flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-4">
          {status === 'OK' && (
            <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold text-lg shadow-md shadow-emerald-600/20">
              ✓
            </div>
          )}
          {status === 'BROKEN' && (
            <div className="w-11 h-11 rounded-2xl bg-red-600 text-white flex items-center justify-center font-bold text-lg shadow-md shadow-red-600/20">
              ✕
            </div>
          )}
          {status === 'NEVER_CHECKED' && (
            <div className="w-11 h-11 rounded-2xl bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold text-lg">
              ?
            </div>
          )}

          <div>
            <div className="flex items-center gap-2">
              {status === 'OK' && (
                <span className="font-extrabold text-[#002D54] dark:text-emerald-400 text-sm sm:text-base">
                  Chuỗi băm toàn vẹn
                </span>
              )}
              {status === 'BROKEN' && (
                <span className="font-extrabold text-red-600 dark:text-red-400 text-sm sm:text-base">
                  Chuỗi băm bị phá vỡ (Broken)
                </span>
              )}
              {status === 'NEVER_CHECKED' && (
                <span className="font-extrabold text-slate-600 dark:text-slate-300 text-sm sm:text-base">
                  Chưa kiểm tra chuỗi băm
                </span>
              )}
            </div>

            <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Đã kiểm tra: <strong className="text-slate-700 dark:text-slate-300">{formattedCheckedRows}</strong> bản ghi</span>
              {integrity?.verified_at && (
                <span>Lần kiểm tra gần nhất: <strong className="text-slate-700 dark:text-slate-300">{integrity.verified_at}</strong></span>
              )}
              {status === 'BROKEN' && integrity?.first_broken_id && (
                <span className="text-red-600 dark:text-red-400 font-semibold">
                  Bản ghi hỏng đầu tiên: #{integrity.first_broken_id}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status === 'BROKEN' && integrity?.first_broken_id && (
            <button
              type="button"
              onClick={() => onJumpToId && integrity.first_broken_id && onJumpToId(integrity.first_broken_id)}
              className="px-3.5 py-2 rounded-xl bg-red-100 hover:bg-red-200 dark:bg-red-950/50 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 text-xs font-bold transition-colors"
            >
              Chuyển tới dòng lỗi
            </button>
          )}

          <button
            type="button"
            onClick={handleRecheck}
            disabled={recheckMutation.isPending || isLoading}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold shadow-md shadow-emerald-900/20 transition-all disabled:opacity-50"
          >
            {recheckMutation.isPending ? 'Đang kiểm tra...' : 'Kiểm tra ngay'}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 text-xs rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 flex items-center justify-between">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-amber-600 hover:text-amber-800 dark:text-amber-400 ml-2 font-bold"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
