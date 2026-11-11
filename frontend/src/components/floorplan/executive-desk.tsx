/* eslint-disable @next/next/no-img-element */
import React from 'react';
import type { FloorplanUser } from '@/types/floorplan';

interface ExecutiveDeskProps {
  leader: FloorplanUser;
  departmentName: string;
}

function getInitials(name: string): string {
  if (!name) return '';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  const first = words[words.length - 2][0];
  const last = words[words.length - 1][0];
  return (first + last).toUpperCase();
}

export function ExecutiveDesk({ leader, departmentName }: ExecutiveDeskProps) {
  return (
    <div className="relative mx-auto max-w-xl rounded-2xl border border-amber-600/30 bg-gradient-to-b from-amber-900/10 via-amber-800/5 to-slate-900/10 dark:from-amber-500/10 dark:to-slate-900/40 p-6 shadow-xl backdrop-blur-md">
      <div className="text-center mb-3">
        <span className="inline-block px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 bg-amber-100/70 dark:bg-amber-950/60 rounded-full border border-amber-300 dark:border-amber-800">
          Khu vực Điều Hành &bull; {departmentName}
        </span>
      </div>

      <div className="flex flex-col items-center">
        <div className="relative group">
          <div className="relative w-20 h-20 rounded-2xl overflow-hidden border-2 border-amber-500 shadow-lg bg-amber-50 dark:bg-slate-800 flex items-center justify-center">
            {leader.avatar_url ? (
              <img
                src={leader.avatar_url}
                alt={leader.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-xl font-extrabold text-amber-700 dark:text-amber-300">
                {getInitials(leader.name)}
              </span>
            )}
          </div>
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 text-[10px] font-bold text-white bg-amber-600 rounded-md shadow">
            Trưởng phòng
          </span>
        </div>

        <div className="mt-4 text-center">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
            {leader.name}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {leader.title}
          </p>
        </div>
      </div>
    </div>
  );
}
