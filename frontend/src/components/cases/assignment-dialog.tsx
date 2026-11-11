import React, { useState, useEffect } from 'react';
import { CaseAssignment, RoleInCase } from '@/types/cases';
import { ApiError } from '@/lib/api-client';

export interface AssignmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  assignments: CaseAssignment[];
  onSave: (assignments: { user_id: string; role_in_case: RoleInCase }[]) => Promise<void>;
  isSaving?: boolean;
}

interface AssignmentItem {
  user_id: string;
  full_name: string;
  role_in_case: RoleInCase;
}

export function AssignmentDialog({
  isOpen,
  onClose,
  assignments,
  onSave,
  isSaving = false,
}: AssignmentDialogProps) {
  const [items, setItems] = useState<AssignmentItem[]>([]);
  const [newUserId, setNewUserId] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<RoleInCase>('EXECUTOR');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<{
    message: string;
    taskIds?: string[];
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setItems(
        assignments.map((a) => ({
          user_id: a.user_id,
          full_name: a.full_name || a.user_id,
          role_in_case: a.role_in_case,
        }))
      );
      setValidationError(null);
      setApiError(null);
    }
  }, [isOpen, assignments]);

  if (!isOpen) return null;

  const handleAddPerson = () => {
    if (!newUserId.trim()) {
      setValidationError('Vui lòng nhập mã định danh hoặc tên thành viên');
      return;
    }
    const name = newFullName.trim() || newUserId.trim();
    setItems((prev) => [
      ...prev,
      { user_id: newUserId.trim(), full_name: name, role_in_case: newRole },
    ]);
    setNewUserId('');
    setNewFullName('');
    setValidationError(null);
  };

  const handleRemove = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setValidationError(null);
  };

  const handleRoleChange = (index: number, role: RoleInCase) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, role_in_case: role } : item))
    );
    setValidationError(null);
  };

  const validate = (): boolean => {
    const caseManagers = items.filter((i) => i.role_in_case === 'CASE_MANAGER');
    if (caseManagers.length !== 1) {
      setValidationError('Vụ việc bắt buộc phải có đúng 1 Quản lý phụ trách (CASE_MANAGER).');
      return false;
    }

    const supervisors = items.filter((i) => i.role_in_case === 'SUPERVISOR');
    if (supervisors.length > 1) {
      setValidationError('Vụ việc chỉ được phép có tối đa 1 Giám sát (SUPERVISOR).');
      return false;
    }

    setValidationError(null);
    return true;
  };

  const handleSave = async () => {
    setApiError(null);
    if (!validate()) {
      return;
    }

    try {
      const payload = items.map((i) => ({
        user_id: i.user_id,
        role_in_case: i.role_in_case,
      }));
      await onSave(payload);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        const details = err.details as { task_ids?: string[] } | undefined;
        setApiError({
          message: err.message || 'Không thể lưu phân công',
          taskIds: details?.task_ids,
        });
      } else if (err instanceof Error) {
        setApiError({ message: err.message });
      } else {
        setApiError({ message: 'Đã xảy ra lỗi không xác định khi lưu phân công' });
      }
    }
  };

  const roles: { value: RoleInCase; label: string }[] = [
    { value: 'CASE_MANAGER', label: 'Quản lý phụ trách (CASE_MANAGER)' },
    { value: 'SUPERVISOR', label: 'Giám sát (SUPERVISOR)' },
    { value: 'EXECUTOR', label: 'Thực hiện (EXECUTOR)' },
    { value: 'ASSISTANT', label: 'Trợ lý (ASSISTANT)' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Sửa phân công nhân sự
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Đúng 1 CASE_MANAGER, tối đa 1 SUPERVISOR, nhiều EXECUTOR/ASSISTANT
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {validationError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-300 font-medium">
              {validationError}
            </div>
          )}

          {apiError && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-800 dark:text-rose-200">
              {apiError.taskIds && apiError.taskIds.length > 0 ? (
                <div>
                  <span className="font-semibold block mb-1">
                    Công việc chưa hoàn thành cần xử lý:
                  </span>
                  <div className="font-mono text-[11px] text-rose-700 dark:text-rose-300">
                    {apiError.taskIds.join(', ')}
                  </div>
                </div>
              ) : (
                <div className="font-semibold">{apiError.message}</div>
              )}
            </div>
          )}

          {/* List of current assignments */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Danh sách nhân sự phân công ({items.length})
            </label>
            {items.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                Chưa có nhân sự nào được phân công
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item, index) => (
                  <div
                    key={`${item.user_id}-${index}`}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                        {item.full_name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono truncate">
                        ID: {item.user_id}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        aria-label={`Vai trò của ${item.full_name}`}
                        value={item.role_in_case}
                        onChange={(e) => handleRoleChange(index, e.target.value as RoleInCase)}
                        className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {roles.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => handleRemove(index)}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                        title="Xoá phân công"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add member form */}
          <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-3">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Thêm thành viên mới
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="User ID (vd: u-123)"
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
              />
              <input
                type="text"
                placeholder="Họ và tên thành viên"
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <select
                aria-label="Chọn vai trò cho thành viên mới"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as RoleInCase)}
                className="px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 flex-1"
              >
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddPerson}
                className="px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 hover:bg-slate-700 transition-colors"
              >
                + Thêm
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50/50 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 transition-colors"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 text-xs font-bold text-white rounded-xl bg-[#002D54] hover:bg-[#001f3b] transition-colors shadow-sm disabled:opacity-50"
          >
            {isSaving ? 'Đang lưu...' : 'Lưu phân công'}
          </button>
        </div>
      </div>
    </div>
  );
}
