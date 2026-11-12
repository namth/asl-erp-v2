'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useUsers, useDepartments, useCreateUser, useDeactivateUser, useResetTwoFactor } from '@/hooks/use-admin';
import { useMe } from '@/hooks/use-auth';
import { SystemRole, UserSummary } from '@/types/admin';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ApiError } from '@/lib/api-client';

const ROLE_LABELS: Record<SystemRole, string> = {
  ADMIN: 'Quản trị viên',
  MANAGER: 'Quản lý',
  ATTORNEY: 'Luật sư',
  ACCOUNTANT: 'Kế toán',
};

export default function UsersPage() {
  const { data: currentUser } = useMe();
  const isAdmin = currentUser?.system_role === 'ADMIN';
  const isManager = currentUser?.system_role === 'MANAGER';
  const hasAccess = isAdmin || isManager;

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [page, setPage] = useState<number>(1);

  // Queries
  const {
    data: usersData,
    isLoading,
    isError,
    error,
    refetch,
  } = useUsers({
    q: searchTerm || undefined,
    role: selectedRole || undefined,
    department_id: selectedDepartment || undefined,
    page,
    limit: 20,
  });

  const { data: departments } = useDepartments();

  // Mutations
  const createUserMutation = useCreateUser();

  // Create User Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRole, setFormRole] = useState<SystemRole>('ATTORNEY');
  const [formDepartment, setFormDepartment] = useState('');
  const [formIsExecutive, setFormIsExecutive] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [createGeneralError, setCreateGeneralError] = useState<string | null>(null);

  // Temporary password modal (transient state only)
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Deactivate Modal State
  const [deactivatingUser, setDeactivatingUser] = useState<UserSummary | null>(null);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [deactivateError, setDeactivateError] = useState<string | null>(null);
  const deactivateMutation = useDeactivateUser(deactivatingUser?.id || '');

  // Reset 2FA Modal State
  const [resettingUser, setResettingUser] = useState<UserSummary | null>(null);
  const [reset2FaReason, setReset2FaReason] = useState('');
  const [reset2FaError, setReset2FaError] = useState<string | null>(null);
  const reset2FaMutation = useResetTwoFactor(resettingUser?.id || '');

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
    setFormEmail('');
    setFormTitle('');
    setFormPhone('');
    setFormRole('ATTORNEY');
    setFormDepartment('');
    setFormIsExecutive(false);
    setEmailError(null);
    setCreateGeneralError(null);
    setIsCreateOpen(true);
  };

  const handleRoleChange = (role: SystemRole) => {
    setFormRole(role);
    if (role !== 'MANAGER') {
      setFormIsExecutive(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setCreateGeneralError(null);

    // Validate email
    const trimmedEmail = formEmail.trim();
    if (!trimmedEmail.endsWith('@asllaw.vn')) {
      setEmailError('Email công vụ bắt buộc phải có đuôi @asllaw.vn');
      return;
    }

    try {
      const res = await createUserMutation.mutateAsync({
        email: trimmedEmail,
        full_name: formName.trim(),
        title: formTitle.trim() || undefined,
        phone_number: formPhone.trim() || undefined,
        system_role: formRole,
        department_id: formDepartment || null,
        is_executive: formRole === 'MANAGER' ? formIsExecutive : false,
      });

      setIsCreateOpen(false);

      if (res.temporary_password) {
        setTemporaryPassword(res.temporary_password);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 409 || err.code === 'DUPLICATE_EMAIL') {
          setEmailError(err.message || 'Email này đã tồn tại trên hệ thống');
          return;
        }
        setCreateGeneralError(err.message);
      } else {
        setCreateGeneralError('Có lỗi xảy ra khi tạo người dùng');
      }
    }
  };

  const handleCopyPassword = () => {
    if (temporaryPassword) {
      navigator.clipboard?.writeText(temporaryPassword);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const handleClosePasswordModal = () => {
    setTemporaryPassword(null);
    setCopySuccess(false);
  };

  // Handle Deactivate Confirm
  const handleConfirmDeactivate = async () => {
    if (deactivateReason.trim().length < 10) {
      setDeactivateError('Lý do phải có tối thiểu 10 ký tự');
      return;
    }
    setDeactivateError(null);
    try {
      await deactivateMutation.mutateAsync({ reason: deactivateReason.trim() });
      setDeactivatingUser(null);
      setDeactivateReason('');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setDeactivateError(err.message);
      } else {
        setDeactivateError('Có lỗi xảy ra khi khoá tài khoản');
      }
    }
  };

  // Handle Reset 2FA Confirm
  const handleConfirmReset2Fa = async () => {
    if (reset2FaReason.trim().length < 10) {
      setReset2FaError('Lý do phải có tối thiểu 10 ký tự');
      return;
    }
    setReset2FaError(null);
    try {
      await reset2FaMutation.mutateAsync({ reason: reset2FaReason.trim() });
      setResettingUser(null);
      setReset2FaReason('');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setReset2FaError(err.message);
      } else {
        setReset2FaError('Có lỗi xảy ra khi đặt lại 2FA');
      }
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Quản trị Người dùng & Nhân sự
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Quản lý danh sách nhân sự, phân quyền vai trò và bảo mật tài khoản
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition shadow-sm"
          >
            Thêm người dùng
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div>
          <label htmlFor="search-input" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Tìm kiếm
          </label>
          <input
            id="search-input"
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm theo tên hoặc email..."
            className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="filter-role" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Phân loại tài khoản
          </label>
          <select
            id="filter-role"
            value={selectedRole}
            onChange={(e) => {
              setSelectedRole(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tất cả vai trò</option>
            <option value="ADMIN">Quản trị viên</option>
            <option value="MANAGER">Quản lý</option>
            <option value="ATTORNEY">Luật sư</option>
            <option value="ACCOUNTANT">Kế toán</option>
          </select>
        </div>

        <div>
          <label htmlFor="filter-department" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Phòng ban
          </label>
          <select
            id="filter-department"
            value={selectedDepartment}
            onChange={(e) => {
              setSelectedDepartment(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tất cả phòng ban</option>
            {departments?.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>
        </div>
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
            message={error instanceof Error ? error.message : 'Có lỗi xảy ra'}
            onRetry={refetch}
          />
        </div>
      ) : !usersData?.data || usersData.data.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
          <EmptyState
            title="Không tìm thấy nhân sự"
            description="Hiện tại không có bản ghi nào phù hợp với bộ lọc."
          />
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4">Nhân sự</th>
                  <th className="px-6 py-4">Chức danh / Ban</th>
                  <th className="px-6 py-4">Vai trò</th>
                  <th className="px-6 py-4">Trạng thái</th>
                  <th className="px-6 py-4">2FA</th>
                  {isAdmin && <th className="px-6 py-4 text-right">Thao tác</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {usersData.data.map((user) => {
                  const isSelf = currentUser?.id === user.id;

                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <Link
                          href={`/admin/users/${user.id}`}
                          className="font-semibold text-blue-600 dark:text-blue-400 hover:underline block"
                        >
                          {user.full_name}
                        </Link>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {user.email}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <div className="text-slate-900 dark:text-slate-100 font-medium">
                          {user.title || 'Chưa cập nhật'}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {user.department?.name || 'Chưa phân ban'}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                          {ROLE_LABELS[user.system_role] || user.system_role}
                          {user.is_executive && ' · Giám đốc'}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        {user.is_active ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                            Đang hoạt động
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                            Đã khoá
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        {user.totp_enabled ? (
                          <span className="inline-flex items-center text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            Bật
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-xs font-medium text-slate-400">
                            Tắt
                          </span>
                        )}
                      </td>

                      {isAdmin && (
                        <td className="px-6 py-4 text-right space-x-2">
                          {!isSelf ? (
                            <>
                              {user.is_active && (
                                <button
                                  type="button"
                                  data-action="deactivate"
                                  onClick={() => {
                                    setDeactivatingUser(user);
                                    setDeactivateReason('');
                                    setDeactivateError(null);
                                  }}
                                  className="text-xs font-medium text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                                >
                                  Khoá
                                </button>
                              )}
                              <button
                                type="button"
                                data-action="reset-2fa"
                                onClick={() => {
                                  setResettingUser(user);
                                  setReset2FaReason('');
                                  setReset2FaError(null);
                                }}
                                className="text-xs font-medium text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
                              >
                                Reset 2FA
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400 italic">Tài khoản của bạn</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {usersData.meta && usersData.meta.total_pages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500">
                Hiển thị {usersData.data.length} trên tổng số {usersData.meta.total_records} nhân sự
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                >
                  Trang trước
                </button>
                <span className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                  {page} / {usersData.meta.total_pages}
                </span>
                <button
                  type="button"
                  disabled={page >= usersData.meta.total_pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                >
                  Trang sau
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Tạo Người Dùng */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">
              Thêm người dùng mới
            </h2>

            {createGeneralError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-xs">
                {createGeneralError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="full_name"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Họ và tên
                </label>
                <input
                  id="full_name"
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Nhập họ và tên"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Email công vụ
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={formEmail}
                  onChange={(e) => {
                    setFormEmail(e.target.value);
                    setEmailError(null);
                  }}
                  placeholder="name@asllaw.vn"
                  className={`w-full px-3 py-2 text-sm rounded-xl border ${
                    emailError
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-slate-200 dark:border-slate-700 focus:ring-blue-500'
                  } bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2`}
                />
                {emailError && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{emailError}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="title"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Chức danh
                  </label>
                  <input
                    id="title"
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="VD: Luật sư thành viên"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="phone_number"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Số điện thoại
                  </label>
                  <input
                    id="phone_number"
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="VD: 0912345678"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="system_role"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Vai trò hệ thống
                  </label>
                  <select
                    id="system_role"
                    value={formRole}
                    onChange={(e) => handleRoleChange(e.target.value as SystemRole)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ATTORNEY">Luật sư</option>
                    <option value="MANAGER">Quản lý</option>
                    <option value="ACCOUNTANT">Kế toán</option>
                    <option value="ADMIN">Quản trị viên</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="department_id"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Phòng ban
                  </label>
                  <select
                    id="department_id"
                    value={formDepartment}
                    onChange={(e) => setFormDepartment(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Chưa gán phòng ban --</option>
                    {departments?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  id="is_executive"
                  type="checkbox"
                  disabled={formRole !== 'MANAGER'}
                  checked={formIsExecutive}
                  onChange={(e) => setFormIsExecutive(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40"
                />
                <label
                  htmlFor="is_executive"
                  className={`text-xs font-medium ${
                    formRole !== 'MANAGER'
                      ? 'text-slate-400'
                      : 'text-slate-700 dark:text-slate-300 cursor-pointer'
                  }`}
                >
                  Chức danh Giám đốc (chỉ áp dụng cho Quản lý)
                </label>
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
                  disabled={createUserMutation.isPending}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50"
                >
                  {createUserMutation.isPending ? 'Đang tạo...' : 'Lưu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Mật Khẩu Tạm Thời (Temporary Password Dialog) */}
      {temporaryPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
              Tài khoản đã tạo thành công
            </h2>
            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-4">
              Lưu ý: Mật khẩu này chỉ hiện một lần duy nhất. Hãy sao chép và chuyển cho người dùng.
            </p>

            <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-between mb-4 border border-slate-200 dark:border-slate-700">
              <span className="font-mono text-sm text-slate-900 dark:text-slate-100 font-bold select-all">
                {temporaryPassword}
              </span>
              <button
                type="button"
                onClick={handleCopyPassword}
                className="px-3 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                {copySuccess ? 'Đã sao chép' : 'Sao chép'}
              </button>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleClosePasswordModal}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Xác Nhận Khoá Tài Khoản */}
      {deactivatingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">
              Xác nhận khoá
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
              Bạn đang yêu cầu khoá tài khoản của{' '}
              <span className="font-semibold">{deactivatingUser.full_name}</span>. Mọi phiên đăng
              nhập của tài khoản này sẽ bị thu hồi ngay lập tức.
            </p>

            {deactivateError && (
              <div className="mb-3 p-2 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-xs">
                {deactivateError}
              </div>
            )}

            <div className="space-y-2 mb-4">
              <label htmlFor="deactivate-reason" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Lý do thực hiện
              </label>
              <textarea
                id="deactivate-reason"
                rows={3}
                value={deactivateReason}
                onChange={(e) => {
                  setDeactivateReason(e.target.value);
                  setDeactivateError(null);
                }}
                placeholder="Lý do khoá (nhập tối thiểu 10 ký tự)"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeactivatingUser(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={handleConfirmDeactivate}
                disabled={deactivateMutation.isPending}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50"
              >
                {deactivateMutation.isPending ? 'Đang xử lý...' : 'Đồng ý khoá'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Xác Nhận Reset 2FA */}
      {resettingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-bold text-amber-600 dark:text-amber-400 mb-2">
              Xác nhận reset 2FA
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
              Đặt lại xác thực hai yếu tố (2FA) cho{' '}
              <span className="font-semibold">{resettingUser.full_name}</span>. Người dùng sẽ phải
              thiết lập lại 2FA trong lần đăng nhập tới.
            </p>

            {reset2FaError && (
              <div className="mb-3 p-2 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-xs">
                {reset2FaError}
              </div>
            )}

            <div className="space-y-2 mb-4">
              <label htmlFor="reset2fa-reason" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Lý do thực hiện
              </label>
              <textarea
                id="reset2fa-reason"
                rows={3}
                value={reset2FaReason}
                onChange={(e) => {
                  setReset2FaReason(e.target.value);
                  setReset2FaError(null);
                }}
                placeholder="Lý do reset (nhập tối thiểu 10 ký tự)"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setResettingUser(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={handleConfirmReset2Fa}
                disabled={reset2FaMutation.isPending}
                className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl disabled:opacity-50"
              >
                {reset2FaMutation.isPending ? 'Đang xử lý...' : 'Đồng ý reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
