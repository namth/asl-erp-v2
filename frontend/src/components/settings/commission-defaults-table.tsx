import React, { useState, useEffect } from 'react';
import { CommissionDefaultItem } from '@/hooks/use-settings';
import { Percent, AlertTriangle } from 'lucide-react';

interface CommissionDefaultsTableProps {
  items: CommissionDefaultItem[];
  canEdit: boolean;
  onSave: (payload: CommissionDefaultItem[]) => void;
  isSaving: boolean;
  serverError?: {
    code?: string;
    message?: string;
    details?: {
      matter_type_id?: string;
    };
  } | null;
}

interface ValidationRowError {
  originator?: string;
  management?: string;
  supervisor?: string;
  execution?: string;
  sum?: string;
}

function parseRateCents(val: string): { valid: boolean; cents: number; error?: string } {
  const trimmed = val.trim();
  if (!trimmed || !/^\d+(\.\d+)?$/.test(trimmed)) {
    return { valid: false, cents: 0, error: 'Tỷ lệ phải từ 0 đến 100' };
  }
  const parts = trimmed.split('.');
  const intPart = parts[0];
  const decPart = parts[1] || '';
  if (decPart.length > 2) {
    return { valid: false, cents: 0, error: 'Tối đa 2 chữ số lẻ' };
  }
  const intNum = parseInt(intPart, 10);
  if (intNum > 100 || (intNum === 100 && parseInt(decPart || '0', 10) > 0)) {
    return { valid: false, cents: 0, error: 'Tỷ lệ phải từ 0 đến 100' };
  }
  const cents = intNum * 100 + parseInt(decPart.padEnd(2, '0').slice(0, 2), 10);
  return { valid: true, cents };
}

