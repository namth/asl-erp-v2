'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useClient } from '@/hooks/use-crm';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';

export interface ClientDetailPageProps {
  params?: Promise<{ id: string }>;
}

export default function ClientDetailPage({ params }: ClientDetailPageProps) {
  const router = useRouter();
  const routeParams = useParams();

  // Handle dynamic route params from hook and Next.js 15 Promise params
  let clientId = (routeParams?.id as string) || '';
  if (!clientId && params) {
    try {
      const unwrapped = React.use(params);
      if (unwrapped?.id) {
        clientId = unwrapped.id;
      }
    } catch {
      // Handled if suspension occurs
    }
  }

  const { data: client, isLoading, isError, error, refetch } = useClient(clientId);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="p-8 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
          <LoadingSkeleton lines={8} />
        </div>
      </div>
    );
  }

  if (isError || !client) {
    return (
      <div className="p-6">
        <ErrorState
          title="Thông báo lỗi"
          message={error?.message || 'Có lỗi xảy ra khi truy vấn chi tiết khách hàng.'}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const casesList = client.cases || [];
  const interactionsList = client.interactions || [];

  return (
    <div className="p-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <button
            type="button"
            onClick={() => router.push('/crm/clients')}
            className="text-xs font-semibold text-[#0082B4] hover:underline mb-2 block"
          >
            Quay lại danh sách khách hàng
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {client.name}
            </h1>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60">
              {client.client_type === 'ENTERPRISE'
                ? 'Doanh nghiệp'
                : client.client_type === 'INDIVIDUAL'
                ? 'Cá nhân'
                : 'Khách quốc tế'}
            </span>
          </div>
        </div>
      </div>

      {/* Grid: Client Details & Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Client profile */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700 pb-3">
              Thông tin liên hệ
            </h3>

            {/* MST for Enterprise */}
            {client.tax_code && (
              <div>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
                  Mã số thuế
                </span>
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-mono">
                  {client.tax_code}
                </span>
              </div>
            )}

            {/* Masked identity_no for Individual */}
            {client.identity_no && (
              <div>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
                  CCCD / Hộ chiếu
                </span>
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-mono">
                  {client.identity_no}
                </span>
              </div>
            )}

            {/* Representative Name */}
            {client.representative_name && (
              <div>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
                  Người đại diện pháp luật
                </span>
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {client.representative_name}
                </span>
              </div>
            )}

            {/* Phone */}
            <div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
                Số điện thoại
              </span>
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {client.phone}
              </span>
            </div>

            {/* Email */}
            {client.email && (
              <div>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
                  Địa chỉ email
                </span>
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {client.email}
                </span>
              </div>
            )}

            {/* Address */}
            <div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
                Địa chỉ trụ sở / Liên hệ
              </span>
              <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                {client.address}
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Cases & Activity */}
        <div className="lg:col-span-2 space-y-6">
          {/* Cases list */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Danh sách vụ việc pháp lý ({casesList.length})
              </h3>
            </div>

            {casesList.length === 0 ? (
              <EmptyState
                title="Chưa có vụ việc"
                description="Khách hàng hiện tại chưa liên kết hồ sơ nào trên hệ thống."
              />
            ) : (
              <div className="space-y-3">
                {casesList.map((cs) => (
                  <div
                    key={cs.id}
                    onClick={() => router.push(`/cases/${cs.id}`)}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#0082B4] hover:bg-slate-50 dark:hover:bg-slate-750 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div>
                      <span className="text-xs font-mono font-bold text-[#0082B4] block mb-1">
                        {cs.case_code}
                      </span>
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {cs.title}
                      </h4>
                    </div>
                    {cs.status && (
                      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 self-start sm:self-auto">
                        {cs.status}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Interaction timeline if any */}
          {interactionsList.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700 pb-3">
                Nhật ký tương tác ({interactionsList.length})
              </h3>
              <div className="space-y-3">
                {interactionsList.map((interaction) => (
                  <div
                    key={interaction.id}
                    className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 space-y-1"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-semibold uppercase tracking-wider text-[#002D54] dark:text-[#0082B4]">
                        {interaction.kind}
                      </span>
                      <span>{new Date(interaction.occurred_at).toLocaleDateString('vi-VN')}</span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300">
                      {interaction.summary}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
