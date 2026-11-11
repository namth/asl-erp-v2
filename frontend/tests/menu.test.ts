import { describe, it, expect } from 'vitest';
import { getMenu } from '@/lib/menu';

describe('getMenu theo vai trò (DEC-01 & DEC-04)', () => {
  const roles = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'ATTORNEY'] as const;

  it('cả 4 vai trò đều trả về danh sách sections có ít nhất 1 mục', () => {
    roles.forEach((role) => {
      const menu = getMenu(role);
      expect(Array.isArray(menu)).toBe(true);
      expect(menu.length).toBeGreaterThan(0);
      const totalItems = menu.reduce((acc, sec) => acc + (sec.items?.length || 0), 0);
      expect(totalItems).toBeGreaterThan(0);
    });
  });

  it('chấp nhận cả chữ thường và chữ hoa cho role (case-insensitive)', () => {
    const adminUpper = getMenu('ADMIN' as any);
    const adminLower = getMenu('admin' as any);
    expect(adminUpper).toEqual(adminLower);

    const accountantUpper = getMenu('ACCOUNTANT' as any);
    const accountantLower = getMenu('accountant' as any);
    expect(accountantUpper).toEqual(accountantLower);
  });

  it('tất cả các vai trò KHÔNG chứa Chấm công và Cổng khách hàng theo DEC-04', () => {
    roles.forEach((role) => {
      const menu = getMenu(role);
      menu.forEach((sec) => {
        sec.items.forEach((item) => {
          const text = `${item.label} ${item.key || ''} ${item.url || ''}`.toLowerCase();
          expect(text).not.toContain('chấm công');
          expect(text).not.toContain('timesheet');
          expect(text).not.toContain('cổng khách hàng');
          expect(text).not.toContain('client-portal');
        });
      });
    });
  });

  it('ACCOUNTANT (Kế toán) không chứa các mục chuyên môn vụ việc / quy trình / CRM / admin', () => {
    const accountantMenu = getMenu('ACCOUNTANT');
    const allItemKeys = accountantMenu.flatMap((sec) => sec.items.map((item) => item.key || item.url));
    const allItemLabels = accountantMenu.flatMap((sec) => sec.items.map((item) => item.label.toLowerCase()));

    // Không được có tasks, workflows, crm, users, settings, audit-logs
    expect(allItemKeys).not.toContain('tasks');
    expect(allItemKeys).not.toContain('workflows');
    expect(allItemKeys).not.toContain('crm-opportunities');
    expect(allItemKeys).not.toContain('crm-customers');
    expect(allItemKeys).not.toContain('users');
    expect(allItemKeys).not.toContain('settings');
    expect(allItemKeys).not.toContain('audit-logs');

    allItemLabels.forEach((label) => {
      expect(label).not.toContain('quản lý tác vụ');
      expect(label).not.toContain('quản lý quy trình');
      expect(label).not.toContain('cơ hội kinh doanh');
    });

    // Phải có các mục tài chính: Bàn làm việc, Duyệt nhanh, Vụ việc liên quan, Kế toán & Hóa đơn, Quản lý tài chính, Báo cáo
    expect(allItemLabels.some((l) => l.includes('bàn làm việc'))).toBe(true);
    expect(allItemLabels.some((l) => l.includes('duyệt nhanh'))).toBe(true);
    expect(allItemLabels.some((l) => l.includes('vụ việc'))).toBe(true);
    expect(allItemLabels.some((l) => l.includes('kế toán'))).toBe(true);
    expect(allItemLabels.some((l) => l.includes('tài chính'))).toBe(true);
  });

  it('ADMIN có đầy đủ các mục quản trị hệ thống', () => {
    const adminMenu = getMenu('ADMIN');
    const allItemKeys = adminMenu.flatMap((sec) => sec.items.map((item) => item.key || item.url));

    expect(allItemKeys).toContain('workflows');
    expect(allItemKeys).toContain('audit-logs');
    expect(allItemKeys).toContain('users');
    expect(allItemKeys).toContain('settings');
  });

  it('mỗi menu item có đầy đủ cấu trúc: label, url (hoặc href), key (hoặc id), icon', () => {
    const menu = getMenu('ADMIN');
    menu.forEach((sec) => {
      expect(sec.title).toBeDefined();
      expect(sec.items.length).toBeGreaterThan(0);
      sec.items.forEach((item) => {
        expect(typeof item.label).toBe('string');
        expect(item.label.length).toBeGreaterThan(0);
        expect(item.url || (item as any).href).toBeDefined();
      });
    });
  });
});
