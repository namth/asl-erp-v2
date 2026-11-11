import React from 'react';
import Link from 'next/link';
import { Shield, Calendar, Mail, UserCheck } from 'lucide-react';
import { User } from '@/types/auth';

interface MyAccountCardProps {
  user?: User | null;
}

const roleNames: Record<string, string> = {
  ADMIN: 'Quản trị viên',
  MANAGER: 'Quản lý / Luật sư thành viên',
  ATTORNEY: 'Luật sư',
  ACCOUNTANT: 'Kế toán',
};

export function MyAccountCard({ user }: MyAccountCardProps) {
  const roleName = user?.system_role ? (roleNames[user.system_role] || user.system_role) : 'Thành viên';
  const isAdmin = user?.system_role === 'ADMIN';

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-[#002D54] dark:text-cyan-400" />
            Tài khoản của tôi
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Thông tin định danh và bảo mật tài khoản cá nhân
          </p>
        </div>
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
          {roleName}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="space-y-1">
          <span className="text-slate-500 dark:text-slate-400 block">Họ và tên</span>
          <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
            {user?.full_name || 'Chưa cập nhật'}
          </span>
        </div>

        <div className="space-y-1">
          <span className="text-slate-500 dark:text-slate-400 block flex items-center gap-1">
            <Mail className="w-3.5 h-3.5 text-slate-400" />
            Email liên hệ
          </span>
          <span className="font-mono text-slate-800 dark:text-slate-200">
            {user?.email || 'Chưa cập nhật'}
          </span>
        </div>
      </div>

      <div className="pt-2 flex flex-wrap items-center gap-3">
        <Link
          href="/account/security"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          <Shield className="w-4 h-4 text-[#0082B4]" />
          Bảo mật & Đổi mật khẩu
        </Link>

        {isAdmin && (
          <Link
            href="/admin/holidays"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-[#002D54] dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/40 hover:bg-cyan-100 dark:hover:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 transition-colors"
          >
            <Calendar className="w-4 h-4" />
            Quản lý ngày nghỉ lễ
          </Link>
        )}
      </div>
    </div>
  );
}
