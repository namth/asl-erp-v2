'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useMe } from '@/hooks/use-auth';
import {
  useCaseMilestones,
  useCaseCommissionPolicy,
  useUpdateCommissionPolicy,
} from '@/hooks/use-finance';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { formatVnd } from '@/lib/format';
import { ApiError } from '@/lib/api-client';

function parseRateCents(str: string): bigint {
  const clean = str.trim();
  if (!clean) return 0n;
  const dotIdx = clean.indexOf('.');
  let wholeStr: string;
  let decStr: string;
  if (dotIdx === -1) {
    wholeStr = clean;
    decStr = '00';
  } else {
    wholeStr = clean.slice(0, dotIdx) || '0';
    decStr = clean.slice(dotIdx + 1);
    if (decStr.length === 1) decStr += '0';
    else if (decStr.length === 0) decStr = '00';
    else if (decStr.length > 2) decStr = decStr.slice(0, 2);
  }
  const whole = BigInt(wholeStr.replace(/^0+(?=\d)/, '') || '0');
  const dec = BigInt(decStr.replace(/^0+(?=\d)/, '') || '0');
  return whole * 100n + dec;
}

export default function CaseFinancePage() {
  const params = useParams();
  const caseId = (params?.id as string) || '';

  const { data: user } = useMe();
  const {
    data: milestones,
    isLoading: isMilestonesLoading,
    isError: isMilestonesError,
    error: milestonesError,
    refetch: refetchMilestones,
  } = useCaseMilestones(caseId);

  const {
    data: policy,
    isLoading: isPolicyLoading,
    isError: isPolicyError,
    error: policyError,
    refetch: refetchPolicy,
  } = useCaseCommissionPolicy(caseId);

  const updatePolicyMutation = useUpdateCommissionPolicy(caseId);

  const [isEditingPolicy, setIsEditingPolicy] = useState(false);
  const [originatorRate, setOriginatorRate] = useState('');
  const [managementRate, setManagementRate] = useState('');
  const [supervisorSharePct, setSupervisorSharePct] = useState('');
  const [executionRate, setExecutionRate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (policy) {
      setOriginatorRate(policy.originator_rate || '5.00');
      setManagementRate(policy.management_rate || '7.00');
      setSupervisorSharePct(policy.supervisor_share_pct || '40.00');
      setExecutionRate(policy.execution_rate || '8.00');
      setFormError(null);
    }
  }, [policy]);

  const isLoading = isMilestonesLoading || isPolicyLoading;

  if (isLoading) {
    return (
      <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <LoadingSkeleton lines={6} />
      </div>
    );
  }

  if (isMilestonesError || isPolicyError) {
    const err = milestonesError || policyError;
    return (
      <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <ErrorState
          title="Lỗi tải dữ liệu tài chính"
          message={err instanceof Error ? err.message : 'Không thể kết nối máy chủ.'}
          onRetry={() => {
            refetchMilestones();
            refetchPolicy();
          }}
        />
      </div>
    );
  }

  const isLocked = Boolean(policy?.locked_at);
  const isManager = user?.system_role === 'MANAGER' || user?.system_role === 'ADMIN';

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Tính tổng 4 tỷ lệ
    const oCents = parseRateCents(originatorRate);
    const mCents = parseRateCents(managementRate);
    const sCents = parseRateCents(supervisorSharePct);
    const eCents = parseRateCents(executionRate);
    const totalCents = oCents + mCents + sCents + eCents;

    // 100% = 10000n (100.00)
    if (totalCents > 10000n) {
      setFormError('Tổng tỷ lệ không hợp lệ: vượt quá 100%');
      return;
    }

    try {
      await updatePolicyMutation.mutateAsync({
        originator_rate: originatorRate.trim(),
        management_rate: managementRate.trim(),
        supervisor_share_pct: supervisorSharePct.trim(),
        execution_rate: executionRate.trim(),
      });
      setIsEditingPolicy(false);
      refetchPolicy();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'COMMISSION_POLICY_LOCKED') {
        setFormError('Đã khoá từ lần thu đầu');
      } else if (err instanceof Error) {
        setFormError(err.message);
      } else {
        setFormError('Đã xảy ra lỗi khi cập nhật chính sách.');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Khối chính sách hoa hồng */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Chính sách hoa hồng vụ việc
            </h2>
            {isLocked ? (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                Đã khoá
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                Đang mở
              </span>
            )}
          </div>

          {!isEditingPolicy && isManager && (
            <button
              type="button"
              disabled={isLocked}
              onClick={() => setIsEditingPolicy(true)}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Sửa chính sách
            </button>
          )}
        </div>

        {formError && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-300">
            {formError}
          </div>
        )}

        {isEditingPolicy ? (
          <form onSubmit={handleSavePolicy} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label
                  htmlFor="originator_rate"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300"
                >
                  Người tạo (Originator) %
                </label>
                <input
                  id="originator_rate"
                  type="text"
                  value={originatorRate}
                  onChange={(e) => setOriginatorRate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="management_rate"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300"
                >
                  Quản lý vụ việc (Management) %
                </label>
                <input
                  id="management_rate"
                  type="text"
                  value={managementRate}
                  onChange={(e) => setManagementRate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="supervisor_share_pct"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300"
                >
                  Giám sát (Supervisor) %
                </label>
                <input
                  id="supervisor_share_pct"
                  type="text"
                  value={supervisorSharePct}
                  onChange={(e) => setSupervisorSharePct(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="execution_rate"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300"
                >
                  Thực hiện (Execution) %
                </label>
                <input
                  id="execution_rate"
                  type="text"
                  value={executionRate}
                  onChange={(e) => setExecutionRate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsEditingPolicy(false);
                  setFormError(null);
                }}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={updatePolicyMutation.isPending}
                className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-sm disabled:opacity-50"
              >
                {updatePolicyMutation.isPending ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Người tạo (Originator)
              </span>
              <div className="text-lg font-bold font-mono text-blue-600 dark:text-blue-400">
                {policy?.originator_rate ? `${policy.originator_rate}%` : '0%'}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Quản lý vụ việc
              </span>
              <div className="text-lg font-bold font-mono text-blue-600 dark:text-blue-400">
                {policy?.management_rate ? `${policy.management_rate}%` : '0%'}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Giám sát
              </span>
              <div className="text-lg font-bold font-mono text-blue-600 dark:text-blue-400">
                {policy?.supervisor_share_pct ? `${policy.supervisor_share_pct}%` : '0%'}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Thực hiện
              </span>
              <div className="text-lg font-bold font-mono text-blue-600 dark:text-blue-400">
                {policy?.execution_rate ? `${policy.execution_rate}%` : '0%'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Khối danh sách đợt thu */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Danh sách đợt thu & Tiến độ thanh toán
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Kế hoạch thu tiền theo các mốc của vụ việc
          </p>
        </div>

        {!milestones || milestones.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Chưa có đợt thu nào được thiết lập cho vụ việc này.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {milestones.map((ms) => {
              const amountCents = parseRateCents(ms.amount || '0');
              const receivedCents = parseRateCents(ms.received_total || '0');
              const pctNumber =
                amountCents > 0n
                  ? Number((receivedCents * 100n) / amountCents)
                  : 0;
              const clampedPct = Math.min(100, Math.max(0, pctNumber));

              return (
                <div key={ms.id} className="p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-bold text-[11px] flex items-center justify-center font-mono">
                          {ms.order_index}
                        </span>
                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                          {ms.name}
                        </h3>
                      </div>
                      {ms.triggered_by_task?.title && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 pl-7">
                          Mở khi hoàn thành: {ms.triggered_by_task.title}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                        {formatVnd(ms.received_total)} / {formatVnd(ms.amount)}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {ms.status}
                      </span>
                    </div>
                  </div>

                  {/* Thanh tiến độ */}
                  <div className="space-y-1">
                    <div
                      role="progressbar"
                      aria-valuenow={clampedPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden progress-bar"
                    >
                      <div
                        className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${clampedPct}%` }}
                      />
                    </div>
                    <div className="text-right text-[10px] font-mono text-slate-400">
                      {clampedPct}% đã thu
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
