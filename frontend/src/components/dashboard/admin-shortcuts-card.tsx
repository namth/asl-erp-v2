import React from 'react';
import Link from 'next/link';
import { Users, GitBranch, ShieldAlert, Settings, ArrowUpRight } from 'lucide-react';

export function AdminShortcutsCard() {
  const shortcuts = [
    {
      title: 'Người dùng & Phòng ban',
      description: 'Quản lý tài khoản, phân quyền và cơ cấu tổ chức',
      href: '/admin/users',
      icon: <Users className="w-6 h-6 text-[#002D54] dark:text-cyan-400" />,
      color: 'bg-blue-50 dark:bg-blue-950/40 text-[#002D54] dark:text-cyan-300',
    },
    {
      title: 'Quy trình nghiệp vụ',
      description: 'Thiết kế mẫu quy trình pháp lý và cổng kiểm soát',
      href: '/admin/workflows',
      icon: <GitBranch className="w-6 h-6 text-[#0082B4] dark:text-cyan-400" />,
      color: 'bg-cyan-50 dark:bg-cyan-950/40 text-[#0082B4] dark:text-cyan-300',
    },
    {
      title: 'Nhật ký kiểm toán',
      description: 'Theo dõi toàn bộ vết thay đổi và tính toàn vẹn hệ thống',
      href: '/admin/audit-logs',
      icon: <ShieldAlert className="w-6 h-6 text-amber-600 dark:text-amber-400" />,
      color: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-300',
    },
    {
      title: 'Cài đặt hệ thống',
      description: 'Cấu hình hoa hồng mặc định và bảo mật tài khoản',
      href: '/settings',
      icon: <Settings className="w-6 h-6 text-slate-700 dark:text-slate-300" />,
      color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
    },
  ];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
      <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
          Lối tắt quản trị hệ thống
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Truy cập nhanh vào các phân hệ cấu hình và điều hành trung tâm
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {shortcuts.map((sc) => (
          <Link
            key={sc.href}
            href={sc.href}
            className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 hover:border-[#0082B4] dark:hover:border-cyan-500 transition-all group flex flex-col justify-between space-y-3"
          >
            <div className="flex items-start justify-between">
              <div className={`p-3 rounded-xl ${sc.color}`}>
                {sc.icon}
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-[#0082B4] dark:group-hover:text-cyan-400 transition-colors" />
            </div>

            <div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 group-hover:text-[#0082B4] dark:group-hover:text-cyan-400 transition-colors">
                {sc.title}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {sc.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
