'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AccountingInboxItem, ConfirmPaymentResponse } from '@/types/finance';
import { useConfirmPayment } from '@/hooks/use-accounting';
import { parseMoneyInput, compareMoney, subtractMoney } from '@/lib/money';
import { formatVnd } from '@/lib/format';
import { ApiError } from '@/lib/api-client';

interface ConfirmPaymentModalProps {
  item: AccountingInboxItem | null;
  isOpen: boolean;
  onClose: () => void;
  onRefreshInbox: () => void;
}

export function ConfirmPaymentModal({
  item,
  isOpen,
  onClose,
  onRefreshInbox,
}: ConfirmPaymentModalProps) {
  const [misaInvoiceNo, setMisaInvoiceNo] = useState('');
  const [bankRefCode, setBankRefCode] = useState('');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [notes, setNotes] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [bankRefError, setBankRefError] = useState<string | null>(null);
  const [apiGeneralError, setApiGeneralError] = useState<string | null>(null);

  const [successResult, setSuccessResult] = useState<ConfirmPaymentResponse | null>(null);

  const idempotencyKeyRef = useRef<string>('');
  const confirmPaymentMutation = useConfirmPayment();

  useEffect(() => {
    if (isOpen && item) {
      setMisaInvoiceNo('');
      setBankRefCode('');
      setReceivedAmount(item.remaining);
      setNotes('');
      setFormError(null);
      setBankRefError(null);
      setApiGeneralError(null);
      setSuccessResult(null);

      // Tạo Idempotency-Key mới cho mỗi lần mở hộp thoại
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        idempotencyKeyRef.current = crypto.randomUUID();
      } else {
        idempotencyKeyRef.current = '550e8400-e29b-41d4-a716-' + Math.random().toString(36).substring(2, 14);
      }
    }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  // Kiểm tra thu thừa
  const parsedAmount = parseMoneyInput(receivedAmount);
  const isOverpayment =
    parsedAmount !== null &&
    compareMoney(parsedAmount, item.remaining) > 0;
  const overpaymentDiff = isOverpayment
    ? subtractMoney(parsedAmount, item.remaining)
    : '0';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setBankRefError(null);
    setApiGeneralError(null);

    // Validate bắt buộc
    if (!misaInvoiceNo.trim() || !bankRefCode.trim()) {
      setFormError('Số hoá đơn MISA và Mã giao dịch ngân hàng là bắt buộc');
      return;
    }

    if (!parsedAmount || compareMoney(parsedAmount, '0') <= 0) {
      setFormError('Số tiền thực nhận phải lớn hơn 0 và đúng định dạng tiền tệ');
      return;
    }

    try {
      const res = await confirmPaymentMutation.mutateAsync({
        milestone_id: item.milestone_id,
        misa_invoice_no: misaInvoiceNo.trim(),
        bank_ref_code: bankRefCode.trim(),
        received_amount: parsedAmount,
        notes: notes.trim() || undefined,
        idempotency_key: idempotencyKeyRef.current,
      });
      setSuccessResult(res);
      onRefreshInbox();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === 'DUPLICATE_BANK_REF') {
          setBankRefError(err.message || 'Mã giao dịch ngân hàng đã tồn tại trên hệ thống');
        } else if (err.code === 'MILESTONE_NOT_AWAITING_PAYMENT') {
          setApiGeneralError(err.message || 'Đợt thu không ở trạng thái chờ thanh toán');
          onRefreshInbox();
        } else {
          setApiGeneralError(err.message || 'Đã xảy ra lỗi khi xác nhận thu tiền');
        }
      } else if (err instanceof Error) {
        setApiGeneralError(err.message || 'Mất kết nối mạng. Vui lòng thử lại.');
      } else {
        setApiGeneralError('Đã xảy ra lỗi không xác định.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Xác nhận đã thu tiền
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {item.case.case_code} — {item.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
          >
            <span className="sr-only">Đóng</span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {successResult ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 space-y-2">
              <div className="font-bold flex items-center gap-2">
                <span>Xác nhận thu tiền thành công!</span>
                <span className="px-2 py-0.5 rounded text-xs bg-emerald-200 dark:bg-emerald-800 text-emerald-900 dark:text-emerald-100">
                  {successResult.data.milestone_status}
                </span>
              </div>
              {successResult.data.stage_unblocked && (
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  Đã mở khoá giai đoạn kế tiếp cho luật sư
                </p>
              )}
              <div className="text-xs">
                Tổng đã nhận: <strong>{formatVnd(successResult.data.received_total)}</strong> · Còn lại:{' '}
                <strong>{formatVnd(successResult.data.remaining)}</strong>
              </div>
            </div>

            {/* Bảng hoa hồng phát sinh */}
            {successResult.data.commissions && successResult.data.commissions.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Hoa hồng phát sinh từ đợt thu này
                </h4>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500">
                      <tr>
                        <th className="p-2.5">Vai trò</th>
                        <th className="p-2.5">Nhân sự</th>
                        <th className="p-2.5 text-right">Số tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {successResult.data.commissions.map((comm, idx) => (
                        <tr key={idx}>
                          <td className="p-2.5 font-semibold text-slate-700 dark:text-slate-300">
                            {comm.role_type}
                          </td>
                          <td className="p-2.5 text-slate-500 font-mono text-[11px]">
                            {comm.user_id}
                          </td>
                          <td className="p-2.5 text-right font-bold font-mono text-emerald-600 dark:text-emerald-400">
                            {formatVnd(comm.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Execution carried forward nếu có */}
            {compareMoney(successResult.data.execution_carried_forward || '0', '0') > 0 && (
              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-300">
                Phần hoa hồng thực hiện dồn sang đợt kế tiếp: {formatVnd(successResult.data.execution_carried_forward)}
              </div>
            )}

            <div className="pt-4 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-sm"
              >
                Đóng
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {apiGeneralError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-300">
                {apiGeneralError}
              </div>
            )}

            {formError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-300">
                {formError}
              </div>
            )}

            {isOverpayment && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
                Cảnh báo: Thu thừa {formatVnd(overpaymentDiff)} so với số tiền còn lại ({formatVnd(item.remaining)}). Hệ thống vẫn ghi nhận thu thừa.
              </div>
            )}

            <div className="space-y-1">
              <label
                htmlFor="misa_invoice_no"
                className="block text-xs font-bold text-slate-700 dark:text-slate-300"
              >
                Số hoá đơn MISA <span className="text-red-500">*</span>
              </label>
              <input
                id="misa_invoice_no"
                type="text"
                value={misaInvoiceNo}
                onChange={(e) => setMisaInvoiceNo(e.target.value)}
                placeholder="VD: HD-2026-00456"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="bank_ref_code"
                className="block text-xs font-bold text-slate-700 dark:text-slate-300"
              >
                Mã giao dịch ngân hàng <span className="text-red-500">*</span>
              </label>
              <input
                id="bank_ref_code"
                type="text"
                value={bankRefCode}
                onChange={(e) => setBankRefCode(e.target.value)}
                placeholder="VD: FT262991048201"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {bankRefError && (
                <p className="text-xs text-red-500 font-semibold mt-1">
                  {bankRefError}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label
                htmlFor="received_amount"
                className="block text-xs font-bold text-slate-700 dark:text-slate-300"
              >
                Số tiền thực nhận <span className="text-red-500">*</span>
              </label>
              <input
                id="received_amount"
                type="text"
                value={receivedAmount}
                onChange={(e) => setReceivedAmount(e.target.value)}
                placeholder="VD: 30.000.000"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Số còn lại của đợt: <strong>{formatVnd(item.remaining)}</strong>
              </p>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="notes"
                className="block text-xs font-bold text-slate-700 dark:text-slate-300"
              >
                Ghi chú
              </label>
              <textarea
                id="notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ghi chú đối soát hoặc thông tin chứng từ..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={confirmPaymentMutation.isPending}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-sm disabled:opacity-50"
              >
                {confirmPaymentMutation.isPending ? 'Đang xử lý...' : 'Hoàn tất xác nhận'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
