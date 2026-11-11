'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useOpportunities,
  useUpdateOpportunityStage,
  useConvertOpportunity,
} from '@/hooks/use-crm';
import {
  Opportunity,
  OpportunityStage,
  MilestonePayload,
  ConvertOpportunityPayload,
} from '@/types/crm';
import { formatVnd, compareCurrencyStrings, sumCurrencyStrings } from '@/lib/format';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ApiError } from '@/lib/api-client';

const STAGES: { key: OpportunityStage; label: string }[] = [
  { key: 'NEW_LEAD', label: 'Tiếp nhận mới (NEW LEAD)' },
  { key: 'PROPOSAL_SENT', label: 'Đã gửi đề xuất (PROPOSAL)' },
  { key: 'NEGOTIATION', label: 'Thương lượng điều khoản' },
  { key: 'WON', label: 'Thành công (WON)' },
  { key: 'LOST', label: 'Thất bại (LOST)' },
];

const VALID_TRANSITIONS: Record<OpportunityStage, OpportunityStage[]> = {
  NEW_LEAD: ['PROPOSAL_SENT', 'LOST'],
  PROPOSAL_SENT: ['NEGOTIATION', 'LOST'],
  NEGOTIATION: ['WON', 'LOST'],
  WON: [],
  LOST: [],
};

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function OpportunitiesPage() {
  const router = useRouter();
  const { data: opportunities, isLoading, isError, error, refetch } = useOpportunities();
  const updateStageMutation = useUpdateOpportunityStage();
  const convertOpportunityMutation = useConvertOpportunity();

  // Lost reason modal state
  const [lostTargetOpp, setLostTargetOpp] = useState<Opportunity | null>(null);
  const [lostReasonInput, setLostReasonInput] = useState('');
  const [lostReasonError, setLostReasonError] = useState('');

  // Convert modal state
  const [convertTargetOpp, setConvertTargetOpp] = useState<Opportunity | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');
  const [matterTypeId, setMatterTypeId] = useState('matter-type-tm');
  const [convertTitle, setConvertTitle] = useState('');
  const [contractValue, setContractValue] = useState('');
  const [milestones, setMilestones] = useState<MilestonePayload[]>([
    { name: 'Đợt 1 - Tạm ứng khi ký hợp đồng', amount: '' },
  ]);
  const [convertValidationError, setConvertValidationError] = useState('');
  const [convertServerError, setConvertServerError] = useState('');
  const [isNetworkError, setIsNetworkError] = useState(false);

  const handleOpenLostModal = (opp: Opportunity) => {
    setLostTargetOpp(opp);
    setLostReasonInput('');
    setLostReasonError('');
  };

  const handleConfirmLost = async () => {
    if (!lostTargetOpp) return;
    const trimmedReason = lostReasonInput.trim();
    if (!trimmedReason) {
      setLostReasonError('Vui lòng nhập lý do thất bại bắt buộc');
      return;
    }

    // Guard transition
    const allowed = VALID_TRANSITIONS[lostTargetOpp.stage];
    if (!allowed.includes('LOST')) {
      setLostReasonError('Không thể chuyển sang trạng thái thất bại từ giai đoạn hiện tại');
      return;
    }

    try {
      await updateStageMutation.mutateAsync({
        id: lostTargetOpp.id,
        stage: 'LOST',
        lost_reason: trimmedReason,
      });
      setLostTargetOpp(null);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setLostReasonError(err.message);
      }
    }
  };

  const handleMoveStage = async (opp: Opportunity, nextStage: OpportunityStage) => {
    if (nextStage === 'LOST') {
      handleOpenLostModal(opp);
      return;
    }

    // State machine client guard
    const allowed = VALID_TRANSITIONS[opp.stage];
    if (!allowed.includes(nextStage)) {
      return;
    }

    await updateStageMutation.mutateAsync({
      id: opp.id,
      stage: nextStage,
    });
  };

  const handleOpenConvertModal = (opp: Opportunity) => {
    const newKey = generateUuid();
    setIdempotencyKey(newKey);
    setConvertTargetOpp(opp);
    setConvertTitle(opp.title);
    setContractValue(opp.expected_value || '');
    setMilestones([
      { name: 'Đợt 1 - Tạm ứng khi ký hợp đồng', amount: opp.expected_value || '' },
    ]);
    setConvertValidationError('');
    setConvertServerError('');
    setIsNetworkError(false);
  };

  const executeConvert = async () => {
    if (!convertTargetOpp) return;
    setConvertValidationError('');
    setConvertServerError('');
    setIsNetworkError(false);

    const cleanContractValue = contractValue.trim();
    if (!cleanContractValue) {
      setConvertValidationError('Vui lòng nhập giá trị hợp đồng');
      return;
    }

    // Validate milestone sum <= contract_value
    const totalMilestones = sumCurrencyStrings(milestones.map((m) => m.amount || '0'));
    if (compareCurrencyStrings(totalMilestones, cleanContractValue) > 0) {
      setConvertValidationError('Tổng các đợt thu không được vượt quá giá trị hợp đồng');
      return;
    }

    const payload: ConvertOpportunityPayload = {
      matter_type_id: matterTypeId,
      title: convertTitle.trim(),
      contract_value: cleanContractValue,
      milestones: milestones.map((m) => ({
        name: m.name.trim(),
        amount: m.amount.trim(),
      })),
    };

    try {
      const res = await convertOpportunityMutation.mutateAsync({
        id: convertTargetOpp.id,
        data: payload,
        idempotencyKey,
      });

      setConvertTargetOpp(null);
      if (res.case_id) {
        router.push(`/cases/${res.case_id}`);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setIsNetworkError(false);
        if (err.code === 'OPPORTUNITY_ALREADY_CONVERTED') {
          setConvertServerError(err.message || 'Cơ hội đã được chuyển đổi thành vụ việc');
        } else if (err.code === 'MILESTONES_EXCEED_CONTRACT') {
          setConvertServerError(err.message || 'Tổng các đợt thu vượt quá giá trị hợp đồng');
        } else if (err.code === 'NO_PUBLISHED_TEMPLATE') {
          setConvertServerError(err.message || 'Chưa có quy trình mẫu được phát hành cho loại vụ việc');
        } else {
          setConvertServerError(err.message);
        }
      } else {
        setIsNetworkError(true);
        setConvertServerError('Lỗi kết nối');
      }
    }
  };

  const handleMilestoneAmountChange = (index: number, val: string) => {
    const updated = [...milestones];
    updated[index] = { ...updated[index], amount: val };
    setMilestones(updated);
  };

  const handleMilestoneNameChange = (index: number, val: string) => {
    const updated = [...milestones];
    updated[index] = { ...updated[index], name: val };
    setMilestones(updated);
  };

  const handleAddMilestone = () => {
    setMilestones((prev) => [
      ...prev,
      { name: `Đợt ${prev.length + 1}`, amount: '' },
    ]);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="p-8 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
          <LoadingSkeleton lines={8} />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <ErrorState
          title="Thông báo hệ thống"
          message={error?.message || 'Có lỗi xảy ra'}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const items = opportunities || [];

  if (items.length === 0) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Pipeline Cơ hội kinh doanh
        </h1>
        <EmptyState
          title="Chưa có cơ hội"
          description="Pipeline hiện tại đang trống."
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Pipeline Cơ hội kinh doanh
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Theo dõi tiến độ, chuyển đổi hợp đồng dịch vụ pháp lý
          </p>
        </div>
      </div>

      {/* Kanban Board with 5 stage columns */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 overflow-x-auto pb-4">
        {STAGES.map((col) => {
          const colItems = items.filter((o) => o.stage === col.key);

          return (
            <div
              key={col.key}
              className="flex flex-col rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-3 min-w-[260px]"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {col.label}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                  {colItems.length}
                </span>
              </div>

              {/* Cards in column */}
              <div className="space-y-3 flex-1">
                {colItems.map((opp) => (
                  <div
                    key={opp.id}
                    data-opportunity-id={opp.id}
                    className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3 hover:border-[#0082B4] transition-all"
                  >
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                        {opp.title}
                      </h4>
                      <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span>Giá trị:</span>
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                          {formatVnd(opp.expected_value)}
                        </span>
                      </div>
                      {opp.probability_pct !== undefined && (
                        <div className="mt-0.5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span>Xác suất:</span>
                          <span className="font-semibold">{opp.probability_pct}%</span>
                        </div>
                      )}
                      {opp.lost_reason && (
                        <p className="mt-2 text-xs italic text-red-500 bg-red-50 dark:bg-red-950/20 p-2 rounded-lg">
                          Lý do huỷ: {opp.lost_reason}
                        </p>
                      )}
                    </div>

                    {/* Action buttons on card */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex flex-col gap-2">
                      {/* Mark as lost action for non-terminal stages */}
                      {opp.stage !== 'WON' && opp.stage !== 'LOST' && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            data-testid={`btn-mark-lost-${opp.id}`}
                            onClick={() => handleOpenLostModal(opp)}
                            className="text-xs text-red-600 dark:text-red-400 hover:underline font-medium"
                          >
                            Đóng hồ sơ
                          </button>
                          {opp.stage === 'NEW_LEAD' && (
                            <button
                              type="button"
                              onClick={() => handleMoveStage(opp, 'PROPOSAL_SENT')}
                              className="text-xs text-[#0082B4] hover:underline font-medium ml-auto"
                            >
                              Gửi đề xuất
                            </button>
                          )}
                          {opp.stage === 'PROPOSAL_SENT' && (
                            <button
                              type="button"
                              onClick={() => handleMoveStage(opp, 'NEGOTIATION')}
                              className="text-xs text-[#0082B4] hover:underline font-medium ml-auto"
                            >
                              Tiến hành thương thảo
                            </button>
                          )}
                          {opp.stage === 'NEGOTIATION' && (
                            <button
                              type="button"
                              onClick={() => handleMoveStage(opp, 'WON')}
                              className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-medium ml-auto"
                            >
                              Ký hợp đồng
                            </button>
                          )}
                        </div>
                      )}

                      {/* Convert to case button: ONLY enabled for WON stage */}
                      {opp.stage === 'WON' && (
                        <button
                          type="button"
                          onClick={() => handleOpenConvertModal(opp)}
                          className="w-full py-2 px-3 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#002D54] to-[#0082B4] hover:opacity-95 shadow-sm transition-all text-center"
                        >
                          Chuyển thành vụ việc
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Xác nhận lý do thất bại (LOST) */}
      {lostTargetOpp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Đánh dấu cơ hội thất bại
            </h3>
            <p className="text-xs text-slate-500">
              Ghi chú nguyên nhân cơ hội &quot;{lostTargetOpp.title}&quot; không tiếp tục để lưu trữ thống kê.
            </p>

            <div>
              <label
                htmlFor="lost-reason-input"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Lý do thất bại
              </label>
              <textarea
                id="lost-reason-input"
                rows={3}
                value={lostReasonInput}
                onChange={(e) => setLostReasonInput(e.target.value)}
                placeholder="Ví dụ: Khách hàng tạm dừng kế hoạch kinh doanh..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              {lostReasonError && (
                <p className="mt-1 text-xs text-red-600 font-medium">
                  {lostReasonError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setLostTargetOpp(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={handleConfirmLost}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Chuyển đổi thành vụ việc (Convert) */}
      {convertTargetOpp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Chuyển đổi thành vụ việc pháp lý
              </h3>
              <button
                type="button"
                onClick={() => setConvertTargetOpp(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-semibold"
              >
                Đóng
              </button>
            </div>

            {convertServerError && (
              <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 text-xs text-red-700 dark:text-red-300 space-y-2">
                {isNetworkError ? (
                  <div className="flex items-center justify-between">
                    <span>Kết nối máy chủ bị gián đoạn.</span>
                    <button
                      type="button"
                      onClick={executeConvert}
                      className="px-3 py-1 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700 transition-colors"
                    >
                      Thử lại
                    </button>
                  </div>
                ) : (
                  <p className="font-semibold">{convertServerError}</p>
                )}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="convert-matter-type"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Loại vụ việc
                </label>
                <select
                  id="convert-matter-type"
                  value={matterTypeId}
                  onChange={(e) => setMatterTypeId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
                >
                  <option value="matter-type-tm">Đăng ký nhãn hiệu (TM)</option>
                  <option value="matter-type-ld">Tranh chấp đất đai (LD)</option>
                  <option value="matter-type-ma">Tư vấn M&A (MA)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="convert-title"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Tiêu đề vụ việc
                </label>
                <input
                  id="convert-title"
                  type="text"
                  value={convertTitle}
                  onChange={(e) => setConvertTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="convert-contract-value"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Giá trị hợp đồng (VNĐ)
                </label>
                <input
                  id="convert-contract-value"
                  type="text"
                  value={contractValue}
                  onChange={(e) => setContractValue(e.target.value)}
                  placeholder="Ví dụ: 150000000"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>

              {/* Milestones section */}
              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Kế hoạch đợt thu phí
                  </span>
                  <button
                    type="button"
                    onClick={handleAddMilestone}
                    className="text-xs font-semibold text-[#0082B4] hover:underline"
                  >
                    + Thêm đợt thu
                  </button>
                </div>

                {milestones.map((m, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      type="text"
                      aria-label={`Tên đợt ${idx + 1}`}
                      value={m.name}
                      onChange={(e) => handleMilestoneNameChange(idx, e.target.value)}
                      placeholder="Tên đợt"
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                    <input
                      type="text"
                      aria-label="Số tiền đợt thu"
                      value={m.amount}
                      onChange={(e) => handleMilestoneAmountChange(idx, e.target.value)}
                      placeholder="Số tiền đợt"
                      className="w-36 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                    />
                  </div>
                ))}
              </div>

              {convertValidationError && (
                <p className="text-xs text-red-600 font-medium">
                  {convertValidationError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setConvertTargetOpp(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Huỷ
              </button>
              <button
                type="button"
                disabled={convertOpportunityMutation.isPending}
                onClick={executeConvert}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#002D54] to-[#0082B4] hover:opacity-95 disabled:opacity-50 transition-all shadow-sm"
              >
                {convertOpportunityMutation.isPending ? 'Đang chuyển đổi...' : 'Xác nhận chuyển đổi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
