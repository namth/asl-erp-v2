'use client';

import React from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { FolderPlus } from 'lucide-react';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Bàn làm việc cá nhân
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Theo dõi hồ sơ và tác vụ của bạn
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
        <EmptyState
          icon={<FolderPlus className="w-12 h-12 text-slate-400" />}
          title="Danh mục hồ sơ"
          description="Hiện tại danh sách chưa có dữ liệu nào."
          action={{
            label: 'Tiếp nhận hồ sơ',
            onClick: () => {},
          }}
        />
      </div>
    </div>
  );
}
