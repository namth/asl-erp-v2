'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useUser, useUpdateUser, useDepartments, useDeactivateUser, useActivateUser, useResetTwoFactor } from '@/hooks/use-admin';
import { useMe } from '@/hooks/use-auth';
import { SystemRole } from '@/types/admin';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ui/error-state';

export default function UserDetailPage() {
  const params = useParams();
  const userId = (params?.id as string) || '';

  const { data: currentUser } = useMe();
  const isAdmin = currentUser?.system_role === 'ADMIN';
  const isManager = currentUser?.system_role === 'MANAGER';
  const hasAccess = isAdmin || isManager;

  const {
    data: user,
    isLoading,
    isError,
    error,
    refetch,
  } = useUser(userId);

  const { data: departments } = useDepartments();

  const updateUserMutation = useUpdateUser(userId);
  const deactivateMutation = useDeactivateUser(userId);
  const activateMutation = useActivateUser(userId);
  const reset2FaMutation = useResetTwoFactor(userId);

  // Form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [systemRole, setSystemRole] = useState<SystemRole>('ATTORNEY');
  const [departmentId, setDepartmentId] = useState('');
  const [isExecutive, setIsExecutive] = useState(false);

  // Logout warning modal state
  const [isLogoutWarningOpen, setIsLogoutWarningOpen] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Deactivate modal state
  const [isDeactivateOpen, setIsDeactivateOpen] = useState(false);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  // Reset 2FA modal state
  const [isReset2FaOpen, setIsReset2FaOpen] = useState(false);
  const [reset2FaReason, setReset2FaReason] = useState('');
  const [reset2FaError, setReset2FaError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || '');
      setEmail(user.email || '');
      setTitle(user.title || '');
      setPhoneNumber(user.phone_number || '');
      setSystemRole(user.system_role);
      setDepartmentId(user.department_id || '');
      setIsExecutive(!!user.is_executive);
    }
  }, [user]);

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

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
          <LoadingSkeleton lines={8} />
        </div>
      </div>
    );
  }

  if (isError || !user) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
          <ErrorState
            title="Lỗi kết nối"
            message={error instanceof Error ? error.message : 'Dữ liệu không tồn tại'}
            onRetry={refetch}
          />
        </div>
      </div>
    );
  }

  const isSelf = currentUser?.id === user.id;

  const handleRoleChange = (newRole: SystemRole) => {
    setSystemRole(newRole);
    if (newRole !== 'MANAGER') {
      setIsExecutive(false);
    }
  };

  const handleSaveClick = (e: React.FormEvent) => {
    e.preventDefault();
    setUpdateError(null);
    setUpdateSuccess(false);

    const roleChanged = systemRole !== user.system_role;
    const currentDept = user.department_id || '';
    const deptChanged = departmentId !== currentDept;

    if (roleChanged || deptChanged) {
      setIsLogoutWarningOpen(true);
      return;
    }

    executeSave();
  };

  const executeSave = async () => {
    try {
      await updateUserMutation.mutateAsync({
        full_name: fullName.trim(),
        title: title.trim() || undefined,
        phone_number: phoneNumber.trim() || undefined,
        system_role: isSelf ? user.system_role : systemRole,
        department_id: departmentId || null,
        is_executive: systemRole === 'MANAGER' ? isExecutive : false,
      });
      setIsLogoutWarningOpen(false);
      setUpdateSuccess(true);
      setTimeout(() => setUpdateSuccess(false), 3000);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setUpdateError(err.message);
      } else {
        setUpdateError('Có lỗi xảy ra khi cập nhật thông tin');
      }
    }
  };

  const handleConfirmDeactivate = async () => {
    if (deactivateReason.trim().length < 10) {
      setDeactivateError('Lý do phải có tối thiểu 10 ký tự');
      return;
    }
    try {
      await deactivateMutation.mutateAsync({ reason: deactivateReason.trim() });
      setIsDeactivateOpen(false);
      setDeactivateReason('');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setDeactivateError(err.message);
      } else {
        setDeactivateError('Có lỗi xảy ra khi khoá tài khoản');
      }
    }
  };

  const handleConfirmReset2Fa = async () => {
    if (reset2FaReason.trim().length < 10) {
      setReset2FaError('Lý do phải có tối thiểu 10 ký tự');
      return;
    }
    try {
      await reset2FaMutation.mutateAsync({ reason: reset2FaReason.trim() });
      setIsReset2FaOpen(false);
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
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/admin/users"
              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
            >
              ← Quay lại danh sách
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {user.full_name}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Chi tiết hồ sơ nhân sự và phân quyền tài khoản
          </p>
        </div>

        {isAdmin && !isSelf && (
          <div className="flex items-center gap-2">
            {user.is_active ? (
              <button
                type="button"
                onClick={() => {
                  setDeactivateReason('');
                  setDeactivateError(null);
                  setIsDeactivateOpen(true);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/40 rounded-xl transition"
              >
                Khoá tài khoản
              </button>
            ) : (
              <button
                type="button"
                onClick={() => activateMutation.mutateAsync()}
                className="px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/40 rounded-xl transition"
              >
                Mở khoá tài khoản
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setReset2FaReason('');
                setReset2FaError(null);
                setIsReset2FaOpen(true);
              }}
              className="px-3 py-1.5 text-xs font-semibold text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/40 rounded-xl transition"
            >
              Reset 2FA
            </button>
          </div>
        )}
      </div>

      {updateSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-xs">
          Cập nhật thông tin thành công!
        </div>
      )}

      {updateError && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-xs">
          {updateError}
        </div>
      )}

      {/* Main form */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <form onSubmit={handleSaveClick} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="user-fullname"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Họ và tên
              </label>
              <input
                id="user-fullname"
                type="text"
                disabled={!isAdmin}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="user-email"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Email công vụ
              </label>
              <input
                id="user-email"
                type="email"
                readOnly
                disabled
                value={email}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50 text-slate-500 cursor-not-allowed"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="user-title"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Chức danh
              </label>
              <input
                id="user-title"
                type="text"
                disabled={!isAdmin}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Luật sư thành viên"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="user-phone"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Số điện thoại
              </label>
              <input
                id="user-phone"
                type="text"
                disabled={!isAdmin}
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="VD: 0912345678"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="user-role"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Vai trò hệ thống
              </label>
              <select
                id="user-role"
                disabled={!isAdmin || isSelf}
                value={systemRole}
                onChange={(e) => handleRoleChange(e.target.value as SystemRole)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              >
                <option value="ATTORNEY">Luật sư</option>
                <option value="MANAGER">Quản lý</option>
                <option value="ACCOUNTANT">Kế toán</option>
                <option value="ADMIN">Quản trị viên</option>
              </select>
              {isSelf && (
                <p className="mt-1 text-xs text-slate-400">
                  Bạn không thể tự thay đổi vai trò của chính mình.
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="user-department"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Phòng ban
              </label>
              <select
                id="user-department"
                disabled={!isAdmin}
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              >
                <option value="">-- Chưa gán phòng ban --</option>
                {departments?.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              id="user-executive"
              type="checkbox"
              disabled={!isAdmin || systemRole !== 'MANAGER'}
              checked={isExecutive}
              onChange={(e) => setIsExecutive(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40"
            />
            <label
              htmlFor="user-executive"
              className={`text-xs font-medium ${
                !isAdmin || systemRole !== 'MANAGER'
                  ? 'text-slate-400'
                  : 'text-slate-700 dark:text-slate-300 cursor-pointer'
              }`}
            >
              Chức danh Giám đốc (chỉ áp dụng cho Quản lý)
            </label>
          </div>

          {isAdmin && (
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="submit"
                disabled={updateUserMutation.isPending}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm disabled:opacity-50"
              >
                {updateUserMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Modal Cảnh Báo Đăng Xuất (Logout Warning Modal) */}
      {isLogoutWarningOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-bold text-amber-600 dark:text-amber-400 mb-2">
              Xác nhận thay đổi vai trò hoặc phòng ban
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
              Lưu ý: Thay đổi vai trò hoặc phòng ban sẽ khiến người này sẽ bị đăng xuất khỏi mọi phiên làm việc hiện tại nhằm đảm bảo an toàn phân quyền.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsLogoutWarningOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={executeSave}
                disabled={updateUserMutation.isPending}
                className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl disabled:opacity-50"
              >
                {updateUserMutation.isPending ? 'Đang lưu...' : 'Xác nhận lưu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Xác Nhận Khoá Tài Khoản */}
      {isDeactivateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">
              Xác nhận khoá tài khoản
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
              Bạn đang yêu cầu khoá tài khoản của{' '}
              <span className="font-semibold">{user.full_name}</span>.
            </p>

            {deactivateError && (
              <div className="mb-3 p-2 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-xs">
                {deactivateError}
              </div>
            )}

            <div className="space-y-2 mb-4">
              <label htmlFor="user-deactivate-reason" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Lý do thực hiện
              </label>
              <textarea
                id="user-deactivate-reason"
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
                onClick={() => setIsDeactivateOpen(false)}
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
                {deactivateMutation.isPending ? 'Đang xử lý...' : 'Xác nhận khoá'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Xác Nhận Reset 2FA */}
      {isReset2FaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-bold text-amber-600 dark:text-amber-400 mb-2">
              Xác nhận reset 2FA
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
              Đặt lại xác thực hai yếu tố (2FA) cho{' '}
              <span className="font-semibold">{user.full_name}</span>.
            </p>

            {reset2FaError && (
              <div className="mb-3 p-2 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-xs">
                {reset2FaError}
              </div>
            )}

            <div className="space-y-2 mb-4">
              <label htmlFor="user-reset2fa-reason" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Lý do thực hiện
              </label>
              <textarea
                id="user-reset2fa-reason"
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
                onClick={() => setIsReset2FaOpen(false)}
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
                {reset2FaMutation.isPending ? 'Đang xử lý...' : 'Xác nhận reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
