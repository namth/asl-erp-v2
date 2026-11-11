'use client';

import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Download, CheckCircle2, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';
import { useSetupTwoFactor, useEnableTwoFactor } from '@/hooks/use-two-factor';
import { ApiError } from '@/lib/api-client';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';

export interface TwoFactorSetupProps {
  setupToken?: string;
  onComplete?: () => void;
  onSuccess?: () => void;
  onCancel?: () => void;
  className?: string;
}

export function TwoFactorSetup({
  setupToken,
  onComplete,
  onSuccess,
  onCancel,
  className = '',
}: TwoFactorSetupProps) {
  const [step, setStep] = useState<'scan' | 'verify' | 'recovery' | 'completed'>('scan');
  const [secret, setSecret] = useState('');
  const [otpauthUri, setOtpauthUri] = useState('');
  const [code, setCode] = useState('');
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [hasSaved, setHasSaved] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  const authOptions = setupToken ? { setupToken } : undefined;
  const setupMutation = useSetupTwoFactor(authOptions);
  const enableMutation = useEnableTwoFactor(authOptions);

  useEffect(() => {
    let isMounted = true;
    setupMutation.mutateAsync().then(
      (data) => {
        if (isMounted) {
          setSecret(data.secret || '');
          setOtpauthUri(data.otpauth_uri || '');
        }
      },
      () => {
        // Lỗi gọi setup xử lý qua setupMutation.isError
      }
    );
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupToken]);

  const handleCopySecret = () => {
    if (!secret) return;
    try {
      navigator.clipboard?.writeText(secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      // Bỏ qua lỗi sao chép
    }
  };

  const handleCodeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(val);
    setVerifyError(null);

    if (val.length === 6) {
      setIsVerifying(true);
      try {
        const res = await enableMutation.mutateAsync({ code: val });
        setRecoveryCodes(res.recovery_codes || []);
        setStep('recovery');
      } catch (err) {
        if (err instanceof ApiError) {
          setVerifyError(err.message || 'Mã xác thực không chính xác hoặc đã hết hạn');
        } else {
          setVerifyError('Mã xác thực không chính xác hoặc đã hết hạn');
        }
      } finally {
        setIsVerifying(false);
      }
    }
  };

  const handleCopyAll = () => {
    if (recoveryCodes.length === 0) return;
    setHasSaved(true);
    setCopiedAll(true);
    try {
      navigator.clipboard?.writeText(recoveryCodes.join('\n'));
    } catch {
      // Bỏ qua lỗi sao chép
    }
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const handleDownloadTxt = () => {
    if (recoveryCodes.length === 0) return;
    try {
      const blob = new Blob([recoveryCodes.join('\n')], { type: 'text/plain;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'asllaw-recovery-codes.txt';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      // Xử lý môi trường không hỗ trợ tải blob
    }
    setHasSaved(true);
  };

  const handleFinish = () => {
    setSecret('');
    setOtpauthUri('');
    setRecoveryCodes([]);
    setStep('completed');
    if (onComplete) {
      onComplete();
    }
    if (onSuccess) {
      onSuccess();
    }
  };

  const formattedSecret = (secret || '').match(/.{1,4}/g)?.join(' ') || secret;

  if (step === 'completed') {
    return (
      <div className={`text-center py-6 space-y-4 ${className}`}>
        <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-sm">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
            Xác thực 2 lớp đã được thiết lập thành công
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            Tài khoản của bạn đã được tăng cường bảo mật. Hãy bảo quản kỹ các mã khôi phục đã lưu.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Tiêu đề & Tiến trình */}
      <div className="space-y-2 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-[#002D54] dark:text-cyan-400 text-xs font-bold">
          <ShieldCheck className="w-4 h-4" />
          <span>Thiết lập xác thực 2 lớp</span>
        </div>
        <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">
          {step === 'scan' && 'Bước 1: Quét mã QR ứng dụng xác thực'}
          {step === 'verify' && 'Bước 2: Nhập mã xác nhận 6 chữ số'}
          {step === 'recovery' && 'Bước 3: Lưu mã khôi phục dự phòng'}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {step === 'scan' && 'Dùng Google Authenticator hoặc ứng dụng TOTP bất kỳ để quét mã.'}
          {step === 'verify' && 'Nhập mã 6 chữ số hiển thị trên ứng dụng của bạn.'}
          {step === 'recovery' && 'Lưu lại 10 mã khôi phục này phòng trường hợp mất thiết bị xác thực.'}
        </p>
      </div>

      {/* Bước 1: Quét mã QR */}
      {step === 'scan' && (
        <div className="space-y-5">
          {setupMutation.isPending && !secret && (
            <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
              <LoadingSkeleton lines={4} />
            </div>
          )}

          {setupMutation.isError && (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-bold">Không thể tải thông tin thiết lập 2FA</p>
                <p className="mt-0.5">{setupMutation.error?.message || 'Vui lòng thử lại sau.'}</p>
                <button
                  type="button"
                  onClick={() => setupMutation.mutate()}
                  className="mt-2 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[11px] font-bold transition-colors"
                >
                  Thử lại
                </button>
              </div>
            </div>
          )}

          {secret && (
            <>
              {/* Vùng hiển thị mã QR */}
              <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                {otpauthUri ? (
                  <QRCodeSVG
                    value={otpauthUri}
                    size={180}
                    level="M"
                    className="rounded-lg"
                  />
                ) : (
                  <div className="w-44 h-44 bg-slate-100 flex items-center justify-center text-xs text-slate-400">
                    Không có mã QR
                  </div>
                )}
                <span className="mt-2 text-[11px] text-slate-500 font-medium">
                  Quét mã qua Google Authenticator hoặc ứng dụng TOTP
                </span>
              </div>

              {/* Khóa bí mật chia nhóm 4 ký tự */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Khóa bí mật (nhập tay)
                  </span>
                  <button
                    type="button"
                    onClick={handleCopySecret}
                    className="inline-flex items-center gap-1 text-xs font-bold text-[#0082B4] hover:text-[#006a94] transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedSecret ? 'Đã sao chép' : 'Sao chép'}</span>
                  </button>
                </div>
                <div className="text-center font-mono text-sm sm:text-base font-extrabold tracking-widest text-[#002D54] dark:text-cyan-300 py-1 select-all bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-700">
                  {formattedSecret}
                </div>
              </div>

              {/* Nút hành động */}
              <div className="flex items-center gap-3">
                {onCancel && (
                  <button
                    type="button"
                    onClick={onCancel}
                    className="w-1/3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Hủy
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setStep('verify')}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#002D54] to-[#0082B4] hover:from-[#002444] hover:to-[#00709c] text-white text-xs font-extrabold shadow-md shadow-cyan-950/20 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Tiếp tục</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Bước 2: Nhập mã xác nhận 6 số */}
      {step === 'verify' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-slate-800/60 border border-blue-200/60 dark:border-slate-700 space-y-3">
            <label
              htmlFor="two-factor-code"
              className="block text-xs font-bold text-[#002D54] dark:text-cyan-400"
            >
              Mã xác thực 6 chữ số
            </label>
            <div>
              <input
                id="two-factor-code"
                type="text"
                inputMode="numeric"
                aria-label="Mã xác thực TOTP"
                placeholder="000000"
                maxLength={6}
                value={code}
                onChange={handleCodeChange}
                disabled={isVerifying}
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-blue-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-center font-mono font-black text-xl text-[#002D54] dark:text-white tracking-widest focus:outline-none focus:border-[#0082B4] shadow-sm transition-all disabled:opacity-60"
              />
            </div>
            {verifyError && (
              <p className="text-xs text-red-600 font-semibold leading-tight">
                {verifyError}
              </p>
            )}
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Hệ thống sẽ tự động xác thực ngay khi bạn nhập đủ 6 chữ số.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setStep('scan');
                setVerifyError(null);
              }}
              className="py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Quay lại
            </button>
          </div>
        </div>
      )}

      {/* Bước 3: Hiển thị 10 mã khôi phục */}
      {step === 'recovery' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-slate-800/60 border border-amber-200/70 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-amber-900 dark:text-amber-400">
                10 mã khôi phục dùng một lần
              </span>
              <span className="text-[10px] text-amber-700 dark:text-amber-300 font-medium">
                Mỗi mã dùng 1 lần
              </span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              Lưu giữ các mã này ở nơi an toàn. Bạn có thể dùng một mã này để đăng nhập khi không có thiết bị tạo mã TOTP.
            </p>

            {/* Danh sách mã khôi phục dạng lưới monospace */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              {recoveryCodes.map((codeItem, idx) => (
                <div
                  key={idx}
                  className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 text-center font-mono text-xs font-bold text-slate-800 dark:text-slate-100 border border-amber-200 dark:border-slate-700 shadow-xs select-all"
                >
                  {codeItem}
                </div>
              ))}
            </div>

            {/* Nút sao chép và tải về */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleCopyAll}
                className="flex-1 py-2 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 transition-colors shadow-xs"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedAll ? 'Đã sao chép tất cả' : 'Sao chép tất cả'}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadTxt}
                className="flex-1 py-2 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 transition-colors shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải tệp .txt</span>
              </button>
            </div>
          </div>

          {/* Nút Tôi đã lưu mã */}
          <div>
            <button
              type="button"
              disabled={!hasSaved}
              onClick={handleFinish}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#002D54] to-[#0082B4] hover:from-[#002444] hover:to-[#00709c] text-white text-xs font-extrabold shadow-md shadow-cyan-950/20 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Tôi đã lưu mã</span>
            </button>
            {!hasSaved && (
              <p className="mt-2 text-center text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                Vui lòng sao chép hoặc tải tệp mã khôi phục để tiếp tục.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TwoFactorSetup;
