import React from 'react';

export interface LoadingSkeletonProps {
  lines?: number;
  className?: string;
}

export function LoadingSkeleton({ lines = 3, className = '' }: LoadingSkeletonProps) {
  return (
    <div
      className={`space-y-3 animate-pulse ${className}`}
      role="status"
      aria-label="Đang tải dữ liệu"
    >
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className="h-4 bg-slate-200 dark:bg-slate-800 rounded-md w-full"
          style={{ width: index === lines - 1 && lines > 1 ? '70%' : '100%' }}
        />
      ))}
    </div>
  );
}
