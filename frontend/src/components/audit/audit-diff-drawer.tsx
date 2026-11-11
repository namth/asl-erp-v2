'use client';

import React, { useState } from 'react';
import { AuditLogItem } from '@/types/audit';

export interface DiffItem {
  key: string;
  type: 'added' | 'removed' | 'changed';
  oldValue?: unknown;
  newValue?: unknown;
}

export function flattenObject(obj: unknown, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (obj === null || obj === undefined) return result;
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    if (prefix) result[prefix] = obj;
    return result;
  }
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, newKey));
    } else {
      result[newKey] = value;
    }
  }
  return result;
}

export function computeDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): DiffItem[] {
  const flatBefore = flattenObject(before);
  const flatAfter = flattenObject(after);

  const allKeys = Array.from(new Set([...Object.keys(flatBefore), ...Object.keys(flatAfter)])).sort();
  const diffs: DiffItem[] = [];

  for (const key of allKeys) {
    const hasBefore = Object.prototype.hasOwnProperty.call(flatBefore, key);
    const hasAfter = Object.prototype.hasOwnProperty.call(flatAfter, key);

    if (hasBefore && !hasAfter) {
      diffs.push({ key, type: 'removed', oldValue: flatBefore[key] });
    } else if (!hasBefore && hasAfter) {
      diffs.push({ key, type: 'added', newValue: flatAfter[key] });
    } else {
      const bVal = flatBefore[key];
      const aVal = flatAfter[key];
      if (JSON.stringify(bVal) !== JSON.stringify(aVal)) {
        diffs.push({ key, type: 'changed', oldValue: bVal, newValue: aVal });
      }
    }
  }

  return diffs;
}

function formatValue(val: unknown): string {
  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

interface AuditDiffDrawerProps {
  log: AuditLogItem | null;
  onClose: () => void;
}

export function AuditDiffDrawer({ log, onClose }: AuditDiffDrawerProps) {
  const [copied, setCopied] = useState(false);

  if (!log) return null;

  const diffs = computeDiff(log.before_state, log.after_state);
  const shortHash = log.row_hash ? log.row_hash.slice(0, 12) : '';

  const handleCopyHash = async () => {
    if (log.row_hash && navigator.clipboard) {
      await navigator.clipboard.writeText(log.row_hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="diff-drawer-title"
    >
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 my-8">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 id="diff-drawer-title" className="font-extrabold text-[#002D54] dark:text-cyan-400 text-base">
              Chi tiết thay đổi kiểm toán (JSON Diff)
            </h3>
            <div className="text-xs text-slate-500 mt-1">
              Bản ghi #{log.id} • Hành động: <span className="font-semibold text-slate-700 dark:text-slate-300">{log.action}</span> • Thực thể: <span className="font-mono text-slate-700 dark:text-slate-300">{log.entity_name} ({log.entity_id})</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        {/* Row Hash section */}
        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Mã băm toàn vẹn (SHA-256)
            </div>
            <div className="font-mono text-xs font-semibold text-[#002D54] dark:text-cyan-300 mt-0.5">
              {shortHash}
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopyHash}
            aria-label="Sao chép toàn bộ mã băm"
            className="px-3 py-1.5 rounded-xl bg-slate-200/70 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors flex items-center gap-1.5"
          >
            <span>{copied ? 'Đã sao chép' : 'Sao chép'}</span>
          </button>
        </div>

        {/* Diff content */}
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {diffs.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
              Không có dữ liệu thay đổi
            </div>
          ) : (
            <div className="space-y-2 text-xs">
              {diffs.map((diff) => {
                if (diff.type === 'added') {
                  return (
                    <div
                      key={diff.key}
                      className="p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold text-emerald-800 dark:text-emerald-300">
                          {diff.key}
                        </span>
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-200/70 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200">
                          Khoá thêm
                        </span>
                      </div>
                      <div className="font-mono text-emerald-700 dark:text-emerald-300 break-all pl-2 border-l-2 border-emerald-300">
                        + {formatValue(diff.newValue)}
                      </div>
                    </div>
                  );
                }

                if (diff.type === 'removed') {
                  return (
                    <div
                      key={diff.key}
                      className="p-3 rounded-xl bg-red-50/80 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold text-red-800 dark:text-red-300">
                          {diff.key}
                        </span>
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-red-200/70 dark:bg-red-900 text-red-800 dark:text-red-200">
                          Khoá bỏ
                        </span>
                      </div>
                      <div className="font-mono text-red-700 dark:text-red-300 break-all pl-2 border-l-2 border-red-300">
                        - {formatValue(diff.oldValue)}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={diff.key}
                    className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-amber-900 dark:text-amber-300">
                        {diff.key}
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-200/70 dark:bg-amber-900 text-amber-900 dark:text-amber-200">
                        Khoá đổi
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono">
                      <div className="p-2 rounded-lg bg-red-100/50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-900">
                        <div className="text-[9px] uppercase font-bold text-red-600 mb-0.5">Trước:</div>
                        <div className="break-all">{formatValue(diff.oldValue)}</div>
                      </div>
                      <div className="p-2 rounded-lg bg-emerald-100/50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
                        <div className="text-[9px] uppercase font-bold text-emerald-600 mb-0.5">Sau:</div>
                        <div className="break-all">{formatValue(diff.newValue)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#002D54] hover:bg-[#0082B4] text-white text-xs font-bold transition-colors shadow-sm"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
