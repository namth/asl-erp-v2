'use client';

import React, { useState } from 'react';
import { useDepartments, useCreateDepartment, useSetDepartmentLeaders, useUsers } from '@/hooks/use-admin';
import { useMe } from '@/hooks/use-auth';
import { Department } from '@/types/admin';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';

export default function DepartmentsPage() {
  const { data: currentUser } = useMe();
  const isAdmin = currentUser?.system_role === 'ADMIN';
  const isManager = currentUser?.system_role === 'MANAGER';
  const hasAccess = isAdmin || isManager;

  const {
    data: departments,
    isLoading,
    isError,
    error,
    refetch,
  } = useDepartments();

  // Load all users to pick managers as candidates
  const { data: usersData } = useUsers({ page: 1, limit: 100 });

  const createDepartmentMutation = useCreateDepartment();

  // Create department modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deptCode, setDeptCode] = useState('');
  const [deptName, setDeptName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  // Assign leaders modal state
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [selectedLeaderIds, setSelectedLeaderIds] = useState<string[]>([]);
  const [assignError, setAssignError] = useState<string | null>(null);

  const setLeadersMutation = useSetDepartmentLeaders(selectedDept?.id || '');

  if (!hasAccess && currentUser) {
    return (
      <div className="p-8">
        <ErrorState
          title="Không có quyền truy cập"
          message="Vui lòng liên hệ Quản trị viên để được hỗ trợ."
        />
      </div>
    );
  }

  // Filter candidates: strictly active managers only
  const managerCandidates =
    usersData?.data?.filter((u) => u.system_role === 'MANAGER' && u.is_active) || [];

  const handleOpenCreate = () => {
    setDeptCode('');
    setDeptName('');
    setCreateError(null);
    setIsCreateOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    try {
      await createDepartmentMutation.mutateAsync({
        code: deptCode.trim(),
        name: deptName.trim(),
      });
      setIsCreateOpen(false);
      setDeptCode('');
      setDeptName('');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setCreateError(err.message);
      } else {
        setCreateError('Có lỗi xảy ra khi tạo phòng ban');
      }
    }
  };

  const handleOpenAssignLeaders = (dept: Department) => {
    setSelectedDept(dept);
    const currentLeaderIds = dept.leaders?.map((l) => l.id) || [];
    setSelectedLeaderIds(currentLeaderIds);
    setAssignError(null);
  };

  const handleToggleLeader = (userId: string) => {
    setSelectedLeaderIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSaveLeaders = async () => {
    if (!selectedDept) return;
    setAssignError(null);
    try {
      await setLeadersMutation.mutateAsync({
        leader_user_ids: selectedLeaderIds,
      });
      setSelectedDept(null);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setAssignError(err.message);
      } else {
        setAssignError('Có lỗi xảy ra khi cập nhật Trưởng phòng');
      }
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Quản trị Phòng Ban
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Quản lý cơ cấu phòng ban và phân công Trưởng phòng điều hành
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition shadow-sm"
          >
            Thêm phòng ban
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
          <LoadingSkeleton lines={6} />
        </div>
      ) : isError ? (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
          <ErrorState
            title="Đã xảy ra sự cố"
            message={error instanceof Error ? error.message : 'Có lỗi khi kết nối'}
            onRetry={refetch}
          />
        </div>
      ) : !departments || departments.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
          <EmptyState
            title="Chưa có phòng ban"
            description="Hệ thống chưa có bản ghi nào được thiết lập."
          />
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4">Mã</th>
                  <th className="px-6 py-4">Tên phòng ban</th>
                  <th className="px-6 py-4">Trưởng phòng</th>
                  {isAdmin && <th className="px-6 py-4 text-right">Thao tác</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {departments.map((dept) => (
                  <tr
                    key={dept.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-6 py-4 font-mono font-bold text-slate-700 dark:text-slate-300">
                      {dept.code}
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-100">
                      {dept.name}
                    </td>
                    <td className="px-6 py-4">
                      {dept.leaders && dept.leaders.length > 0 ? (
                        <div className="space-y-1">
                          {dept.leaders.map((leader) => (
                            <span
                              key={leader.id}
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 mr-1.5"
                            >
                              {leader.full_name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Chưa có Trưởng phòng</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenAssignLeaders(dept)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          Chỉ định Trưởng phòng
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Tạo Phòng Ban */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">
              Thêm phòng ban mới
            </h2>

            {createError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-xs">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="dept-code"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Mã phòng ban
                </label>
                <input
                  id="dept-code"
                  type="text"
                  required
                  value={deptCode}
                  onChange={(e) => setDeptCode(e.target.value.toUpperCase())}
                  placeholder="VD: SHTT"
                  className="w-full px-3 py-2 text-sm uppercase rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label
                  htmlFor="dept-name"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Tên phòng ban
                </label>
                <input
                  id="dept-name"
                  type="text"
                  required
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="VD: Ban Sở Hữu Trí Tuệ"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={createDepartmentMutation.isPending}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50"
                >
                  {createDepartmentMutation.isPending ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Chỉ Định Trưởng Phòng */}
      {selectedDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
              Phân công Trưởng phòng: {selectedDept.name}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Chỉ những nhân sự có vai trò Quản lý (MANAGER) và đang hoạt động mới có thể được chỉ định.
            </p>

            {assignError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-xs">
                {assignError}
              </div>
            )}

            <div className="max-h-60 overflow-y-auto space-y-2 border border-slate-200 dark:border-slate-700 rounded-xl p-3 mb-4 bg-slate-50 dark:bg-slate-800/40">
              {managerCandidates.length === 0 ? (
                <p className="text-xs text-slate-500 italic p-2">
                  Không có nhân sự Quản lý nào đang hoạt động trên hệ thống.
                </p>
              ) : (
                managerCandidates.map((candidate) => {
                  const isChecked = selectedLeaderIds.includes(candidate.id);
                  const inputId = `candidate-${candidate.id}`;

                  return (
                    <div
                      key={candidate.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      <input
                        id={inputId}
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleLeader(candidate.id)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <label
                        htmlFor={inputId}
                        className="text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer flex-1"
                      >
                        {candidate.full_name}
                      </label>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedDept(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={handleSaveLeaders}
                disabled={setLeadersMutation.isPending}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50"
              >
                {setLeadersMutation.isPending ? 'Đang lưu...' : 'Lưu Trưởng phòng'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
