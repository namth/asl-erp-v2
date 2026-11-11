/* eslint-disable @next/next/no-img-element */
import React from 'react';
import type { ApprovalQueueItem, FloorplanUser } from '@/types/floorplan';

interface ApprovalLaneProps {
  queue: ApprovalQueueItem[];
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

export function ApprovalLane({ queue, onSelectUser }: ApprovalLaneProps) {
  if (!queue || queue.length === 0) {
    return (
      <div className="my-6 mx-auto max-w-2xl py-3 px-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 text-center">
        <p className="text-xs text-slate-400">
          Hàng chờ trình duyệt trống &bull; Không có hồ sơ chờ ký duyệt
        </p>
      </div>
    );
  }

  return (
    <div className="my-6 mx-auto max-w-3xl">
      <div className="flex items-center justify-between mb-3 px-2">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            Hàng Chờ Trình Duyệt Trước Bàn Trưởng Phòng ({queue.length})
          </h4>
        </div>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          Nhấp để mở ngăn phê duyệt
        </span>
      </div>

      <div className="p-4 rounded-2xl border-2 border-dashed border-amber-400/60 dark:border-amber-600/40 bg-amber-50/40 dark:bg-amber-950/20 backdrop-blur-sm flex flex-wrap items-center justify-center gap-4">
        {queue.map((item) => (
          <div
            key={item.user.id}
            onClick={() => onSelectUser(item.user)}
            tabIndex={0}
            aria-label={item.user.name}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                onSelectUser(item.user);
              }
            }}
            className="cursor-pointer group flex items-center space-x-3 p-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-white/90 dark:bg-slate-900/90 shadow-md hover:shadow-lg hover:scale-105 transition-all"
          >
            <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-amber-400 bg-amber-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
              {item.user.avatar_url ? (
                <img
                  src={item.user.avatar_url}
                  alt={item.user.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-sm font-bold text-amber-700 dark:text-amber-300">
                  {getInitials(item.user.name)}
                </span>
              )}
            </div>

            <div className="min-w-0 pr-2">
              <div className="flex items-center space-x-1.5">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                  {item.user.name}
                </p>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {item.user.title}
              </p>
              <div className="mt-1">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                  {item.pending_count} việc chờ duyệt
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
