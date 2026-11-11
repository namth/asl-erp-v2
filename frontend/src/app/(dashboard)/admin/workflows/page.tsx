'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useMe } from '@/hooks/use-auth';
import { useWorkflowTemplates, useCreateWorkflowTemplate } from '@/hooks/use-workflows';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ApiError } from '@/lib/api-client';
import type { WorkflowMode, WorkflowTemplate } from '@/types/workflow';

export default function WorkflowsPage() {
  const { data: currentUser } = useMe();
  const isAdmin = currentUser?.system_role === 'ADMIN';
  const isManager = currentUser?.system_role === 'MANAGER';
  const hasAccess = isAdmin || isManager;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formMatterTypeId, setFormMatterTypeId] = useState('mt-shtt-01');
  const [formMode, setFormMode] = useState<WorkflowMode>('STRICT');
  const [createError, setCreateError] = useState<string | null>(null);

  const {
    data: templates,
    isLoading,
    isError,
    refetch,
  } = useWorkflowTemplates();

  const createMutation = useCreateWorkflowTemplate();

  if (!hasAccess && currentUser) {
    return (
      <div className="p-8">
        <ErrorState
          title="Không có quyền truy cập"
          message="Vui lòng liên hệ Quản trị viên để được cấp quyền."
        />
      </div>
    );
  }

  const handleOpenCreate = () => {
    setFormName('');
    setFormMatterTypeId('mt-shtt-01');
    setFormMode('STRICT');
    setCreateError(null);
    setIsCreateOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    const trimmedName = formName.trim();
    if (!trimmedName) {
      setCreateError('Vui lòng nhập tên quy trình');
      return;
    }

    try {
      await createMutation.mutateAsync({
        matter_type_id: formMatterTypeId,
        name: trimmedName,
        mode: formMode,
      });
      setIsCreateOpen(false);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === 'ACTIVE_TEMPLATE_EXISTS' || err.status === 409) {
          setCreateError(err.message || 'Loại vụ việc đã có template đang hoạt động');
          return;
        }
        setCreateError(err.message || 'Lỗi khi tạo quy trình');
      } else {
        setCreateError('Có lỗi xảy ra khi tạo quy trình');
      }
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-6xl mx-auto">
      {/* Tiêu đề & thanh công cụ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Thiết kế & quản lý mẫu quy trình
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Định nghĩa các giai đoạn, tác vụ tiêu chuẩn, SLA và quy tắc kiểm soát cho từng loại dịch vụ pháp lý
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={handleOpenCreate}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#002D54] hover:bg-[#002444] rounded-xl transition-colors shadow-sm self-start sm:self-auto"
          >
            Tạo quy trình
          </button>
        )}
      </div>

      {/* Modal tạo template mới */}
      {isCreateOpen && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Khởi tạo mẫu quy trình mới
            </h3>

            {createError && (
              <div className="p-3 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-lg">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="template-name"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Tên quy trình
                </label>
                <input
                  id="template-name"
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Tên quy trình"
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-[#002D54]"
                />
              </div>

              <div>
                <label
                  htmlFor="matter-type-select"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Loại vụ việc áp dụng
                </label>
                <select
                  id="matter-type-select"
                  value={formMatterTypeId}
                  onChange={(e) => setFormMatterTypeId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-[#002D54]"
                >
                  <option value="mt-shtt-01">Sở hữu trí tuệ - Đăng ký Nhãn hiệu</option>
                  <option value="mt-shtt-sc">Sở hữu trí tuệ - Đăng ký Sáng chế</option>
                  <option value="mt-corp-01">Doanh nghiệp - Tư vấn M&A</option>
                  <option value="mt-lit-01">Tranh tụng - Tranh chấp Hợp đồng</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="workflow-mode-select"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Chế độ quản trị quy trình
                </label>
                <select
                  id="workflow-mode-select"
                  value={formMode}
                  onChange={(e) => setFormMode(e.target.value as WorkflowMode)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-[#002D54]"
                >
                  <option value="STRICT">Khung cứng (STRICT) - Bất biến, không được thêm task ngoài luồng</option>
                  <option value="FLEXIBLE">Linh hoạt (FLEXIBLE) - Cho phép đề xuất bổ sung tác vụ qua phê duyệt</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#002D54] hover:bg-[#002444] rounded-lg transition-colors shadow-sm disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Đang tạo...' : 'Lưu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4 Trạng thái giao diện */}
      {isLoading ? (
        <LoadingSkeleton lines={6} className="mt-4" />
      ) : isError ? (
        <ErrorState
          title="Có lỗi xảy ra"
          message="Vui lòng thử lại sau giây lát."
          onRetry={refetch}
        />
      ) : !templates || templates.length === 0 ? (
        <EmptyState
          title="Chưa có quy trình"
          description="Bắt đầu thiết kế quy trình đầu tiên cho văn phòng luật."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((tpl: WorkflowTemplate) => (
            <div
              key={tpl.id}
              className="p-5 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs hover:border-[#002D54]/40 dark:hover:border-[#0082B4]/40 transition-all space-y-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  {tpl.matter_type_name &&
                    !tpl.name.toLowerCase().includes(tpl.matter_type_name.toLowerCase()) && (
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 mb-1.5">
                        {tpl.matter_type_name}
                      </span>
                    )}
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 line-clamp-1">
                    {tpl.name}
                  </h3>
                </div>

                {tpl.mode === 'STRICT' ? (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900">
                    Khung cứng
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900">
                    Linh hoạt
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs">
                <span className="text-slate-600 dark:text-slate-400">
                  Phiên bản {tpl.published_version_no ?? 1}
                </span>

                <span className="text-slate-300 dark:text-slate-700">•</span>

                {tpl.draft_version_id ? (
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    Có bản nháp
                  </span>
                ) : (
                  <span className="text-slate-400">
                    Chưa có nháp
                  </span>
                )}
              </div>

              <div className="pt-2 flex justify-end">
                <Link
                  href={`/admin/workflows/${tpl.id}`}
                  className="px-3 py-1.5 text-xs font-semibold text-[#002D54] dark:text-[#0082B4] hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors border border-slate-200 dark:border-slate-700"
                >
                  Soạn thảo quy trình →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
