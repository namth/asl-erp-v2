'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMe } from '@/hooks/use-auth';
import {
  useWorkflowTemplates,
  useWorkflowVersion,
  useSaveWorkflowVersion,
  usePublishWorkflowVersion,
  useCreateWorkflowVersion,
  useUpdateWorkflowTemplate,
} from '@/hooks/use-workflows';
import {
  findCycle,
  findForwardDependency,
  validateDraft,
  type ValidationErrorItem,
} from '@/lib/workflow-graph';
import { CustomFieldsEditor } from '@/components/workflow/custom-fields-editor';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { ApiError } from '@/lib/api-client';
import type {
  WorkflowStage,
  WorkflowTask,
  WorkflowVersion,
  WorkflowMode,
} from '@/types/workflow';

export default function WorkflowEditorPage() {
  const params = useParams();
  const templateId = (params?.id as string) || '';
  const router = useRouter();

  const { data: currentUser } = useMe();
  const isAdmin = currentUser?.system_role === 'ADMIN';
  const isManager = currentUser?.system_role === 'MANAGER';
  const hasAccess = isAdmin || isManager;

  const [activeTab, setActiveTab] = useState<'flow' | 'custom-fields'>('flow');

  // Lấy danh sách template để tìm template hiện tại
  const { data: templates } = useWorkflowTemplates();
  const currentTemplate = useMemo(
    () => templates?.find((t) => t.id === templateId),
    [templates, templateId]
  );

  const versionIdToLoad =
    currentTemplate?.draft_version_id ||
    (currentTemplate?.published_version_no ? `ver-pub-${currentTemplate.published_version_no}` : undefined);

  // Tải chi tiết phiên bản quy trình
  const {
    data: versionData,
    isLoading: isVersionLoading,
    isError: isVersionError,
    refetch: refetchVersion,
  } = useWorkflowVersion(versionIdToLoad);

  // Mutations
  const saveMutation = useSaveWorkflowVersion();
  const publishMutation = usePublishWorkflowVersion();
  const createVersionMutation = useCreateWorkflowVersion();
  const updateTemplateMutation = useUpdateWorkflowTemplate();

  // Local state cho các stage & task đang soạn thảo
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [generalSuccess, setGeneralSuccess] = useState<string | null>(null);

  // Cycle error highlighting từ server (details.cycle)
  const [serverCycleKeys, setServerCycleKeys] = useState<string[]>([]);

  // Dialog xác nhận phát hành
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);

  // Dialog xác nhận đổi chế độ STRICT ↔ FLEXIBLE
  const [isModeDialogOpen, setIsModeDialogOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<WorkflowMode | null>(null);

  // Đồng bộ stages từ versionData
  useEffect(() => {
    if (versionData?.stages) {
      setStages(JSON.parse(JSON.stringify(versionData.stages)));
    }
  }, [versionData]);

  const isDraft = versionData?.status === 'DRAFT';
  const isReadOnly = isManager || !isDraft;

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

  // Thu thập danh sách các task có thể làm dependency cho 1 task ở stageIndex
  // Luật: CHỈ CÁC TASK Ở STAGE HIỆN TẠI HOẶC STAGE TRƯỚC ĐÓ (order_index <= current_order_index)
  const getAvailableDependencies = (currentStageIndex: number, currentTaskKey: string) => {
    const list: Array<{ key: string; title: string }> = [];
    for (let i = 0; i <= currentStageIndex; i++) {
      const st = stages[i];
      if (!st?.tasks) continue;
      for (const t of st.tasks) {
        if (t.key !== currentTaskKey) {
          list.push({
            key: t.key,
            title: t.title || t.key,
          });
        }
      }
    }
    return list;
  };

  // 1. Thao tác Stage
  const handleAddStage = () => {
    if (isReadOnly) return;
    const newIndex = stages.length + 1;
    let nextKey = `s${newIndex}`;
    while (stages.some((s) => s.key === nextKey)) {
      nextKey = `s${Math.floor(Math.random() * 1000) + 1}`;
    }

    const newStage: WorkflowStage = {
      key: nextKey,
      name: `Giai đoạn ${newIndex}`,
      order_index: newIndex,
      requires_approval: false,
      tasks: [],
    };
    setStages([...stages, newStage]);
  };

  const handleDeleteStage = (stageKey: string) => {
    if (isReadOnly) return;
    const filtered = stages
      .filter((s) => s.key !== stageKey)
      .map((s, idx) => ({ ...s, order_index: idx + 1 }));
    setStages(filtered);
  };

  const handleMoveStage = (fromIndex: number, toIndex: number) => {
    if (isReadOnly) return;
    if (toIndex < 0 || toIndex >= stages.length) return;

    const newStages = [...stages];
    const [moved] = newStages.splice(fromIndex, 1);
    newStages.splice(toIndex, 0, moved);

    // Cập nhật lại order_index tuần tự
    const reindexed = newStages.map((s, idx) => ({
      ...s,
      order_index: idx + 1,
    }));
    setStages(reindexed);
  };

  const handleUpdateStageName = (index: number, name: string) => {
    if (isReadOnly) return;
    const newStages = [...stages];
    newStages[index] = { ...newStages[index], name };
    setStages(newStages);
  };

  const handleToggleStageApproval = (index: number, requires_approval: boolean) => {
    if (isReadOnly) return;
    const newStages = [...stages];
    newStages[index] = { ...newStages[index], requires_approval };
    setStages(newStages);
  };

  // 2. Thao tác Task
  const handleAddTask = (stageIndex: number) => {
    if (isReadOnly) return;
    let totalTasksCount = 0;
    stages.forEach((s) => (totalTasksCount += s.tasks?.length || 0));

    let nextTaskKey = `t${totalTasksCount + 1}`;
    const allTaskKeys = new Set(stages.flatMap((s) => s.tasks?.map((t) => t.key) || []));
    while (allTaskKeys.has(nextTaskKey)) {
      nextTaskKey = `t${Math.floor(Math.random() * 10000) + 1}`;
    }

    const newTask: WorkflowTask = {
      key: nextTaskKey,
      title: 'Tác vụ mới',
      description: null,
      default_case_role: 'EXECUTOR',
      sla_business_days: 2,
      complexity_weight: 1,
      requires_approval: false,
      triggers_milestone_order: null,
      depends_on: [],
    };

    const newStages = [...stages];
    newStages[stageIndex] = {
      ...newStages[stageIndex],
      tasks: [...(newStages[stageIndex].tasks || []), newTask],
    };
    setStages(newStages);
  };

  const handleDeleteTask = (stageIndex: number, taskKey: string) => {
    if (isReadOnly) return;
    const newStages = [...stages];
    newStages[stageIndex] = {
      ...newStages[stageIndex],
      tasks: (newStages[stageIndex].tasks || []).filter((t) => t.key !== taskKey),
    };
    setStages(newStages);
  };

  const handleUpdateTaskField = <K extends keyof WorkflowTask>(
    stageIndex: number,
    taskIndex: number,
    field: K,
    value: WorkflowTask[K]
  ) => {
    if (isReadOnly) return;
    const newStages = [...stages];
    const targetTask = { ...newStages[stageIndex].tasks[taskIndex], [field]: value };
    newStages[stageIndex].tasks[taskIndex] = targetTask;
    setStages(newStages);
  };

  // 3. Tạo phiên bản DRAFT mới khi đang ở bản phát hành chỉ đọc
  const handleCreateNewVersion = async () => {
    setGeneralError(null);
    try {
      await createVersionMutation.mutateAsync(templateId);
      refetchVersion();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setGeneralError(err.message || 'Template đã có một phiên bản DRAFT');
      } else {
        setGeneralError('Có lỗi xảy ra khi tạo phiên bản mới');
      }
    }
  };

  // 4. Lưu bản nháp (Save Draft)
  const handleSaveDraft = async () => {
    if (isReadOnly || !versionData) return;
    setFieldErrors({});
    setGeneralError(null);
    setGeneralSuccess(null);

    const payload: WorkflowVersion = {
      ...versionData,
      stages,
    };

    try {
      await saveMutation.mutateAsync({
        id: versionData.id,
        data: payload,
      });
      setGeneralSuccess('Đã lưu bản nháp quy trình thành công');
      setTimeout(() => setGeneralSuccess(null), 3000);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 422 && err.details && typeof err.details === 'object') {
          const detailsObj = err.details as { fields?: ValidationErrorItem[] };
          if (detailsObj.fields && Array.isArray(detailsObj.fields)) {
            const mapped: Record<string, string> = {};
            detailsObj.fields.forEach((item) => {
              mapped[item.field] = item.message;
            });
            setFieldErrors(mapped);
            setGeneralError('Vui lòng kiểm tra các ô thông tin bị lỗi bên dưới.');
            return;
          }
        }
        setGeneralError(err.message || 'Lỗi khi lưu bản nháp');
      } else {
        setGeneralError('Có lỗi xảy ra khi lưu bản nháp');
      }
    }
  };

  // 5. Kiểm tra trước khi phát hành (Publish Pre-check)
  const handleStartPublish = () => {
    if (isReadOnly || !versionData) return;
    setGeneralError(null);
    setFieldErrors({});
    setServerCycleKeys([]);

    // Client-side validations
    const draftErrors = validateDraft(stages);
    if (draftErrors.length > 0) {
      const mapped: Record<string, string> = {};
      draftErrors.forEach((e) => {
        mapped[e.field] = e.message;
      });
      setFieldErrors(mapped);
      setGeneralError('Thông tin bản nháp chưa hợp lệ, vui lòng kiểm tra lại.');
      return;
    }

    const cycle = findCycle(stages);
    if (cycle) {
      setServerCycleKeys(cycle);
      setGeneralError(
        `Không thể phát hành: Phát hiện chu trình phụ thuộc giữa các tác vụ (${cycle.join(' -> ')})`
      );
      return;
    }

    const forwardDep = findForwardDependency(stages);
    if (forwardDep) {
      setGeneralError(
        `Không thể phát hành: Tác vụ '${forwardDep.task}' phụ thuộc vào tác vụ '${forwardDep.dependsOn}' ở giai đoạn sau`
      );
      return;
    }

    // Nếu không có lỗi, mở modal xác nhận
    setIsPublishDialogOpen(true);
  };

  // Xác nhận phát hành
  const handleConfirmPublish = async () => {
    if (!versionData) return;
    setIsPublishDialogOpen(false);
    setGeneralError(null);
    setServerCycleKeys([]);

    try {
      await publishMutation.mutateAsync(versionData.id);
      setGeneralSuccess('Đã phát hành phiên bản quy trình thành công');
      refetchVersion();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === 'DEPENDENCY_CYCLE' && err.details && typeof err.details === 'object') {
          const cycleDetails = err.details as { cycle?: string[] };
          if (cycleDetails.cycle && Array.isArray(cycleDetails.cycle)) {
            setServerCycleKeys(cycleDetails.cycle);
          }
        }
        setGeneralError(err.message || 'Phát hiện chu trình phụ thuộc');
      } else {
        setGeneralError('Có lỗi xảy ra khi phát hành quy trình');
      }
    }
  };

  // 6. Đổi chế độ Khung cứng ↔ Linh hoạt
  const handleToggleModePrompt = () => {
    if (!isAdmin || !currentTemplate) return;
    const target = currentTemplate.mode === 'STRICT' ? 'FLEXIBLE' : 'STRICT';
    setPendingMode(target);
    setIsModeDialogOpen(true);
  };

  const handleConfirmChangeMode = async () => {
    if (!currentTemplate || !pendingMode) return;
    setIsModeDialogOpen(false);
    try {
      await updateTemplateMutation.mutateAsync({
        id: currentTemplate.id,
        data: { mode: pendingMode },
      });
      setGeneralSuccess(`Đã chuyển chế độ sang ${pendingMode === 'STRICT' ? 'Khung cứng' : 'Linh hoạt'}`);
      setTimeout(() => setGeneralSuccess(null), 3000);
    } catch {
      setGeneralError('Không thể cập nhật chế độ quy trình');
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => router.push('/admin/workflows')}
            className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1 flex items-center gap-1"
          >
            ← Quay lại danh sách
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {currentTemplate?.name || 'Soạn thảo quy trình'}
            </h1>
            {currentTemplate && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-medium">
                {currentTemplate.mode === 'STRICT' ? 'Khung cứng' : 'Linh hoạt'}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center space-x-2">
          {/* Nút đổi chế độ */}
          {isAdmin && (
            <label htmlFor="mode-toggle-btn" className="flex items-center text-xs cursor-pointer">
              <span className="sr-only">Chế độ</span>
              <button
                id="mode-toggle-btn"
                type="button"
                onClick={handleToggleModePrompt}
                className="px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Đổi chế độ
              </button>
            </label>
          )}

          {/* Nếu ở bản phát hành chỉ đọc và là ADMIN: hiển thị nút Tạo phiên bản mới */}
          {!isDraft && isAdmin && (
            <button
              type="button"
              onClick={handleCreateNewVersion}
              disabled={createVersionMutation.isPending}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#002D54] hover:bg-[#002444] rounded-lg shadow-sm disabled:opacity-50"
            >
              Tạo phiên bản mới
            </button>
          )}

          {/* Nếu là DRAFT và ADMIN: hiển thị Lưu bản nháp & Phát hành */}
          {isDraft && !isReadOnly && (
            <>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={saveMutation.isPending}
                className="px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                {saveMutation.isPending ? 'Đang lưu...' : 'Lưu bản nháp'}
              </button>
              <button
                type="button"
                onClick={handleStartPublish}
                disabled={publishMutation.isPending}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-[#002D54] hover:bg-[#002444] rounded-lg shadow-sm disabled:opacity-50"
              >
                Phát hành
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex space-x-6 text-xs font-medium">
        <button
          type="button"
          onClick={() => setActiveTab('flow')}
          className={`pb-3 border-b-2 transition-colors ${
            activeTab === 'flow'
              ? 'border-[#002D54] text-[#002D54] dark:border-[#0082B4] dark:text-[#0082B4] font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Cấu trúc các giai đoạn & tác vụ
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('custom-fields')}
          className={`pb-3 border-b-2 transition-colors ${
            activeTab === 'custom-fields'
              ? 'border-[#002D54] text-[#002D54] dark:border-[#0082B4] dark:text-[#0082B4] font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Trường dữ liệu động
        </button>
      </div>

      {/* Thông báo trạng thái chỉ đọc nếu là bản phát hành */}
      {!isDraft && (
        <div className="p-3 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 flex items-center justify-between">
          <span>
            Bản phát hành chỉ đọc (Phiên bản {versionData?.version_no ?? 1}) - Không thể trực tiếp sửa đổi.
          </span>
          {isAdmin && (
            <span className="text-[11px] text-slate-500">
              Bấm &quot;Tạo phiên bản mới&quot; để mở bản soạn nháp.
            </span>
          )}
        </div>
      )}

      {generalSuccess && (
        <div className="p-3 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg">
          {generalSuccess}
        </div>
      )}

      {generalError && (
        <div className="p-3 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-lg">
          {generalError}
        </div>
      )}

      {/* Modal xác nhận phát hành */}
      {isPublishDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Xác nhận phát hành phiên bản quy trình
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Phiên bản này sẽ được kích hoạt áp dụng cho các hồ sơ vụ việc mới. Lưu ý rằng{' '}
              <strong className="text-amber-700 dark:text-amber-400">
                vụ việc đang chạy giữ phiên bản cũ
              </strong>
              .
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsPublishDialogOpen(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmPublish}
                disabled={publishMutation.isPending}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-[#002D54] hover:bg-[#002444] rounded-lg shadow-sm"
              >
                {publishMutation.isPending ? 'Đang phát hành...' : 'Xác nhận phát hành'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal xác nhận đổi chế độ */}
      {isModeDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Xác nhận thay đổi chế độ quản trị
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Bạn có chắc chắn muốn chuyển sang chế độ{' '}
              <strong>{pendingMode === 'STRICT' ? 'Khung cứng' : 'Linh hoạt'}</strong>?
              Thay đổi này{' '}
              <strong className="text-amber-700 dark:text-amber-400">
                chỉ áp cho vụ việc tạo sau lần phát hành kế tiếp
              </strong>
              .
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsModeDialogOpen(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmChangeMode}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-[#002D54] hover:bg-[#002444] rounded-lg shadow-sm"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Nội dung theo Tab */}
      {activeTab === 'custom-fields' ? (
        <CustomFieldsEditor
          matterTypeId={currentTemplate?.matter_type_id || 'mt-shtt-01'}
          readOnly={isReadOnly}
        />
      ) : isVersionLoading ? (
        <LoadingSkeleton lines={6} />
      ) : isVersionError ? (
        <ErrorState
          title="Có lỗi xảy ra"
          message="Vui lòng thử lại sau giây lát."
          onRetry={refetchVersion}
        />
      ) : (
        <div className="space-y-6">
          {/* Nút thêm giai đoạn */}
          {!isReadOnly && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleAddStage}
                className="px-3 py-1.5 text-xs font-semibold text-[#002D54] dark:text-[#0082B4] border border-[#002D54]/30 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs"
              >
                Thêm giai đoạn
              </button>
            </div>
          )}

          {stages.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl text-xs text-slate-500">
              Chưa có giai đoạn nào trong quy trình này. Bấm &quot;Thêm giai đoạn&quot; để bắt đầu.
            </div>
          ) : (
            stages.map((stage, sIdx) => {
              const stageKeyError = fieldErrors[`stages[${sIdx}].key`];
              const stageOrderError = fieldErrors[`stages[${sIdx}].order_index`];

              return (
                <div
                  key={stage.key}
                  className="border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4"
                >
                  {/* Stage Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center space-x-2 flex-1">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {stage.name || `Giai đoạn ${stage.order_index}`}
                      </span>
                      {!isReadOnly && (
                        <input
                          type="text"
                          aria-label="Tên giai đoạn"
                          value={stage.name}
                          onChange={(e) => handleUpdateStageName(sIdx, e.target.value)}
                          className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-[#002D54] flex-1 max-w-xs"
                        />
                      )}
                      <span className="text-[10px] text-slate-400 font-mono">({stage.key})</span>
                    </div>

                    <div className="flex items-center space-x-3">
                      <label className="flex items-center space-x-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={stage.requires_approval}
                          disabled={isReadOnly}
                          onChange={(e) => handleToggleStageApproval(sIdx, e.target.checked)}
                          className="rounded border-slate-300 text-[#002D54] focus:ring-[#002D54]"
                        />
                        <span>Yêu cầu phê duyệt giai đoạn</span>
                      </label>

                      {!isReadOnly && (
                        <div className="flex items-center space-x-1">
                          <button
                            type="button"
                            onClick={() => handleMoveStage(sIdx, sIdx - 1)}
                            disabled={sIdx === 0}
                            title="Lên"
                            aria-label="Move up"
                            className="p-1 text-xs text-slate-500 hover:text-slate-800 disabled:opacity-30"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveStage(sIdx, sIdx + 1)}
                            disabled={sIdx === stages.length - 1}
                            title="Xuống"
                            aria-label="Move down"
                            className="p-1 text-xs text-slate-500 hover:text-slate-800 disabled:opacity-30"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteStage(stage.key)}
                            className="p-1 text-xs text-red-500 hover:text-red-700 ml-2"
                          >
                            Xoá giai đoạn
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {stageKeyError && (
                    <div className="text-[11px] text-red-600">{stageKeyError}</div>
                  )}
                  {stageOrderError && (
                    <div className="text-[11px] text-red-600">{stageOrderError}</div>
                  )}

                  {/* Tasks trong Stage */}
                  <div className="space-y-3 pl-2 sm:pl-4">
                    {stage.tasks?.map((task, tIdx) => {
                      const prefix = `stages[${sIdx}].tasks[${tIdx}]`;
                      const taskKeyError = fieldErrors[`${prefix}.key`];
                      const taskSlaError = fieldErrors[`${prefix}.sla_business_days`];
                      const taskWeightError = fieldErrors[`${prefix}.complexity_weight`];
                      const taskDepError = fieldErrors[`${prefix}.depends_on`];
                      const taskMilestoneError = fieldErrors[`${prefix}.triggers_milestone_order`];

                      const isCycleTask = serverCycleKeys.includes(task.key);
                      const availableDeps = getAvailableDependencies(sIdx, task.key);

                      return (
                        <div
                          key={task.key}
                          data-cycle={isCycleTask ? 'true' : undefined}
                          className={`p-3.5 border rounded-xl transition-all space-y-3 ${
                            isCycleTask
                              ? 'border-red-500 bg-red-50 text-red-500'
                              : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="flex items-center space-x-2 flex-1">
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                {task.key}
                              </span>
                              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                                {task.title}
                              </span>
                              {!isReadOnly && (
                                <input
                                  type="text"
                                  value={task.title}
                                  aria-label="Tiêu đề task"
                                  placeholder="Tiêu đề task"
                                  onChange={(e) =>
                                    handleUpdateTaskField(sIdx, tIdx, 'title', e.target.value)
                                  }
                                  className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-[#002D54] flex-1 max-w-xs"
                                />
                              )}
                            </div>

                            {!isReadOnly && (
                              <button
                                type="button"
                                onClick={() => handleDeleteTask(sIdx, task.key)}
                                className="text-xs text-red-600 hover:text-red-700 self-end sm:self-auto"
                              >
                                Xoá task
                              </button>
                            )}
                          </div>

                          {/* Task Properties Grid */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                            {/* Role */}
                            <div>
                              <label
                                htmlFor={`task-role-${task.key}`}
                                className="block text-[11px] text-slate-500 mb-0.5"
                              >
                                Vai trò phụ trách
                              </label>
                              <select
                                id={`task-role-${task.key}`}
                                value={task.default_case_role}
                                disabled={isReadOnly}
                                onChange={(e) =>
                                  handleUpdateTaskField(
                                    sIdx,
                                    tIdx,
                                    'default_case_role',
                                    e.target.value
                                  )
                                }
                                className="w-full px-2 py-1 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-xs"
                              >
                                <option value="EXECUTOR">Người thực thi (EXECUTOR)</option>
                                <option value="CASE_MANAGER">Quản lý vụ việc (CASE_MANAGER)</option>
                                <option value="SUPERVISOR">Giám sát (SUPERVISOR)</option>
                              </select>
                            </div>

                            {/* SLA */}
                            <div>
                              <label
                                htmlFor={`task-sla-${task.key}`}
                                className="block text-[11px] text-slate-500 mb-0.5"
                              >
                                Thời hạn (ngày làm việc)
                              </label>
                              <input
                                id={`task-sla-${task.key}`}
                                type="number"
                                min={1}
                                value={task.sla_business_days}
                                disabled={isReadOnly}
                                onChange={(e) =>
                                  handleUpdateTaskField(
                                    sIdx,
                                    tIdx,
                                    'sla_business_days',
                                    Number(e.target.value)
                                  )
                                }
                                className="w-full px-2 py-1 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-xs"
                              />
                              {taskSlaError && (
                                <div className="text-[10px] text-red-600 mt-0.5">{taskSlaError}</div>
                              )}
                            </div>

                            {/* Trọng số phức tạp */}
                            <div>
                              <label
                                htmlFor={`task-weight-${task.key}`}
                                className="block text-[11px] text-slate-500 mb-0.5"
                              >
                                Trọng số phức tạp (1-4)
                              </label>
                              <input
                                id={`task-weight-${task.key}`}
                                type="number"
                                min={1}
                                max={4}
                                value={task.complexity_weight}
                                disabled={isReadOnly}
                                onChange={(e) =>
                                  handleUpdateTaskField(
                                    sIdx,
                                    tIdx,
                                    'complexity_weight',
                                    Number(e.target.value)
                                  )
                                }
                                className="w-full px-2 py-1 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-xs"
                              />
                              {taskWeightError && (
                                <div className="text-[10px] text-red-600 mt-0.5">
                                  {taskWeightError}
                                </div>
                              )}
                            </div>

                            {/* Đợt kích hoạt milestone */}
                            <div>
                              <label
                                htmlFor={`task-milestone-${task.key}`}
                                className="block text-[11px] text-slate-500 mb-0.5"
                              >
                                Kích hoạt đợt thu (thứ tự)
                              </label>
                              <input
                                id={`task-milestone-${task.key}`}
                                type="number"
                                placeholder="Để trống nếu không"
                                value={task.triggers_milestone_order ?? ''}
                                disabled={isReadOnly}
                                onChange={(e) => {
                                  const val = e.target.value.trim();
                                  handleUpdateTaskField(
                                    sIdx,
                                    tIdx,
                                    'triggers_milestone_order',
                                    val === '' ? null : Number(val)
                                  );
                                }}
                                className="w-full px-2 py-1 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-xs"
                              />
                              {taskMilestoneError && (
                                <div className="text-[10px] text-red-600 mt-0.5">
                                  {taskMilestoneError}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Phụ thuộc & Duyệt */}
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1 text-xs">
                            <div className="flex items-center space-x-2 flex-1">
                              <label
                                htmlFor={`task-depends-${task.key}`}
                                className="text-[11px] text-slate-500 shrink-0"
                              >
                                Phụ thuộc:
                              </label>
                              <select
                                id={`task-depends-${task.key}`}
                                disabled={isReadOnly}
                                value={task.depends_on?.[0] || ''}
                                onChange={(e) => {
                                  const selectedVal = e.target.value;
                                  handleUpdateTaskField(
                                    sIdx,
                                    tIdx,
                                    'depends_on',
                                    selectedVal ? [selectedVal] : []
                                  );
                                }}
                                className="px-2 py-1 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-xs max-w-xs"
                              >
                                <option value="">Không phụ thuộc</option>
                                {availableDeps.map((dep) => (
                                  <option key={dep.key} value={dep.key}>
                                    Tác vụ {dep.key}
                                  </option>
                                ))}
                              </select>
                              {taskDepError && (
                                <span className="text-[10px] text-red-600">{taskDepError}</span>
                              )}
                            </div>

                            <label className="flex items-center space-x-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={task.requires_approval}
                                disabled={isReadOnly}
                                onChange={(e) =>
                                  handleUpdateTaskField(
                                    sIdx,
                                    tIdx,
                                    'requires_approval',
                                    e.target.checked
                                  )
                                }
                                className="rounded border-slate-300 text-[#002D54] focus:ring-[#002D54]"
                              />
                              <span className="text-slate-600 dark:text-slate-400">
                                Duyệt kết quả task
                              </span>
                            </label>
                          </div>

                          {taskKeyError && (
                            <div className="text-[10px] text-red-600">{taskKeyError}</div>
                          )}
                        </div>
                      );
                    })}

                    {/* Nút thêm Task */}
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => handleAddTask(sIdx)}
                        className="w-full py-2 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        + Thêm tác vụ
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
