// ==============================================================================
// ASL LAW ERP - MODULAR SHARED LAYOUT ENGINE (v2.6)
// Tách biệt hoàn toàn Sidebar và Header thành các component bố cục dùng chung.
// Phân chia Sidebar theo từng đối tượng: Admin, Người Quản Lý, Kế Toán, Luật Sư.
// ==============================================================================

(function() {
  'use strict';

  // ==============================================================================
  // ASL LAW ERP - ROBUST THEME SWITCH SYSTEM (Light / Dark Mode Engine)
  // ==============================================================================
  function updateThemeUI(isDark) {
    document.querySelectorAll('.btn-theme-toggle').forEach(btn => {
      const thumb = btn.querySelector('.theme-switch-thumb');
      const track = btn.querySelector('.theme-switch-track');
      const label = btn.querySelector('.theme-text-label');
      
      if (isDark) {
        if (thumb) {
          thumb.classList.add('translate-x-4');
          thumb.classList.remove('translate-x-0');
        }
        if (track) {
          track.classList.add('bg-cyan-400');
          track.classList.remove('bg-white/20');
        }
        if (label) label.textContent = 'Giao diện Tối';
        btn.title = 'Bấm để chuyển sang Giao diện Sáng (Phím D)';
      } else {
        if (thumb) {
          thumb.classList.remove('translate-x-4');
          thumb.classList.add('translate-x-0');
        }
        if (track) {
          track.classList.remove('bg-cyan-400');
          track.classList.add('bg-white/20');
        }
        if (label) label.textContent = 'Giao diện Sáng';
        btn.title = 'Bấm để chuyển sang Giao diện Tối (Phím D)';
      }
    });

    document.querySelectorAll('.theme-mode-label').forEach(label => {
      label.textContent = isDark ? 'Bật' : 'Tắt';
    });
  }

  function initTheme() {
    const savedTheme = localStorage.getItem('asl_theme');
    // Mặc định là giao diện sáng (Light). Chỉ bật Dark khi người dùng đã chủ động chọn 'dark'
    const isDark = (savedTheme === 'dark');
    
    if (isDark) {
      document.documentElement.classList.add('dark');
      if (document.body) document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      if (document.body) document.body.classList.remove('dark');
    }
    updateThemeUI(isDark);
    return isDark;
  }

  // ĐỊNH NGHĨA HÀM TOÀN CỤC NGAY LẬP TỨC (Kèm cơ chế chống kích hoạt đúp - Debounce/Throttle)
  let lastToggleTimestamp = 0;
  window.toggleTheme = function() {
    const now = Date.now();
    if (now - lastToggleTimestamp < 200) {
      return document.documentElement.classList.contains('dark');
    }
    lastToggleTimestamp = now;

    const isCurrentlyDark = document.documentElement.classList.contains('dark');
    const nextDark = !isCurrentlyDark;
    
    if (nextDark) {
      document.documentElement.classList.add('dark');
      if (document.body) document.body.classList.add('dark');
      localStorage.setItem('asl_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      if (document.body) document.body.classList.remove('dark');
      localStorage.setItem('asl_theme', 'light');
    }
    updateThemeUI(nextDark);
    return nextDark;
  };

  // GLOBAL EVENT DELEGATION - Bắt sự kiện click duy nhất, không lo xung đột hay thứ tự DOM
  document.addEventListener('click', function(e) {
    const toggleBtn = e.target.closest('.btn-theme-toggle, .sidebar-theme-toggle, [data-action="toggle-theme"]');
    if (toggleBtn) {
      e.preventDefault();
      e.stopPropagation();
      window.toggleTheme();
    }
  });

  // Tự động tiêm nút chuyển Dark Mode vào Header
  function injectThemeToggle() {
    document.querySelectorAll('header').forEach(header => {
      if (header.querySelector('.btn-theme-toggle')) return;
      
      const rightCluster = header.querySelector('.flex.items-center.gap-3') || 
                           header.querySelector('.flex.items-center.gap-2') || 
                           header.querySelector('[class*="items-center"][class*="gap-"]') ||
                           header.lastElementChild;
      if (rightCluster) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-action', 'toggle-theme');
        btn.className = 'btn-theme-toggle px-2.5 sm:px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white transition-all flex items-center gap-2 shadow-xs cursor-pointer flex-shrink-0';
        btn.title = 'Chuyển chế độ Giao diện Sáng / Tối (Phím D)';
        btn.innerHTML = `
          <div class="w-8 h-4 bg-white/20 rounded-full p-0.5 flex items-center transition-colors theme-switch-track pointer-events-none">
            <div class="w-3 h-3 bg-white rounded-full shadow-md transform transition-transform theme-switch-thumb translate-x-0"></div>
          </div>
          <span class="text-xs font-bold theme-text-label hidden sm:inline pointer-events-none">Giao diện Sáng</span>
        `;
        
        const avatarContainer = rightCluster.querySelector('[class*="border-l"]');
        if (avatarContainer) {
          rightCluster.insertBefore(btn, avatarContainer);
        } else {
          rightCluster.appendChild(btn);
        }
      }
    });

    const isDark = document.documentElement.classList.contains('dark');
    updateThemeUI(isDark);
  }

  // Khởi động theme tức thì
  initTheme();


  // 1. Helpers phát hiện môi trường & đường dẫn tương đối
  function getBasePath() {
    const path = window.location.pathname.replace(/\\/g, '/');
    if (path === '/' || path === '' || path.endsWith('/prototype') || path.endsWith('/prototype/')) {
      return './';
    }
    // Nếu đang ở trang chủ root (index.html ở gốc không thuộc module con)
    const subModules = ['crm', 'tasks', 'cases', 'dashboard', 'accounting', 'approvals', 'finance', 'documents', 'workflows', 'reports', 'audit-logs', 'users', 'client-portal', 'ai-assistant', 'settings', 'timesheet', 'auth', 'architecture', 'operations'];
    const isSubModule = subModules.some(m => path.includes('/' + m + '/'));
    if (!isSubModule) {
      return './';
    }
    return '../';
  }

  function getActiveMenuKey() {
    const path = window.location.pathname.toLowerCase().replace(/\\/g, '/');
    if (path.includes('/operations/')) return 'operations-floorplan';
    if (path.includes('/architecture')) return 'architecture';
    if (path.includes('/approvals/')) return 'approvals';
    if (path.includes('/tasks/')) return 'tasks';
    if (path.includes('/cases/')) return 'cases';
    if (path.includes('/crm/customers.html')) return 'crm-customers';
    if (path.includes('/crm/')) return 'crm-opportunities';
    if (path.includes('/workflows/')) return 'workflows';
    if (path.includes('/accounting/')) return 'accounting';
    if (path.includes('/finance/')) return 'finance';
    if (path.includes('/documents/')) return 'documents';
    if (path.includes('/reports/')) return 'reports';
    if (path.includes('/audit-logs/')) return 'audit-logs';
    if (path.includes('/users/')) return 'users';
    if (path.includes('/client-portal/')) return 'client-portal';
    if (path.includes('/ai-assistant/')) return 'ai-assistant';
    if (path.includes('/settings/')) return 'settings';
    if (path.includes('/dashboard/')) return 'dashboard';
    return 'dashboard';
  }

  // 2. Vai Trò Người Dùng Hiện Tại (Admin | Manager | Accountant | Attorney)
  // Ưu tiên đọc từ URL parameter ?role=... để duy trì chính xác vai trò khi bấm chuyển trang
  const urlParams = new URLSearchParams(window.location.search);
  const roleFromUrl = urlParams.get('role');
  let currentRole = (roleFromUrl && ['admin', 'manager', 'accountant', 'attorney'].includes(roleFromUrl))
    ? roleFromUrl
    : (localStorage.getItem('asl_user_role') || 'admin');

  // Luôn ghi nhận vào localStorage để đồng bộ trạng thái
  localStorage.setItem('asl_user_role', currentRole);

  function getRoleInfo(role) {
    switch(role) {
      case 'accountant':
        return {
          name: 'Trần Thị Thu Trang',
          title: 'Kế Toán Trưởng',
          avatarText: 'TT',
          badgeText: 'Kế Toán Chuyên Trách'
        };
      case 'manager':
        return {
          name: 'LS. Nguyễn Anh',
          title: 'Managing Partner',
          avatarText: 'NA',
          badgeText: 'Người Quản Lý'
        };
      case 'attorney':
        return {
          name: 'LS. Hoàng Gia Huy',
          title: 'Luật Sư Chuyên Môn',
          avatarText: 'GH',
          badgeText: 'Luật Sư Chuyên Môn'
        };
      case 'admin':
      default:
        return {
          name: 'LS. Nam Trần',
          title: 'Quản Trị Viên',
          avatarText: 'NV',
          badgeText: 'Quản Trị Viên'
        };
    }
  }

  // 3. Danh mục Menu chuẩn hóa theo từng đối tượng / vai trò
  function getMenuSections(basePath, role = currentRole) {
    function withRole(url) {
      if (!url) return url;
      const sep = url.includes('?') ? '&' : '?';
      return `${url}${sep}role=${role}`;
    }

    const itemDashboard = {
      key: 'dashboard',
      label: 'Bàn làm việc cá nhân',
      url: withRole(basePath + 'dashboard/index.html'),
      icon: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>`
    };

    const itemAI = {
      key: 'ai-assistant',
      label: 'Trợ lý AI (Copilot)',
      url: withRole(basePath + 'ai-assistant/index.html'),
      badge: 'Mới',
      badgeClass: 'bg-[#FF7A00] text-white',
      icon: `<svg class="w-5 h-5 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>`
    };

    const itemApprovals = {
      key: 'approvals',
      label: (role === 'accountant' ? 'Duyệt nhanh tài chính' : 'Duyệt nhanh vụ việc'),
      url: withRole(basePath + 'approvals/index.html'),
      badge: (role === 'accountant' ? '4' : '8'),
      badgeClass: 'bg-red-500 text-white animate-pulse',
      icon: `<svg class="w-5 h-5 text-[#FF7A00]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
    };

    const itemCases = {
      key: 'cases',
      label: (role === 'accountant' ? 'Vụ việc có liên quan' : 'Hồ sơ vụ việc'),
      url: withRole(basePath + 'cases/index.html'),
      badge: (role === 'accountant' ? '18' : '48'),
      badgeClass: 'bg-blue-100 text-[#002D54] dark:bg-cyan-950/80 dark:text-cyan-300 dark:border dark:border-cyan-500/35',
      icon: `<svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>`
    };

    const itemTasks = {
      key: 'tasks',
      label: 'Quản lý tác vụ',
      url: withRole(basePath + 'tasks/index.html'),
      badge: '12',
      badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 dark:border dark:border-amber-500/35',
      icon: `<svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>`
    };

    const itemWorkflows = {
      key: 'workflows',
      label: 'Quản lý quy trình',
      url: withRole(basePath + 'workflows/index.html'),
      icon: `<svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>`
    };

    const itemCRMCustomers = {
      key: 'crm-customers',
      label: 'Khách hàng',
      url: withRole(basePath + 'crm/customers.html'),
      icon: `<svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>`
    };

    const itemCRMOpportunities = {
      key: 'crm-opportunities',
      label: 'Cơ hội kinh doanh',
      url: withRole(basePath + 'crm/index.html'),
      icon: `<svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>`
    };

    const itemFinance = {
      key: 'finance',
      label: 'Quản lý tài chính',
      url: withRole(basePath + 'finance/index.html'),
      icon: `<svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
    };

    const itemAccounting = {
      key: 'accounting',
      label: 'Kế toán & Hóa đơn',
      url: withRole(basePath + 'accounting/index.html'),
      icon: `<svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>`
    };

    const itemPortal = {
      key: 'client-portal',
      label: 'Cổng khách hàng',
      url: withRole(basePath + 'client-portal/index.html'),
      icon: `<svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>`
    };

    const itemReports = {
      key: 'reports',
      label: 'Báo cáo & Thống kê',
      url: withRole(basePath + 'reports/index.html'),
      icon: `<svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>`
    };

    const itemAudit = {
      key: 'audit-logs',
      label: 'Nhật ký kiểm toán',
      url: withRole(basePath + 'audit-logs/index.html'),
      icon: `<svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>`
    };

    const itemUsers = {
      key: 'users',
      label: 'Quản lý người dùng',
      url: withRole(basePath + 'users/index.html'),
      icon: `<svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>`
    };

    const itemSettings = {
      key: 'settings',
      label: 'Cấu hình hệ thống',
      url: withRole(basePath + 'settings/index.html'),
      icon: `<svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`
    };

    const itemArchitecture = {
      key: 'architecture',
      label: 'Kiến trúc hệ thống',
      url: withRole(basePath + 'architecture/index.html'),
      badge: 'MÔ PHỎNG',
      badgeClass: 'bg-gradient-to-r from-sky-500 to-blue-600 text-white font-mono font-bold',
      icon: `<svg class="w-5 h-5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>`
    };

    const itemFloorplan = {
      key: 'floorplan',
      label: 'Văn phòng số 2.5D',
      url: withRole(basePath + 'operations/floorplan.html'),
      badge: 'TRỰC QUAN',
      badgeClass: 'bg-emerald-500 text-white font-mono font-bold animate-pulse',
      icon: `<svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>`
    };

    // ==========================================
    // PHÂN QUYỀN MENU THEO ĐỐI TƯỢNG
    // ==========================================
    if (role === 'accountant') {
      // 1. KẾ TOÁN (Cực kỳ tinh gọn: Chỉ vụ việc liên quan, duyệt nhanh & tài chính)
      return [
        {
          title: 'Tổng Quan',
          items: [itemDashboard]
        },
        {
          title: 'Phê Duyệt Nhanh',
          items: [itemApprovals]
        },
        {
          title: 'Nghiệp Vụ Tài Chính',
          items: [itemCases, itemAccounting, itemFinance, itemReports]
        }
      ];
    } else if (role === 'manager') {
      // 2. NGƯỜI QUẢN LÝ / PARTNER (Quản lý nghiệp vụ chuẩn, duyệt nhanh, tài chính & báo cáo)
      return [
        {
          title: 'Tổng Quan',
          items: [itemDashboard, itemAI]
        },
        {
          title: 'Quản Lý Nghiệp Vụ',
          items: [itemCRMOpportunities, itemCases, itemTasks, itemCRMCustomers, itemApprovals]
        },
        {
          title: 'Tài Chính & Điều Hành',
          items: [itemFloorplan, itemFinance, itemReports]
        }
      ];
    } else if (role === 'attorney') {
      // 3. LUẬT SƯ CHUYÊN MÔN (Tập trung thực thi hồ sơ, không rườm rà)
      return [
        {
          title: 'Tổng Quan',
          items: [itemDashboard, itemAI]
        },
        {
          title: 'Quản Lý Nghiệp Vụ',
          items: [itemCRMOpportunities, itemCases, itemTasks, itemCRMCustomers, itemApprovals]
        }
      ];
    } else {
      // 4. QUẢN TRỊ VIÊN (ADMIN: Đầy đủ toàn bộ hệ thống gồm quy trình, báo cáo, cấu hình...)
      return [
        {
          title: 'Tổng Quan',
          items: [itemDashboard, itemAI]
        },
        {
          title: 'Quản Lý Nghiệp Vụ',
          items: [itemCRMOpportunities, itemCases, itemTasks, itemCRMCustomers, itemApprovals]
        },
        {
          title: 'Tài Chính & Kế Toán',
          items: [itemFinance, itemAccounting]
        },
        {
          title: 'Quản Trị & Điều Hành',
          items: [itemFloorplan, itemWorkflows, itemReports, itemAudit, itemUsers, itemSettings, itemArchitecture]
        }
      ];
    }
  }

  // 4. Hàm render Sidebar chuẩn hóa 100% (Single Source of Truth)
  function renderSidebarHTML(activeKey, targetRole = currentRole) {
    const basePath = getBasePath();
    const sections = getMenuSections(basePath, targetRole);
    const roleInfo = getRoleInfo(targetRole);

    let navHtml = '';
    sections.forEach(section => {
      navHtml += `
      <div>
        <div class="nav-section-title px-3 mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">${section.title}</div>
        <div class="space-y-1">`;
      
      section.items.forEach(item => {
        const isActive = (item.key === activeKey);
        const activeClass = isActive
          ? 'bg-gradient-to-r from-[#002D54] to-[#0082B4] text-white text-xs font-bold shadow-md shadow-cyan-950/20 active-nav-item'
          : 'text-slate-600 hover:text-[#002D54] hover:bg-slate-100/80 text-xs font-semibold transition-colors';
        
        let iconHtml = item.icon;
        if (isActive) {
          // Khi menu active thì icon chuyển sang màu trắng tinh để đồng bộ nổi bật với text
          iconHtml = iconHtml.replace(/text-[a-zA-Z0-9_\-\[\]#]+/g, 'text-white');
          if (!iconHtml.includes('text-white')) {
            iconHtml = iconHtml.replace('<svg class="', '<svg class="text-white ');
          }
        }

        const badgeHtml = item.badge
          ? `<span class="nav-badge ml-auto px-1.5 py-0.5 rounded text-[10px] ${item.badgeClass || 'bg-slate-200 text-slate-700'} font-bold">${item.badge}</span>`
          : '';

        navHtml += `
          <a href="${item.url}" class="flex items-center gap-3 px-3 py-2.5 rounded-xl ${activeClass}">
            ${iconHtml}
            <span class="nav-text">${item.label}</span>
            ${badgeHtml}
          </a>`;
      });

      navHtml += `
        </div>
      </div>`;
    });

    return `
    <!-- Top Branding / Logo Header -->
    <div class="h-20 sidebar-header-gradient border-b border-white/10 flex items-center justify-between px-5">
      <!-- Expanded Full Logo (White Background) -->
      <a href="${basePath}index.html?role=${targetRole}" id="sidebar-logo-full" class="flex flex-col items-start gap-1 group">
        <div class="bg-white preserve-white logo-container px-3 py-1.5 rounded-xl shadow-sm border border-white/20 flex items-center justify-center group-hover:scale-[1.02] transition-all">
          <img src="${basePath}assets/logo-asl.png" alt="ASL LAW Logo" class="h-8 w-auto max-w-[170px] object-contain">
        </div>
        <span class="text-[9px] font-extrabold text-cyan-200/90 uppercase tracking-widest pl-1">Firm ERP System</span>
      </a>

      <!-- Collapsed Logo Icon (Same White Background) -->
      <div id="sidebar-logo-collapsed" class="hidden cursor-pointer group relative flex items-center justify-center w-full py-1" onclick="toggleSidebar()" title="Bấm để mở rộng sidebar (Phím [ )">
        <div class="group-hover:hidden w-11 h-11 rounded-xl bg-white preserve-white logo-container shadow-md border border-white/30 flex items-center justify-center p-1.5 transition-transform">
          <img src="${basePath}assets/logo-asl-icon.png" alt="ASL LAW Icon" class="w-8 h-8 object-contain">
        </div>
        <div class="hidden group-hover:flex w-11 h-11 rounded-xl bg-gradient-to-br from-[#FF7A00] to-[#E66E00] items-center justify-center text-white font-bold shadow-lg shadow-orange-500/30 transition-transform scale-105">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
        </div>
        <div class="absolute left-full ml-3 px-2.5 py-1 bg-slate-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl z-50">
          Mở rộng menu (Phím [ )
        </div>
      </div>

      <!-- Collapse Toggle Button (Desktop) -->
      <button id="btn-collapse-sidebar" onclick="toggleSidebar()" class="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors" title="Thu gọn sidebar (Phím [ )">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/></svg>
      </button>
    </div>

    <!-- Role Switcher Component (Bộ Chọn Đối Tượng: Admin, Manager, Kế Toán, Luật Sư) -->
    <div id="sidebar-role-selector" class="p-3 border-b border-slate-100 bg-slate-50/70">
      <div class="space-y-1.5" id="sidebar-role-selector">
        <div class="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
          <span class="flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5 text-[#0082B4] dark:text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            <span>Vai trò đối tượng:</span>
          </span>
          <span class="text-[9px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 text-[#002D54] dark:text-cyan-300 font-bold border border-slate-200 dark:border-slate-700">ERP Role</span>
        </div>
        <select onchange="window.switchRole(this.value)" class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-[#002D54] dark:text-slate-100 rounded-xl px-2.5 py-2 focus:outline-none focus:border-[#0082B4] shadow-sm hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
          <option value="admin" ${targetRole === 'admin' ? 'selected' : ''}>Quản trị viên (Admin)</option>
          <option value="manager" ${targetRole === 'manager' ? 'selected' : ''}>Người quản lý (Partner)</option>
          <option value="accountant" ${targetRole === 'accountant' ? 'selected' : ''}>Kế toán tài chính</option>
          <option value="attorney" ${targetRole === 'attorney' ? 'selected' : ''}>Luật sư chuyên môn</option>
        </select>
      </div>
    </div>

    <!-- Navigation Menu Items Container -->
    <nav class="flex-1 overflow-y-auto px-3 py-4 space-y-6">
      ${navHtml}
    </nav>

    <!-- Bottom Footer Profile / Active Role Display -->
    <div class="p-3 border-t border-slate-100 bg-slate-50/50">
      <div class="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-100 transition-colors">
        <div class="w-8 h-8 rounded-full bg-[#002D54] text-white font-bold text-xs flex items-center justify-center flex-shrink-0 shadow-sm">
          ${roleInfo.avatarText}
        </div>
        <div class="nav-text text-xs leading-tight">
          <div class="font-bold text-slate-800">${roleInfo.name}</div>
          <div class="text-[10px] text-[#0082B4] font-semibold">${roleInfo.title}</div>
        </div>
      </div>
      <!-- Theme Switcher in Sidebar Footer -->
      <div class="nav-text pt-2 mt-1 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span class="font-semibold flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
          <span>Giao diện tối</span>
        </span>
        <button class="sidebar-theme-toggle px-2 py-0.5 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors text-slate-700 dark:text-slate-200 cursor-pointer" title="Chuyển chế độ Sáng / Tối (Phím D)" data-action="toggle-theme">
          <span class="theme-mode-label text-[10px] font-bold pointer-events-none">Tắt</span>
        </button>
      </div>
    </div>
    `;
  }

  // 5. Hàm render Top Header chuẩn hóa
  function renderHeaderHTML(options = {}) {
    const basePath = getBasePath();
    const title = options.title || document.title || 'ASL LAW ERP System';
    const section = options.section || 'Phân Hệ Nghiệp Vụ';
    const breadcrumb = options.breadcrumb || section;
    const actions = options.actions || '';
    const roleInfo = getRoleInfo(currentRole);

    return `
    <header class="header-gradient text-white h-20 px-6 flex items-center justify-between sticky top-0 z-30 shadow-md">
      <div class="flex items-center gap-4">
        <button onclick="toggleSidebar()" class="md:hidden p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white" title="Mở menu">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
        <div>
          <div class="text-xs text-cyan-200/90 font-medium flex items-center gap-1.5">
            <a href="${basePath}index.html?role=${currentRole}" class="hover:underline">ASL LAW</a>
            <span>/</span>
            <span class="text-white font-semibold">${breadcrumb}</span>
          </div>
          <h1 class="text-lg font-bold text-white tracking-tight">${title}</h1>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <!-- Quick Link to Approvals Hub -->
        <a href="${basePath}approvals/index.html?role=${currentRole}" class="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-xs text-white font-bold transition-all shadow-sm">
          <span class="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span>
          <span>Phê Duyệt Nhanh</span>
          <span class="px-1.5 py-0.2 rounded-full bg-red-500 text-white text-[10px] ml-1">8</span>
        </a>

        <!-- Custom Page Actions Slot -->
        ${actions}

        <!-- Notification Bell -->
        <button class="relative p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
          <span class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#FF7A00] ring-2 ring-white"></span>
        </button>

        <!-- User Profile Avatar & Role Badge -->
        <div class="flex items-center gap-2 pl-2 border-l border-white/20">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FF7A00] to-amber-500 flex items-center justify-center text-white font-extrabold text-xs shadow-md border border-white/40">
            ${roleInfo.avatarText}
          </div>
          <div class="hidden xl:block text-left leading-tight">
            <div class="text-xs font-bold text-white">${roleInfo.name}</div>
            <div class="text-[10px] text-cyan-200 font-semibold">${roleInfo.badgeText}</div>
          </div>
        </div>
      </div>
    </header>
    `;
  }

  // 5b. Đồng bộ thông tin profile người dùng trong Header theo vai trò (Role-based Header Profile)
  function syncHeaderProfile(role = currentRole) {
    const roleInfo = getRoleInfo(role);
    // header profile sync via getRoleInfo: Nam Trần, Nguyễn Anh, Thu Trang, Gia Huy
    document.querySelectorAll('header').forEach(header => {
      const profileContainer = header.querySelector('[class*="border-l"]');
      if (profileContainer) {
        // Cập nhật Avatar (khối tròn/vuông hiển thị chữ viết tắt vai trò: NV, NA, TT, GH)
        const avatarEl = profileContainer.querySelector('.rounded-full, .rounded-xl, [class*="rounded"]');
        if (avatarEl) {
          avatarEl.textContent = roleInfo.avatarText;
        }

        // Cập nhật Tên và Chức danh người dùng
        const textWrapper = profileContainer.querySelector('.text-left, .leading-tight, [class*="leading-"]') || profileContainer;
        if (textWrapper) {
          const nameEl = textWrapper.querySelector('.font-bold, [class*="font-bold"], .font-semibold');
          if (nameEl) {
            nameEl.textContent = roleInfo.name;
          }
          const titleEl = textWrapper.querySelector('.text-\\[10px\\], [class*="text-[10px]"], .text-cyan-200, [class*="text-cyan"], [class*="text-slate"], .text-xs:not(.font-bold)');
          if (titleEl && titleEl !== nameEl) {
            titleEl.textContent = roleInfo.title || roleInfo.badgeText;
          }
        }
      }
    });
  }

  // 6. Quản lý trạng thái Thu gọn / Mở rộng Sidebar & Mobile Off-canvas
  let isCollapsed = localStorage.getItem('asl_sidebar_collapsed') === 'true';
  let isMobileSidebarOpen = false;

  function getOrCreateBackdrop() {
    let backdrop = document.getElementById('sidebar-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'sidebar-backdrop';
      backdrop.className = 'sidebar-backdrop';
      backdrop.setAttribute('aria-hidden', 'true');
      backdrop.title = 'Bấm để đóng menu';
      backdrop.addEventListener('click', function() {
        closeMobileSidebar();
      });
      document.body.appendChild(backdrop);
    }
    return backdrop;
  }

  function openMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = getOrCreateBackdrop();
    if (sidebar) {
      sidebar.classList.add('sidebar-mobile-open');
      sidebar.classList.remove('-translate-x-full');
      sidebar.classList.add('w-72');
      sidebar.classList.remove('w-20');

      const logoFull = document.getElementById('sidebar-logo-full');
      const logoCollapsed = document.getElementById('sidebar-logo-collapsed');
      const roleSelector = document.getElementById('sidebar-role-selector');
      const navTexts = document.querySelectorAll('.nav-text');
      const sectionHeaders = document.querySelectorAll('.nav-section-title');

      if (logoFull) logoFull.classList.remove('hidden');
      if (logoCollapsed) logoCollapsed.classList.add('hidden');
      if (roleSelector) roleSelector.classList.remove('hidden');
      navTexts.forEach(el => el.classList.remove('hidden'));
      sectionHeaders.forEach(el => el.classList.remove('hidden'));
    }
    if (backdrop) {
      backdrop.classList.add('active');
    }
    isMobileSidebarOpen = true;
  }

  function closeMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) {
      sidebar.classList.remove('sidebar-mobile-open');
      sidebar.classList.add('-translate-x-full');
    }
    if (backdrop) {
      backdrop.classList.remove('active');
    }
    isMobileSidebarOpen = false;
  }

  function applySidebarState(collapsed) {
    const sidebar = document.getElementById('sidebar');
    const main = document.getElementById('main-container');
    const logoFull = document.getElementById('sidebar-logo-full');
    const logoCollapsed = document.getElementById('sidebar-logo-collapsed');
    const roleSelector = document.getElementById('sidebar-role-selector');
    const navTexts = document.querySelectorAll('.nav-text');
    const sectionHeaders = document.querySelectorAll('.nav-section-title');
    const collapseBtn = document.getElementById('btn-collapse-sidebar');
    const badgeCounts = document.querySelectorAll('.nav-badge');

    if (!sidebar || !main) return;

    const isMobile = window.innerWidth < 768;

    if (isMobile) {
      // Trên mobile (<768px): sidebar mặc định đóng off-canvas ngoài màn hình (-translate-x-full)
      if (!isMobileSidebarOpen) {
        sidebar.classList.add('-translate-x-full');
        sidebar.classList.remove('sidebar-mobile-open');
      }
      sidebar.classList.remove('w-20');
      sidebar.classList.add('w-72');
      main.classList.remove('md:ml-20', 'md:ml-72');

      const sidebarHeader = sidebar.querySelector('.sidebar-header-gradient');
      if (sidebarHeader) {
        sidebarHeader.classList.add('px-5', 'justify-between');
        sidebarHeader.classList.remove('px-2', 'justify-center');
      }

      if (logoFull) logoFull.classList.remove('hidden');
      if (logoCollapsed) logoCollapsed.classList.add('hidden');
      if (collapseBtn) collapseBtn.classList.add('hidden');
      if (roleSelector) roleSelector.classList.remove('hidden');

      navTexts.forEach(el => el.classList.remove('hidden'));
      sectionHeaders.forEach(el => el.classList.remove('hidden'));
      badgeCounts.forEach(el => el.classList.remove('hidden'));
      return;
    }

    // Trên desktop (>=768px): đảm bảo đóng mobile backdrop & gỡ class mobile
    closeMobileSidebar();
    sidebar.classList.remove('-translate-x-full', 'sidebar-mobile-open');

    const sidebarHeader = sidebar.querySelector('.sidebar-header-gradient');

    if (collapsed) {
      sidebar.classList.remove('w-72');
      sidebar.classList.add('w-20');
      main.classList.remove('md:ml-72');
      main.classList.add('md:ml-20');
      
      if (sidebarHeader) {
        sidebarHeader.classList.remove('px-5', 'justify-between');
        sidebarHeader.classList.add('px-2', 'justify-center');
      }

      if (logoFull) logoFull.classList.add('hidden');
      if (logoCollapsed) logoCollapsed.classList.remove('hidden');
      if (collapseBtn) collapseBtn.classList.add('hidden');
      if (roleSelector) roleSelector.classList.add('hidden');

      navTexts.forEach(el => el.classList.add('hidden'));
      sectionHeaders.forEach(el => el.classList.add('hidden'));
      badgeCounts.forEach(el => el.classList.add('hidden'));
    } else {
      sidebar.classList.add('w-72');
      sidebar.classList.remove('w-20');
      main.classList.add('md:ml-72');
      main.classList.remove('md:ml-20');
      
      if (sidebarHeader) {
        sidebarHeader.classList.add('px-5', 'justify-between');
        sidebarHeader.classList.remove('px-2', 'justify-center');
      }

      if (logoFull) logoFull.classList.remove('hidden');
      if (logoCollapsed) logoCollapsed.classList.add('hidden');
      if (collapseBtn) collapseBtn.classList.remove('hidden');
      if (roleSelector) roleSelector.classList.remove('hidden');

      navTexts.forEach(el => el.classList.remove('hidden'));
      sectionHeaders.forEach(el => el.classList.remove('hidden'));
      badgeCounts.forEach(el => el.classList.remove('hidden'));
    }
  }

  window.toggleSidebar = function() {
    if (window.innerWidth < 768) {
      if (isMobileSidebarOpen) {
        closeMobileSidebar();
      } else {
        openMobileSidebar();
      }
    } else {
      isCollapsed = !isCollapsed;
      localStorage.setItem('asl_sidebar_collapsed', isCollapsed);
      applySidebarState(isCollapsed);
    }
  };

  // 7. Chuyển đổi vai trò người dùng (Dynamic Role Switcher)
  window.switchRole = function(newRole) {
    currentRole = newRole;
    localStorage.setItem('asl_user_role', newRole);
    syncHeaderProfile(newRole);
    // Cập nhật lại URL với tham số ?role=... và điều hướng để giữ chắc vai trò khi chuyển trang
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('role', newRole);
      window.location.href = url.toString();
    } catch(e) {
      const sidebar = document.getElementById('sidebar');
      if (sidebar) {
        const activeKey = sidebar.getAttribute('data-active') || getActiveMenuKey();
        sidebar.innerHTML = renderSidebarHTML(activeKey);
        applySidebarState(isCollapsed);
      }
    }
  };

  // 8. Tự động đồng bộ ?role= cho mọi link nội bộ trỏ tới .html
  window.withRole = function(url, role = currentRole) {
    if (!url) return url;
    try {
      const u = new URL(url, window.location.href);
      u.searchParams.set('role', role);
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        const basePath = url.split(/[?#]/)[0];
        const search = u.search;
        const hash = u.hash || '';
        return basePath + search + hash;
      }
      return u.toString();
    } catch(e) {
      const sep = url.includes('?') ? '&' : '?';
      return `${url}${sep}role=${role}`;
    }
  };

  function updateLinkRole(a, role = currentRole) {
    if (!a || !a.getAttribute) return;
    const rawHref = a.getAttribute('href');
    if (!rawHref) return;
    if (rawHref.startsWith('#') || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) {
      return;
    }
    if (rawHref.includes('${')) return;

    try {
      const url = new URL(rawHref, window.location.href);
      if (url.origin && window.location.origin && window.location.origin !== 'null' && url.origin !== window.location.origin) {
        return;
      }
      if (url.protocol.startsWith('http') && window.location.protocol.startsWith('http') && url.host !== window.location.host) {
        return;
      }
      if (url.pathname.endsWith('.html')) {
        a.setAttribute('href', window.withRole(rawHref, role));
      }
    } catch (err) {}
  }

  function syncRoleToLinks(role) {
    try {
      const links = document.querySelectorAll('a[href]');
      links.forEach(function(a) {
        updateLinkRole(a, role);
      });
    } catch (e) {}
  }

  // Đồng bộ ?role= ngay lúc người dùng bấm link (hỗ trợ cả link sinh động bằng template JS)
  document.addEventListener('click', function(e) {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (a) {
      updateLinkRole(a, currentRole);
    }
  });

  // 9. Tự động gắn kết (Mount) vào DOM khi trang tải
  function initLayout() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      const activeKey = sidebar.getAttribute('data-active') || getActiveMenuKey();
      sidebar.innerHTML = renderSidebarHTML(activeKey);
    }

    const modularHeader = document.getElementById('modular-header');
    if (modularHeader) {
      const title = modularHeader.getAttribute('data-title');
      const section = modularHeader.getAttribute('data-section');
      const breadcrumb = modularHeader.getAttribute('data-breadcrumb');
      modularHeader.outerHTML = renderHeaderHTML({ title, section, breadcrumb });
    }

    // Khởi tạo backdrop và thiết lập trạng thái sidebar (mặc định đóng ngoài màn hình trên mobile)
    getOrCreateBackdrop();
    applySidebarState(isCollapsed);

    // Đồng bộ thông tin profile người dùng ở header theo vai trò hiện tại
    syncHeaderProfile(currentRole);

    // Tiêm nút Dark Mode toggle và kích hoạt Theme
    injectThemeToggle();
    initTheme();

    // Đồng bộ ?role= cho các liên kết nội trang
    syncRoleToLinks(currentRole);

    // Tự động đóng sidebar trên mobile khi bấm vào link menu điều hướng
    document.addEventListener('click', function(e) {
      if (window.innerWidth < 768 && isMobileSidebarOpen) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar && sidebar.contains(e.target) && e.target.closest('a')) {
          closeMobileSidebar();
        }
      }
    });

    // Lắng nghe thay đổi kích thước màn hình để tự động đồng bộ layout giữa mobile và desktop
    window.addEventListener('resize', function() {
      if (window.innerWidth >= 768) {
        closeMobileSidebar();
        applySidebarState(isCollapsed);
      } else {
        if (!isMobileSidebarOpen) {
          closeMobileSidebar();
        }
      }
    });

    // Keyboard shortcut [ to toggle sidebar, D to toggle dark mode, Escape to close mobile sidebar
    window.addEventListener('keydown', function(e) {
      const tag = document.activeElement.tagName.toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag)) return;

      if (e.key === 'Escape' && isMobileSidebarOpen) {
        closeMobileSidebar();
      } else if (e.key === '[') {
        window.toggleSidebar();
      } else if (e.key === 'd' || e.key === 'D') {
        window.toggleTheme();
      }
    });
  }

  // Khởi động khi DOM sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLayout);
  } else {
    initLayout();
  }

  // Public API cho phép gọi thủ công nếu cần
  window.ASL_LAYOUT = {
    renderSidebarHTML,
    renderHeaderHTML,
    syncHeaderProfile,
    openMobileSidebar,
    closeMobileSidebar,
    applySidebarState,
    switchRole: window.switchRole,
    withRole: window.withRole,
    getBasePath,
    getActiveMenuKey,
    toggleTheme: window.toggleTheme
  };

})();
