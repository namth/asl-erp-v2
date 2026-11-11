'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';

interface AuthErrorDetails {
  retry_after_seconds?: number;
  challenge_id?: string;
  reset_token?: string;
}

export default function LoginPage() {
  const router = useRouter();

  const [step, setStep] = useState<'login' | 'totp' | 'password_reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);

  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setPasswordError(null);
    setGeneralError(null);
    setInfoMessage(null);

    let hasError = false;
    if (!email.trim() || !email.endsWith('@asllaw.vn')) {
      setEmailError('Email phải có đuôi @asllaw.vn');
      hasError = true;
    }

    if (!password.trim()) {
      setPasswordError('Vui lòng nhập mật khẩu');
      hasError = true;
    }

    if (hasError) {
      return;
    }

    setIsLoading(true);
    try {
      await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      router.push('/');
    } catch (err) {
      if (err instanceof ApiError) {
        const details = (err.details || {}) as AuthErrorDetails;
        if (err.code === 'UNAUTHENTICATED') {
          setGeneralError('Email hoặc mật khẩu không đúng');
        } else if (err.code === 'ACCOUNT_LOCKED') {
          const retrySeconds = details.retry_after_seconds || 900;
          const retryMinutes = Math.ceil(retrySeconds / 60);
          setGeneralError(
            `Tài khoản bị khoá tạm thời. Vui lòng thử lại sau ${retryMinutes} phút.`
          );
        } else if (err.code === 'TOTP_REQUIRED') {
          setChallengeId(details.challenge_id || null);
          setStep('totp');
        } else if (err.code === 'TOTP_SETUP_REQUIRED') {
          setInfoMessage('Tài khoản cần thiết lập 2FA trước khi tiếp tục.');
        } else if (err.code === 'PASSWORD_RESET_REQUIRED') {
          setResetToken(details.reset_token || null);
          setStep('password_reset');
        } else {
          setGeneralError(err.message || 'Đăng nhập không thành công');
        }
      } else {
        setGeneralError('Không thể kết nối đến máy chủ xác thực');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    if (!totpCode.trim() || totpCode.trim().length < 6) {
      setGeneralError('Vui lòng nhập đủ 6 chữ số mã xác thực 2FA');
      return;
    }

    setIsLoading(true);
    try {
      await apiFetch('/auth/2fa/verify', {
        method: 'POST',
        body: JSON.stringify({
          challenge_id: challengeId,
          code: totpCode.trim(),
        }),
      });
      router.push('/');
    } catch (err) {
      if (err instanceof ApiError) {
        setGeneralError(err.message || 'Mã xác thực không hợp lệ');
      } else {
        setGeneralError('Lỗi xác thực mã 2FA');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    if (!newPassword.trim()) {
      setGeneralError('Vui lòng nhập mật khẩu mới');
      return;
    }

    setIsLoading(true);
    try {
      await apiFetch('/auth/password', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resetToken}`,
        },
        body: JSON.stringify({ password: newPassword }),
      });
      router.push('/');
    } catch (err) {
      if (err instanceof ApiError) {
        setGeneralError(err.message || 'Không thể đổi mật khẩu');
      } else {
        setGeneralError('Lỗi cập nhật mật khẩu mới');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#001D38] via-[#002D54] to-[#004D7A] flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-[#FF7A00]/10 blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-3xl p-8 border border-white/20 shadow-2xl space-y-6 relative z-10 text-slate-800 dark:text-slate-100">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-1">
            <h1 className="text-2xl font-black text-[#002D54] dark:text-cyan-400 tracking-wider">
              ASL LAW
            </h1>
          </div>
          <div className="text-base font-extrabold text-[#002D54] dark:text-slate-100 tracking-tight">
            HỆ THỐNG ERP PHÁP LÝ
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Cổng thông tin bảo mật dành riêng cho Luật sư & Nhân sự hãng luật
          </p>
        </div>

        {/* Thông báo chung */}
        {generalError && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-semibold leading-relaxed">
            {generalError}
          </div>
        )}
        {infoMessage && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 font-semibold leading-relaxed">
            {infoMessage}
          </div>
        )}

        {/* Step 1: Login Form */}
        {step === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4" noValidate>
            <div>
              <span className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                Email
              </span>
              <input
                id="email"
                type="email"
                aria-label="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="luatsu@asllaw.vn"
                disabled={isLoading}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#0082B4] focus:bg-white transition-all disabled:opacity-60"
              />
              {emailError && (
                <p className="mt-1 text-xs text-red-600 font-medium">{emailError}</p>
              )}
            </div>

            <div>
              <span className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                Khóa bảo mật
              </span>
              <input
                id="password"
                type="password"
                aria-label="Mật khẩu"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu"
                disabled={isLoading}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#0082B4] focus:bg-white transition-all disabled:opacity-60"
              />
              {passwordError && (
                <p className="mt-1 text-xs text-red-600 font-medium">{passwordError}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#002D54] to-[#0082B4] hover:from-[#002444] hover:to-[#00709c] text-white text-xs font-extrabold shadow-lg shadow-cyan-950/20 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <span>{isLoading ? 'Đang xác thực...' : 'Đăng nhập'}</span>
            </button>
          </form>
        )}

        {/* Step 2: TOTP 2FA Form */}
        {step === 'totp' && (
          <form onSubmit={handleTotpSubmit} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-blue-50/60 dark:bg-slate-800/60 border border-blue-200/60 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-extrabold text-[#002D54] dark:text-cyan-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Mã xác thực 2FA (TOTP)
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Authenticator</span>
              </div>
              <div>
                <input
                  id="totp"
                  type="text"
                  aria-label="Mã xác thực TOTP"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="6 chữ số"
                  disabled={isLoading}
                  autoFocus
                  className="w-full px-3 py-2 rounded-lg border border-blue-300 dark:border-slate-600 text-center font-mono font-black text-base text-[#002D54] dark:text-white tracking-widest focus:outline-none focus:border-[#0082B4] bg-white dark:bg-slate-900"
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                Nhập mã 6 chữ số từ ứng dụng xác thực của bạn để hoàn tất đăng nhập.
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#002D54] to-[#0082B4] hover:from-[#002444] hover:to-[#00709c] text-white text-xs font-extrabold shadow-lg shadow-cyan-950/20 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <span>{isLoading ? 'Đang kiểm tra...' : 'Xác thực'}</span>
            </button>
          </form>
        )}

        {/* Step 3: Password Reset Required Form */}
        {step === 'password_reset' && (
          <form onSubmit={handlePasswordResetSubmit} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-amber-50/60 dark:bg-slate-800/60 border border-amber-200/60 dark:border-slate-700 space-y-2">
              <span className="font-extrabold text-amber-800 dark:text-amber-400 text-xs">
                Yêu cầu đổi mật khẩu mới
              </span>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Để bảo vệ an toàn cho tài khoản, bạn cần thiết lập mật khẩu mới trước khi tiếp tục.
              </p>
              <div>
                <input
                  id="new-password"
                  type="password"
                  aria-label="Mật khẩu mới"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mật khẩu mới"
                  disabled={isLoading}
                  autoFocus
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#0082B4] transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#002D54] to-[#0082B4] hover:from-[#002444] hover:to-[#00709c] text-white text-xs font-extrabold shadow-lg shadow-cyan-950/20 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <span>{isLoading ? 'Đang cập nhật...' : 'Đổi mật khẩu'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
