'use client';

import React from 'react';
import { ActorType, AuditLogsFilter } from '@/types/audit';

interface AuditFiltersProps {
  filters: AuditLogsFilter;
  onChange: (filters: AuditLogsFilter) => void;
}

export function AuditFilters({ filters, onChange }: AuditFiltersProps) {
  const handleActionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...filters,
      action: e.target.value || undefined,
      page: 1,
    });
  };

  const handleActorTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as ActorType | '';
    onChange({
      ...filters,
      actor_type: val ? (val as ActorType) : undefined,
      page: 1,
    });
  };

  const handleEntityNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...filters,
      entity_name: e.target.value || undefined,
      page: 1,
    });
  };

  const handleReset = () => {
    onChange({
      page: 1,
      limit: filters.limit || 50,
    });
  };

  return (
    <div className="rounded-2xl p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label
            htmlFor="filter-action"
            className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1"
          >
            Hành động
          </label>
          <input
            id="filter-action"
            type="text"
            value={filters.action || ''}
            onChange={handleActionChange}
            placeholder="Lọc theo hành động..."
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0082B4]"
          />
        </div>

        <div>
          <label
            htmlFor="filter-actor-type"
            className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1"
          >
            Loại đối tượng
          </label>
          <select
            id="filter-actor-type"
            value={filters.actor_type || ''}
            onChange={handleActorTypeChange}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0082B4]"
          >
            <option value="">Tất cả</option>
            <option value="USER">USER</option>
            <option value="SYSTEM">SYSTEM</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="filter-entity-name"
            className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1"
          >
            Tên thực thể
          </label>
          <input
            id="filter-entity-name"
            type="text"
            value={filters.entity_name || ''}
            onChange={handleEntityNameChange}
            placeholder="Ví dụ: users, cases, roles..."
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0082B4]"
          />
        </div>

        <div className="flex items-end">
          <button
            type="button"
            onClick={handleReset}
            className="w-full py-2 px-3 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors border border-slate-200 dark:border-slate-700"
          >
            Đặt lại bộ lọc
          </button>
        </div>
      </div>
    </div>
  );
}
