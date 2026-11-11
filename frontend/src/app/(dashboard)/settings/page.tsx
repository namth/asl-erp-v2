'use client';

import React from 'react';
import { useMe } from '@/hooks/use-auth';
import { useCommissionDefaults, useUpdateCommissionDefaults, CommissionDefaultItem } from '@/hooks/use-settings';
import { MyAccountCard } from '@/components/settings/my-account-card';
import { CommissionDefaultsTable } from '@/components/settings/commission-defaults-table';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ui/error-state';

export default function SettingsPage() {
  const { data: user } = useMe();
  const {
    data: commissionDefaults,
    isLoading: isLoadingCommission,
    isError: isErrorCommission,
    refetch: refetchCommission,
  } = useCommissionDefaults();

  const updateCommissionMutation = useUpdateCommissionDefaults();

  const canEditCommission = user?.system_role === 'ADMIN';

  const handleSaveCommission = (payload: CommissionDefaultItem[]) => {
    updateCommissionMutation.mutate(payload);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Cài đặt hệ thống
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Quản lý tài khoản cá nhân và phân bổ hoa hồng nghiệp vụ
          </p>
        </div>
      </div>

      <MyAccountCard user={user} />

      {isLoadingCommission && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm animate-pulse space-y-4">
          <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-1/4" />
          <LoadingSkeleton lines={5} />
        </div>
      )}

      {isErrorCommission && (
        <ErrorState
          title="Thông báo gián đoạn"
          message="Hệ thống gặp sự cố khi xử lý dữ liệu cài đặt."
          onRetry={() => refetchCommission()}
        />
      )}

      {!isLoadingCommission && !isErrorCommission && commissionDefaults && (
        <CommissionDefaultsTable
          items={commissionDefaults}
          canEdit={canEditCommission}
          onSave={handleSaveCommission}
          isSaving={updateCommissionMutation.isPending}
          serverError={updateCommissionMutation.error as { code?: string; message?: string; details?: { matter_type_id?: string } } | null}
        />
      )}
    </div>
  );
}
