import React from 'react';

export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  title?: string;
  className?: string;
}

export function ErrorState({
  message,
  onRetry,
  title = 'Có lỗi xảy ra',
  className = '',
}: ErrorStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center p-6 text-center rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 ${className}`}
    >
      <h4 className="text-sm font-bold text-red-800 dark:text-red-300">{title}</h4>
      <p className="mt-1 text-xs text-red-600 dark:text-red-400">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 px-4 py-1.5 text-xs font-bold text-white rounded-xl bg-red-600 hover:bg-red-700 transition-colors shadow-sm"
        >
          Thử lại
        </button>
      )}
    </div>
  );
}
