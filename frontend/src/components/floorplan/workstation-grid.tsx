/* eslint-disable @next/next/no-img-element */
import React from 'react';
import type { FloorplanUser, WorkstationDesk } from '@/types/floorplan';

interface WorkstationGridProps {
  desks: WorkstationDesk[];
  onSelectUser: (user: FloorplanUser) => void;
}

function getInitials(name: string): string {
  if (!name) return '';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  const first = words[words.length - 2][0];
  const last = words[words.length - 1][0];
  return (first + last).toUpperCase();
}

export function WorkstationGrid({ desks, onSelectUser }: WorkstationGridProps) {
  if (!desks || desks.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-4">
      {desks.map((desk) => {
        const isInQueue = desk.is_in_queue;
        const isIdle = desk.is_idle || desk.in_progress_count === 0;

        return (
          <div
            key={desk.user.id || desk.desk_index}
            onClick={() => onSelectUser(desk.user)}
            tabIndex={0}
            aria-label={desk.user.name}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                onSelectUser(desk.user);
              }
            }}
            className={`cursor-pointer group relative rounded-2xl border transition-all duration-300 p-5 ${
              isInQueue
                ? 'opacity-60 border-dashed border-amber-400 bg-amber-50/20 dark:bg-amber-950/10 hover:opacity-90'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-md hover:shadow-xl hover:-translate-y-1'
            }`}
          >
            {/* Header badges */}
            <div className="flex items-center justify-between mb-4 min-h-[28px]">
              <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                Bàn làm việc #{desk.desk_index}
              </span>

              <div className="flex items-center space-x-1.5 flex-wrap justify-end">
                {isInQueue && (
                  <span className="px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80 rounded-full border border-amber-300 dark:border-amber-700">
                    Đang trình duyệt
                  </span>
                )}

                {isIdle ? (
                  <span className="px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 rounded-full border border-emerald-300 dark:border-emerald-700">
                    ☕ Đang nghỉ ngơi
                  </span>
                ) : (
                  <>
                    <span className="px-2 py-0.5 text-xs font-semibold text-sky-800 dark:text-sky-300 bg-sky-100 dark:bg-sky-950/60 rounded-full border border-sky-300 dark:border-sky-700">
                      ⚡ {desk.in_progress_count} Đang làm
                    </span>
                    <span className="px-2 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-300 dark:border-slate-700">
                      ⏳ {desk.todo_count} Chờ xử lý
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Profile body */}
            <div className="flex items-center space-x-4">
              <div className="relative w-14 h-14 rounded-2xl overflow-hidden border-2 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 shadow-sm">
                {desk.user.avatar_url ? (
                  <img
                    src={desk.user.avatar_url}
                    alt={desk.user.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-base font-bold text-slate-700 dark:text-slate-300">
                    {getInitials(desk.user.name)}
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate group-hover:text-[#0082B4] transition-colors">
                  {desk.user.name}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {desk.user.title}
                </p>
                {isInQueue && (
                  <p className="mt-1 text-[11px] italic text-amber-600 dark:text-amber-400">
                    Đang xếp hàng chờ duyệt...
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
