'use client';

import React from 'react';
import { AuditLogItem } from '@/types/audit';

export function formatVietnamTime(isoDateStr: string): string {
  try {
    const date = new Date(isoDateStr);
    if (isNaN(date.getTime())) return isoDateStr;

    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const p: Record<string, string> = {};
    for (const part of parts) {
      p[part.type] = part.value;
    }
    return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
  } catch {
    return isoDateStr;
  }
}

export function renderActor(log: AuditLogItem): { name: string; email?: string } {
  if (log.actor_type === 'SYSTEM') {
    return { name: 'Hệ thống' };
  }
  if (log.actor_type === 'USER') {
    if (log.actor && log.actor.full_name) {
      return { name: log.actor.full_name, email: log.actor.email };
    }
    return { name: 'Không xác định' };
  }
  return { name: 'Không xác định' };
}

interface AuditTableProps {
  logs: AuditLogItem[];
  onSelectLog: (log: AuditLogItem) => void;
  selectedLogId?: number | null;
}

export function AuditTable({ logs, onSelectLog, selectedLogId }: AuditTableProps) {
  return (
    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left border-collapse">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="p-4">Thời gian</th>
              <th className="p-4">Người thực hiện</th>
              <th className="p-4">Hành động</th>
              <th className="p-4">Đối tượng</th>
              <th className="p-4">Địa chỉ IP</th>
              <th className="p-4 text-right">Xem thay đổi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
            {logs.map((log) => {
              const actorInfo = renderActor(log);
              const formattedTime = formatVietnamTime(log.created_at);
              const isSelected = selectedLogId === log.id;

              return (
                <tr
                  key={log.id}
                  id={`audit-row-${log.id}`}
                  onClick={() => onSelectLog(log)}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-blue-50/70 dark:bg-blue-950/40'
                      : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <td className="p-4 whitespace-nowrap text-slate-700 dark:text-slate-300 font-mono">
                    {formattedTime}
                  </td>
                  <td className="p-4">
                    <div className="font-semibold text-slate-800 dark:text-slate-100">
                      {actorInfo.name}
                    </div>
                    {actorInfo.email && (
                      <div className="text-[10px] text-slate-400 font-mono">
                        {actorInfo.email}
                      </div>
                    )}
                  </td>
                  <td className="p-4">
                    <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-blue-100/70 text-[#002D54] dark:bg-blue-950 dark:text-cyan-300 border border-blue-200 dark:border-blue-900">
                      {log.action}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="font-medium text-slate-800 dark:text-slate-200">
                      {log.entity_name}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      ID: {log.entity_id}
                    </div>
                  </td>
                  <td className="p-4 font-mono text-slate-600 dark:text-slate-400">
                    {log.ip_address || '-'}
                  </td>
                  <td className="p-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectLog(log);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-[#002D54] hover:text-white dark:bg-slate-800 dark:hover:bg-[#0082B4] text-slate-700 dark:text-slate-200 font-bold text-xs transition-colors shadow-sm"
                    >
                      Chi tiết
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
