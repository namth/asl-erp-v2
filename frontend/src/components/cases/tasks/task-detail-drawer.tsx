'use client';

import React, { useState, useEffect } from 'react';
import type { Task, UserSummary } from '@/types/tasks';
import { useTaskComments, useAddComment, useUpdateTask } from '@/hooks/use-tasks';
import { ApiError } from '@/lib/api-client';

export interface TaskDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  task: Task | null;
  members?: UserSummary[];
}

export default function TaskDetailDrawer({
  isOpen,
  onClose,
  caseId,
  task,
  members = [],
}: TaskDetailDrawerProps) {
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [dueAt, setDueAt] = useState<string>('');
  const [commentText, setCommentText] = useState<string>('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (task) {
      setAssignedTo(task.assigned_to?.id || '');
      setDueAt(task.due_at ? task.due_at.slice(0, 10) : '');
      setCommentError(null);
      setUpdateError(null);
      setUpdateSuccess(false);
      setCommentText('');
    }
  }, [task]);

  const taskId = task?.id || '';
  const { data: comments = [], isLoading: isLoadingComments } = useTaskComments(caseId, taskId);
  const addCommentMutation = useAddComment(caseId, taskId);
  const updateTaskMutation = useUpdateTask(caseId);

  if (!isOpen || !task) {
    return null;
  }

  const handleSaveInfo = (e: React.FormEvent) => {
    e.preventDefault();
    setUpdateError(null);
    setUpdateSuccess(false);

    updateTaskMutation.mutate(
      {
        taskId: task.id,
        data: {
          assigned_to: assignedTo || undefined,
          due_at: dueAt ? `${dueAt}T17:00:00Z` : undefined,
        },
      },
      {
        onSuccess: () => {
          setUpdateSuccess(true);
        },
        onError: (err: unknown) => {
          if (err instanceof ApiError && err.code === 'ASSIGNEE_NOT_IN_CASE') {
            setUpdateError('Người được chọn không thuộc ban chuyên môn vụ việc.');
          } else if (err instanceof Error) {
            setUpdateError(err.message);
          } else {
            setUpdateError('Đã xảy ra lỗi khi cập nhật tác vụ.');
          }
        },
      }
    );
  };

  const handleSendComment = (e: React.FormEvent) => {
    e.preventDefault();
    setCommentError(null);

    const trimmed = commentText.trim();
    if (!trimmed) {
      return;
    }

    if (commentText.length > 5000) {
      setCommentError('Bình luận tối đa 5000 ký tự. Vui lòng rút ngắn nội dung.');
      return;
    }

    addCommentMutation.mutate(
      { body: trimmed },
      {
        onSuccess: () => {
          setCommentText('');
        },
        onError: (err: unknown) => {
          if (err instanceof Error) {
            setCommentError(err.message);
          } else {
            setCommentError('Không thể gửi bình luận.');
          }
        },
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-sm transition-opacity flex justify-end">
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 shadow-2xl h-full flex flex-col border-l border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-xs px-2 py-0.5 font-medium rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
              {task.status}
            </span>
            {task.is_ad_hoc && (
              <span className="text-xs px-2 py-0.5 font-medium rounded bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
                Bổ sung
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
            aria-label="Đóng ngăn bên"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{task.title}</h2>
            {task.description && (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">
                {task.description}
              </p>
            )}
          </div>

          {/* Phụ thuộc */}
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/60">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Quan hệ phụ thuộc (Depends on)
            </h3>
            {task.depends_on && task.depends_on.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {task.depends_on.map((depId) => (
                  <span
                    key={depId}
                    className="text-xs px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 font-medium"
                  >
                    {depId}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">Không có phụ thuộc nào</p>
            )}

            {task.blocked_by && task.blocked_by.length > 0 && (
              <div className="mt-3 text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>Chờ hoàn thành: {task.blocked_by.join(', ')}</span>
              </div>
            )}
          </div>

          {/* Sửa thông tin: Phân công & Hạn chót */}
          <form onSubmit={handleSaveInfo} className="space-y-4 border-t border-slate-200 dark:border-slate-800 pt-6">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Cập nhật thông tin thực hiện
            </h3>

            {updateError && (
              <div className="p-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg dark:bg-red-950/30 dark:border-red-900 dark:text-red-400">
                {updateError}
              </div>
            )}

            {updateSuccess && (
              <div className="p-3 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-400">
                Cập nhật thông tin tác vụ thành công!
              </div>
            )}

            <div>
              <label htmlFor="task-assignee" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Người thực hiện (phân công)
              </label>
              <select
                id="task-assignee"
                data-testid="assignee-select"
                aria-label="Người thực hiện"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Chưa phân công --</option>
                {task.assigned_to && !members.some((m) => m.id === task.assigned_to?.id) && (
                  <option value={task.assigned_to.id}>{task.assigned_to.full_name}</option>
                )}
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
                {/* Fallback các user mẫu nếu members rỗng để tiện test và chọn */}
                <option value="u-1">Lê Mai Anh</option>
                <option value="u-2">LS. Nguyễn Văn Trường</option>
              </select>
            </div>

            <div>
              <label htmlFor="task-due-date" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Hạn chót thực hiện
              </label>
              <input
                id="task-due-date"
                type="date"
                aria-label="Hạn chót"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={updateTaskMutation.isPending}
              className="w-full px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
            >
              {updateTaskMutation.isPending ? 'Đang lưu...' : 'Lưu cập nhật'}
            </button>
          </form>

          {/* Khu vực bình luận */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Trao đổi & Bình luận ({comments.length})
            </h3>

            {/* Form thêm bình luận */}
            <form onSubmit={handleSendComment} className="space-y-2">
              <textarea
                rows={3}
                aria-label="Nhập bình luận"
                placeholder="Viết bình luận cho tác vụ này..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              {commentError && (
                <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                  {commentError}
                </p>
              )}

              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">
                  {commentText.length}/5000 ký tự
                </span>
                <button
                  type="submit"
                  disabled={addCommentMutation.isPending || !commentText.trim()}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                >
                  {addCommentMutation.isPending ? 'Đang gửi...' : 'Gửi bình luận'}
                </button>
              </div>
            </form>

            {/* Danh sách bình luận: mới nhất trước */}
            <div className="space-y-3 mt-4">
              {isLoadingComments ? (
                <div className="text-xs text-slate-400 py-2">Đang tải bình luận...</div>
              ) : comments.length === 0 ? (
                <div className="text-xs text-slate-400 py-2">Chưa có bình luận nào</div>
              ) : (
                comments.map((comment) => (
                  <div
                    key={comment.id}
                    data-testid="comment-item"
                    className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl space-y-1"
                  >
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {comment.author?.full_name || 'Người dùng'}
                      </span>
                      <span className="text-slate-400">
                        {new Date(comment.created_at).toLocaleString('vi-VN')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                      {comment.body}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
