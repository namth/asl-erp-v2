export type MenuCountKey = 'approvals' | 'cases' | 'tasks';

export interface MenuItem {
  key: string;
  label: string;
  url: string;
  href?: string;
  icon?: string;
  badge?: string;
  badgeClass?: string;
  countKey?: MenuCountKey;
}

export interface MenuSection {
  title: string;
  items: MenuItem[];
}

export function getMenu(role: string): MenuSection[] {
  const normalizedRole = (role || '').toUpperCase();

  const itemDashboardAccountant: MenuItem = {
    key: 'dashboard',
    label: 'Bàn làm việc cá nhân',
    url: '/dashboard',
    href: '/dashboard',
    icon: 'LayoutDashboard',
  };

  const itemDashboardManager: MenuItem = {
    key: 'dashboard',
    label: 'Không gian cá nhân',
    url: '/dashboard',
    href: '/dashboard',
    icon: 'LayoutDashboard',
  };

  const itemDashboardAdmin: MenuItem = {
    key: 'dashboard',
    label: 'Bàn làm việc cá nhân',
    url: '/dashboard',
    href: '/dashboard',
    icon: 'LayoutDashboard',
  };

  const itemApprovalsAccountant: MenuItem = {
    key: 'approvals',
    label: 'Duyệt nhanh tài chính',
    url: '/approvals',
    href: '/approvals',
    countKey: 'approvals',
    badgeClass: 'bg-red-500 text-white animate-pulse',
    icon: 'CheckCircle',
  };

  const itemApprovalsGeneral: MenuItem = {
    key: 'approvals',
    label: 'Duyệt nhanh vụ việc',
    url: '/approvals',
    href: '/approvals',
    countKey: 'approvals',
    badgeClass: 'bg-red-500 text-white animate-pulse',
    icon: 'CheckCircle',
  };

  const itemCasesAccountant: MenuItem = {
    key: 'cases',
    label: 'Vụ việc có liên quan',
    url: '/cases',
    href: '/cases',
    countKey: 'cases',
    badgeClass: 'bg-blue-100 text-[#002D54]',
    icon: 'Briefcase',
  };

  const itemCasesGeneral: MenuItem = {
    key: 'cases',
    label: 'Hồ sơ vụ việc',
    url: '/cases',
    href: '/cases',
    countKey: 'cases',
    badgeClass: 'bg-blue-100 text-[#002D54]',
    icon: 'Briefcase',
  };

  const itemAccounting: MenuItem = {
    key: 'accounting',
    label: 'Kế toán & Hóa đơn',
    url: '/accounting',
    href: '/accounting',
    icon: 'Receipt',
  };

  const itemFinance: MenuItem = {
    key: 'finance',
    label: 'Tài chính & Thu chi',
    url: '/finance',
    href: '/finance',
    icon: 'Wallet',
  };

  const itemReports: MenuItem = {
    key: 'reports',
    label: 'Báo cáo & Thống kê',
    url: '/reports',
    href: '/reports',
    icon: 'BarChart3',
  };

  const itemAi: MenuItem = {
    key: 'ai-assistant',
    label: 'Trợ lý AI (Copilot)',
    url: '/ai-assistant',
    href: '/ai-assistant',
    badge: 'Mới',
    badgeClass: 'bg-[#FF7A00] text-white',
    icon: 'Sparkles',
  };

  const itemCrmOpportunitiesManager: MenuItem = {
    key: 'crm-opportunities',
    label: 'Khách hàng tiềm năng',
    url: '/crm',
    href: '/crm',
    icon: 'TrendingUp',
  };

  const itemCrmOpportunitiesAdmin: MenuItem = {
    key: 'crm-opportunities',
    label: 'Cơ hội kinh doanh',
    url: '/crm',
    href: '/crm',
    icon: 'TrendingUp',
  };

  const itemCrmCustomers: MenuItem = {
    key: 'crm-customers',
    label: 'Khách hàng',
    url: '/crm/customers',
    href: '/crm/customers',
    icon: 'Users',
  };

  const itemTasks: MenuItem = {
    key: 'tasks',
    label: 'Tác vụ thực hiện',
    url: '/tasks',
    href: '/tasks',
    countKey: 'tasks',
    badgeClass: 'bg-amber-100 text-amber-800',
    icon: 'CheckSquare',
  };

  const itemFloorplan: MenuItem = {
    key: 'floorplan',
    label: 'Văn phòng số 2.5D',
    url: '/operations/floorplan',
    href: '/operations/floorplan',
    badge: 'TRỰC QUAN',
    badgeClass: 'bg-emerald-500 text-white',
    icon: 'Building',
  };

  const itemWorkflows: MenuItem = {
    key: 'workflows',
    label: 'Quy trình chuẩn',
    url: '/workflows',
    href: '/workflows',
    icon: 'GitBranch',
  };

  const itemAudit: MenuItem = {
    key: 'audit-logs',
    label: 'Nhật ký kiểm toán',
    url: '/audit-logs',
    href: '/audit-logs',
    icon: 'ShieldCheck',
  };

  const itemUsers: MenuItem = {
    key: 'users',
    label: 'Thành viên người dùng',
    url: '/users',
    href: '/users',
    icon: 'UserCog',
  };

  const itemSettings: MenuItem = {
    key: 'settings',
    label: 'Cấu hình hệ thống',
    url: '/settings',
    href: '/settings',
    icon: 'Settings',
  };

  const itemArchitecture: MenuItem = {
    key: 'architecture',
    label: 'Kiến trúc hệ thống',
    url: '/architecture',
    href: '/architecture',
    badge: 'MÔ PHỎNG',
    badgeClass: 'bg-gradient-to-r from-sky-500 to-blue-600 text-white',
    icon: 'Layers',
  };

  if (normalizedRole === 'ACCOUNTANT') {
    return [
      {
        title: 'Tổng Quan',
        items: [itemDashboardAccountant],
      },
      {
        title: 'Phê Duyệt Nhanh',
        items: [itemApprovalsAccountant],
      },
      {
        title: 'Nghiệp Vụ Tài Chính',
        items: [itemCasesAccountant, itemAccounting, itemFinance, itemReports],
      },
    ];
  }

  if (normalizedRole === 'MANAGER') {
    return [
      {
        title: 'Tổng Quan',
        items: [itemDashboardManager, itemAi],
      },
      {
        title: 'Thực Thi Nghiệp Vụ',
        items: [itemCrmOpportunitiesManager, itemCasesGeneral, itemTasks, itemCrmCustomers, itemApprovalsGeneral],
      },
      {
        title: 'Tài Chính & Báo Cáo',
        items: [itemFloorplan, itemFinance, itemReports],
      },
    ];
  }

  if (normalizedRole === 'ATTORNEY') {
    return [
      {
        title: 'Tổng Quan',
        items: [itemDashboardManager, itemAi],
      },
      {
        title: 'Thực Thi Nghiệp Vụ',
        items: [itemCrmOpportunitiesManager, itemCasesGeneral, itemTasks, itemCrmCustomers, itemApprovalsGeneral],
      },
    ];
  }

  // Mặc định ADMIN
  return [
    {
      title: 'Tổng Quan',
      items: [itemDashboardAdmin, itemAi],
    },
    {
      title: 'Thực Thi Nghiệp Vụ',
      items: [itemCrmOpportunitiesAdmin, itemCasesGeneral, itemTasks, itemCrmCustomers, itemApprovalsGeneral],
    },
    {
      title: 'Tài Chính & Kế Toán',
      items: [itemFinance, itemAccounting],
    },
    {
      title: 'Hệ Thống & Cấu Hình',
      items: [
        itemFloorplan,
        itemWorkflows,
        itemReports,
        itemAudit,
        itemUsers,
        itemSettings,
        itemArchitecture,
      ],
    },
  ];
}
