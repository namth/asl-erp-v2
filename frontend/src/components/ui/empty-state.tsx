import React from 'react';

export interface EmptyStateProps {
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  icon?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 ${className}`}
    >
      {icon && <div className="mb-4 text-slate-400">{icon}</div>}
      <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{title}</h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm">{description}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 px-4 py-2 text-xs font-bold text-white rounded-xl bg-gradient-to-r from-[#002D54] to-[#0082B4] hover:from-[#002444] hover:to-[#00709c] transition-all shadow-sm"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
