'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Lock, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useMe } from '@/hooks/use-auth';
import { useChangePassword } from '@/hooks/use-two-factor';
import { TwoFactorSetup } from '@/components/two-factor';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { ApiError } from '@/lib/api-client';

export default function SecurityPage() {
  const router = useRouter();
  const { data: user, isLoading } = useMe();
  const changePasswordMutation = useChangePassword();

  const [showSetup, setShowSetup] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6" data-testid="loading-skeleton">
        <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <LoadingSkeleton lines={5} />
        </div>
      </div>
    );
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword) {
      setPasswordError('Vui lòng nhập mật khẩu hiện tại');
      return;
    }

    if (newPassword.length < 10) {
      setPasswordError('Mật khẩu mới phải có độ dài tối thiểu 10 ký tự');
      return;
    }

    const hasUpper = /[A-Z]/.test(newPassword);
    const hasLower = /[a-z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);

    if (!hasUpper || !hasLower || !hasNumber || !hasSpecial) {
      setPasswordError(
        'Mật khẩu phải bao gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt'
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Mật khẩu xác nhận không khớp');
      return;
    }

    setIsChangingPassword(true);
    try {
      await changePasswordMutation.mutateAsync({
        current_password: currentPassword,
        new_password: newPassword,
      });

      setPasswordSuccess('Đã đổi mật khẩu thành công, vui lòng đăng nhập lại');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setTimeout(() => {
        router.push('/login');
      }, 500);
    } catch (err) {
      if (err instanceof ApiError) {
        setPasswordError(err.message || 'Không thể đổi mật khẩu');
      } else {
        setPasswordError('Lỗi cập nhật mật khẩu, vui lòng thử lại');
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  const is2FaEnabled = Boolean(user?.totp_enabled);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Tiêu đề trang */}
      <div>
        <h1 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
          Bảo mật tài khoản
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Quản lý cài đặt bảo mật, xác thực 2 lớp và mật khẩu đăng nhập hệ thống
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Thẻ Xác thực 2 lớp (2FA) */}
        <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-[#002D54] dark:text-cyan-400 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-800 dark:text-slate-100">
                    Xác thực 2 lớp (2FA)
                  </h2>
                  <span className="text-[11px] text-slate-400">TOTP Authenticator</span>
                </div>
              </div>
              <div>
                {is2FaEnabled ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Đang bật
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    Chưa kích hoạt
                  </span>
                )}
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Xác thực 2 lớp bổ sung một bước bảo mật khi đăng nhập bằng mã 6 số từ ứng dụng trên điện thoại di động của bạn.
            </p>

            {is2FaEnabled && (
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  Nếu bạn làm mất thiết bị hoặc mã khôi phục, vui lòng liên hệ{' '}
                  <span className="font-bold text-slate-800 dark:text-slate-100">Quản trị viên</span>{' '}
                  để được hỗ trợ đặt lại bảo mật tài khoản.
                </p>
              </div>
            )}

            {showSetup && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <TwoFactorSetup
                  onComplete={() => {
                    setShowSetup(false);
                    router.refresh();
                  }}
                  onCancel={() => setShowSetup(false)}
                />
              </div>
            )}
          </div>

          {!is2FaEnabled && !showSetup && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowSetup(true)}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#002D54] to-[#0082B4] hover:from-[#002444] hover:to-[#00709c] text-white text-xs font-extrabold shadow-md shadow-cyan-950/20 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Bật xác thực 2 lớp</span>
              </button>
            </div>
          )}
        </div>

        {/* Form Đổi mật khẩu */}
        <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100">
                Đổi mật khẩu
              </h2>
              <span className="text-[11px] text-slate-400">Cập nhật mật khẩu tài khoản</span>
            </div>
          </div>

          {passwordError && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{passwordError}</span>
            </div>
          )}

          {passwordSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{passwordSuccess}</span>
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="current-password"
                className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1"
              >
                Mật khẩu hiện tại
              </label>
              <input
                id="current-password"
                type="password"
                aria-label="Mật khẩu hiện tại"
                placeholder="Nhập mật khẩu hiện tại"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={isChangingPassword}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#0082B4] focus:bg-white transition-all disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="new-password"
                className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1"
              >
                Mật khẩu mới
              </label>
              <input
                id="new-password"
                type="password"
                aria-label="Mật khẩu mới"
                placeholder="Nhập mật khẩu mới"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={isChangingPassword}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#0082B4] focus:bg-white transition-all disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1"
              >
                Xác nhận mật khẩu mới
              </label>
              <input
                id="confirm-password"
                type="password"
                aria-label="Xác nhận mật khẩu"
                placeholder="Xác nhận lại mật khẩu mới"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isChangingPassword}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#0082B4] focus:bg-white transition-all disabled:opacity-60"
              />
            </div>

            <button
              type="submit"
              disabled={isChangingPassword}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#002D54] to-[#0082B4] hover:from-[#002444] hover:to-[#00709c] text-white text-xs font-extrabold shadow-md shadow-cyan-950/20 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>{isChangingPassword ? 'Đang cập nhật...' : 'Đổi mật khẩu'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