export function CommissionDefaultsTable({
  items,
  canEdit,
  onSave,
  isSaving,
  serverError,
}: CommissionDefaultsTableProps) {
  const [formData, setFormData] = useState<CommissionDefaultItem[]>(items);
  const [rowErrors, setRowErrors] = useState<Record<string, ValidationRowError>>({});

  useEffect(() => {
    setFormData(items);
  }, [items]);

  const handleChange = (
    matterTypeId: string,
    field: keyof CommissionDefaultItem,
    value: string
  ) => {
    setFormData((prev) =>
      prev.map((item) =>
        item.matter_type_id === matterTypeId ? { ...item, [field]: value } : item
      )
    );
    if (rowErrors[matterTypeId]) {
      setRowErrors((prev) => {
        const updated = { ...prev };
        delete updated[matterTypeId];
        return updated;
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, ValidationRowError> = {};
    let hasError = false;

    for (const row of formData) {
      const err: ValidationRowError = {};

      const rOrig = parseRateCents(row.default_originator_rate);
      if (!rOrig.valid) err.originator = rOrig.error;

      const rMgmt = parseRateCents(row.default_management_rate);
      if (!rMgmt.valid) err.management = rMgmt.error;

      const rSup = parseRateCents(row.default_supervisor_share_pct);
      if (!rSup.valid) err.supervisor = rSup.error;

      const rExec = parseRateCents(row.default_execution_rate);
      if (!rExec.valid) err.execution = rExec.error;

      if (rOrig.valid && rMgmt.valid && rExec.valid) {
        const totalCents = rOrig.cents + rMgmt.cents + rExec.cents;
        if (totalCents > 10000) {
          err.sum = 'Tổng 3 tỷ lệ hoa hồng không được vượt quá 100%';
        }
      }

      if (Object.keys(err).length > 0) {
        newErrors[row.matter_type_id] = err;
        hasError = true;
      }
    }

    if (hasError) {
      setRowErrors(newErrors);
      return;
    }

    setRowErrors({});
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Percent className="w-5 h-5 text-[#002D54] dark:text-cyan-400" />
            Tỷ lệ hoa hồng mặc định theo loại vụ việc
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Chỉ áp cho vụ việc tạo sau khi lưu
          </p>
        </div>

        <button
          type={canEdit ? 'submit' : 'button'}
          disabled={!canEdit || isSaving}
          className="px-5 py-2 text-xs font-bold text-white rounded-xl bg-gradient-to-r from-[#002D54] to-[#0082B4] hover:from-[#002444] hover:to-[#00709c] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
        >
          {isSaving ? 'Đang lưu...' : 'Lưu cấu hình'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
              <th className="py-3 px-4 min-w-[200px]">Loại vụ việc</th>
              <th className="py-3 px-3 min-w-[130px]">Người mang khách về (%)</th>
              <th className="py-3 px-3 min-w-[130px]">Quản lý vụ việc (%)</th>
              <th className="py-3 px-3 min-w-[130px]">Tỷ lệ giám sát (%)</th>
              <th className="py-3 px-3 min-w-[130px]">Thực hiện vụ việc (%)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {formData.map((row) => {
              const rowErr = rowErrors[row.matter_type_id];
              const isServerErr =
                serverError?.code === 'COMMISSION_RATES_EXCEED_100' &&
                (!serverError?.details?.matter_type_id ||
                  serverError.details.matter_type_id === row.matter_type_id);

              return (
                <React.Fragment key={row.matter_type_id}>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                      <div>{row.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{row.code}</div>
                    </td>

                    <td className="py-3 px-3">
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={row.default_originator_rate}
                        onChange={(e) =>
                          handleChange(row.matter_type_id, 'default_originator_rate', e.target.value)
                        }
                        className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors ${
                          rowErr?.originator
                            ? 'border-red-400 bg-red-50 text-red-900 dark:bg-red-950/20 dark:border-red-800'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100'
                        } disabled:bg-slate-100 dark:disabled:bg-slate-800/60 disabled:text-slate-500`}
                      />
                      {rowErr?.originator && (
                        <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                          {rowErr.originator}
                        </p>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={row.default_management_rate}
                        onChange={(e) =>
                          handleChange(row.matter_type_id, 'default_management_rate', e.target.value)
                        }
                        className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors ${
                          rowErr?.management
                            ? 'border-red-400 bg-red-50 text-red-900 dark:bg-red-950/20 dark:border-red-800'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100'
                        } disabled:bg-slate-100 dark:disabled:bg-slate-800/60 disabled:text-slate-500`}
                      />
                      {rowErr?.management && (
                        <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                          {rowErr.management}
                        </p>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={row.default_supervisor_share_pct}
                        onChange={(e) =>
                          handleChange(
                            row.matter_type_id,
                            'default_supervisor_share_pct',
                            e.target.value
                          )
                        }
                        className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors ${
                          rowErr?.supervisor
                            ? 'border-red-400 bg-red-50 text-red-900 dark:bg-red-950/20 dark:border-red-800'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100'
                        } disabled:bg-slate-100 dark:disabled:bg-slate-800/60 disabled:text-slate-500`}
                      />
                      {rowErr?.supervisor && (
                        <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                          {rowErr.supervisor}
                        </p>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={row.default_execution_rate}
                        onChange={(e) =>
                          handleChange(row.matter_type_id, 'default_execution_rate', e.target.value)
                        }
                        className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors ${
                          rowErr?.execution
                            ? 'border-red-400 bg-red-50 text-red-900 dark:bg-red-950/20 dark:border-red-800'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100'
                        } disabled:bg-slate-100 dark:disabled:bg-slate-800/60 disabled:text-slate-500`}
                      />
                      {rowErr?.execution && (
                        <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                          {rowErr.execution}
                        </p>
                      )}
                    </td>
                  </tr>

                  {(rowErr?.sum || isServerErr) && (
                    <tr className="bg-red-50/50 dark:bg-red-950/20">
                      <td colSpan={5} className="py-2 px-4 text-xs font-medium text-red-600 dark:text-red-400">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>
                            {rowErr?.sum || serverError?.message || 'Tổng tỷ lệ hoa hồng vượt quá 100%'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </form>
  );
}
