'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMe } from '@/hooks/use-auth';
import { useMenuCounts } from '@/hooks/use-menu-counts';
import { useSidebarStore } from '@/stores/sidebar-store';
import { getMenu, MenuItem } from '@/lib/menu';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { AiChatButton, AiChatDrawer } from '@/components/ai';
import {
  LayoutDashboard,
  Briefcase,
  CheckCircle,
  Receipt,
  Wallet,
  BarChart3,
  Sparkles,
  TrendingUp,
  Users,
  CheckSquare,
  Building,
  GitBranch,
  ShieldCheck,
  UserCog,
  Settings,
  Layers,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
} from 'lucide-react';
import { NotificationBell } from '@/components/notifications/notification-bell';

function getIcon(name?: string) {
  switch (name) {
    case 'LayoutDashboard':
      return <LayoutDashboard className="w-5 h-5" />;
    case 'Briefcase':
      return <Briefcase className="w-5 h-5" />;
    case 'CheckCircle':
      return <CheckCircle className="w-5 h-5" />;
    case 'Receipt':
      return <Receipt className="w-5 h-5" />;
    case 'Wallet':
      return <Wallet className="w-5 h-5" />;
    case 'BarChart3':
      return <BarChart3 className="w-5 h-5" />;
    case 'Sparkles':
      return <Sparkles className="w-5 h-5 text-amber-500" />;
    case 'TrendingUp':
      return <TrendingUp className="w-5 h-5" />;
    case 'Users':
      return <Users className="w-5 h-5" />;
    case 'CheckSquare':
      return <CheckSquare className="w-5 h-5" />;
    case 'Building':
      return <Building className="w-5 h-5 text-emerald-500" />;
    case 'GitBranch':
      return <GitBranch className="w-5 h-5" />;
    case 'ShieldCheck':
      return <ShieldCheck className="w-5 h-5" />;
    case 'UserCog':
      return <UserCog className="w-5 h-5" />;
    case 'Settings':
      return <Settings className="w-5 h-5" />;
    case 'Layers':
      return <Layers className="w-5 h-5 text-sky-500" />;
    default:
      return <LayoutDashboard className="w-5 h-5" />;
  }
}

function getRoleLabel(role?: string): string {
  switch ((role || '').toUpperCase()) {
    case 'ADMIN':
      return 'Quản trị viên';
    case 'MANAGER':
      return 'Quản lý';
    case 'ACCOUNTANT':
      return 'Kế toán';
    case 'ATTORNEY':
      return 'Luật sư';
    default:
      return role || 'Người dùng';
  }
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: user, isLoading, isError } = useMe();
  const { isCollapsed, toggle } = useSidebarStore();
  const [isDark, setIsDark] = React.useState(false);
  const { counts } = useMenuCounts(user?.system_role);

  useEffect(() => {
    if (!isLoading && (isError || !user)) {
      router.push('/login');
    }
  }, [isLoading, isError, user, router]);

  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains('dark');
    setIsDark(isDarkMode);
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
        <div className="w-full max-w-md p-6 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
          <LoadingSkeleton lines={5} />
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const menuSections = getMenu(user.system_role);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex text-slate-800 dark:text-slate-100">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300 ${
          isCollapsed ? 'w-20' : 'w-72'
        }`}
      >
        {/* Sidebar Header */}
        <div className="h-20 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-[#002D54] to-[#004D7A] text-white">
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="font-black text-sm tracking-wide">ASL LAW</span>
              <span className="text-[10px] text-cyan-200 font-semibold tracking-wider uppercase">
                Hệ thống ERP Pháp lý
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label="Thu gọn sidebar"
            data-testid="sidebar-toggle"
            className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors mx-auto"
            title={isCollapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
          >
            {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {menuSections.map((section, idx) => (
            <div key={idx}>
              {!isCollapsed && (
                <div className="px-3 mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {section.title}
                </div>
              )}
              <div className="space-y-1">
                {section.items.map((item: MenuItem) => {
                  const isActive = pathname === item.url || pathname.startsWith(item.url + '/');
                  return (
                    <Link
                      key={item.key}
                      href={item.url}
                      title={isCollapsed ? item.label : undefined}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-gradient-to-r from-[#002D54] to-[#0082B4] text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-300 hover:text-[#002D54] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                      } ${isCollapsed ? 'justify-center' : ''}`}
                    >
                      <span className={isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'}>
                        {getIcon(item.icon)}
                      </span>
                      {!isCollapsed && (
                        <>
                          <span className="flex-1 truncate">{item.label}</span>
                          {(() => {
                            let badgeText: string | null = null;
                            if (item.badge) {
                              badgeText = item.badge;
                            } else if (item.countKey && counts && counts[item.countKey] > 0) {
                              const c = counts[item.countKey];
                              badgeText = c > 99 ? '99+' : String(c);
                            }
                            if (!badgeText) return null;
                            return (
                              <span
                                className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  item.badgeClass || 'bg-slate-200 text-slate-700'
                                }`}
                              >
                                {badgeText}
                              </span>
                            );
                          })()}
                        </>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          {!isCollapsed && (
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-2 py-1">
              <span className="font-medium">Chế độ hiển thị</span>
              <button
                type="button"
                onClick={toggleTheme}
                className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
                title="Chuyển đổi giao diện Sáng / Tối"
              >
                {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Container */}
      <div
        className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${
          isCollapsed ? 'ml-20' : 'ml-72'
        }`}
      >
        {/* Header */}
        <header className="h-20 bg-gradient-to-r from-[#002D54] via-[#003866] to-[#004D7A] text-white px-6 flex items-center justify-between sticky top-0 z-30 shadow-md">
          <div className="flex items-center gap-4">
            <div>
              <div className="text-xs text-cyan-200/90 font-medium">ASL LAW / Phân hệ</div>
              <h1 className="text-lg font-bold text-white tracking-tight">Hệ thống Điều hành</h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <AiChatButton />

            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Chuyển đổi giao diện Sáng / Tối"
            >
              {isDark ? <Sun className="w-5 h-5 text-amber-300" /> : <Moon className="w-5 h-5" />}
            </button>

            <NotificationBell />

            {/* User Profile */}
            <div className="flex items-center gap-3 pl-3 border-l border-white/20">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF7A00] to-amber-500 flex items-center justify-center text-white font-extrabold text-sm shadow-md border border-white/40">
                {user.full_name.charAt(0)}
              </div>
              <div className="text-left leading-tight">
                <div className="text-xs font-bold text-white">{user.full_name}</div>
                <div className="text-[10px] text-cyan-200 font-semibold">
                  {user.title || getRoleLabel(user.system_role)}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6">{children}</main>
      </div>

      <AiChatDrawer />
    </div>
  );
}
