import React from 'react';
import type { ReportScope } from '@/types/reports';

export interface ScopeBadgeProps {
  scope?: ReportScope;
}

export function ScopeBadge({ scope }: ScopeBadgeProps) {
  if (!scope) return null;

  const labels: Record<ReportScope, string> = {
    FIRM: 'Toàn hãng',
    DEPARTMENT: 'Phòng ban',
    SELF: 'Số liệu của tôi',
  };

  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
      {labels[scope] || scope}
    </span>
  );
}
