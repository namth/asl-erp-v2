import { describe, it, expect } from 'vitest';
import {
  badgeText,
  relativeTime,
  isSafeInternalLink,
  mergeIncoming,
} from '@/lib/notifications';
import type { NotificationItem } from '@/types/notifications';

describe('Thư viện hàm thuần thông báo (lib/notifications.ts & brief mục 4, 5)', () => {
  describe('badgeText(n)', () => {
    it('trả về chuỗi rỗng khi n = 0 hoặc số âm (không hiển thị huy hiệu)', () => {
      expect(badgeText(0)).toBe('');
      expect(badgeText(-1)).toBe('');
      expect(badgeText(-10)).toBe('');
    });

    it('trả về chuỗi số nguyên khi 1 <= n <= 99', () => {
      expect(badgeText(1)).toBe('1');
      expect(badgeText(5)).toBe('5');
      expect(badgeText(42)).toBe('42');
      expect(badgeText(99)).toBe('99');
    });

    it('trả về "99+" khi n >= 100', () => {
      expect(badgeText(100)).toBe('99+');
      expect(badgeText(101)).toBe('99+');
      expect(badgeText(999)).toBe('99+');
      expect(badgeText(10000)).toBe('99+');
    });
  });

  describe('relativeTime(iso, now)', () => {
    const fixedNow = new Date('2026-11-11T12:00:00.000Z');

    it('trả về "Vừa xong" khi thời gian dưới 1 phút so với now', () => {
      const justNow = new Date('2026-11-11T12:00:00.000Z').toISOString();
      const thirtySecAgo = new Date('2026-11-11T11:59:30.000Z').toISOString();
      const fiftyNineSecAgo = new Date('2026-11-11T11:59:01.000Z').toISOString();

      expect(relativeTime(justNow, fixedNow)).toBe('Vừa xong');
      expect(relativeTime(thirtySecAgo, fixedNow)).toBe('Vừa xong');
      expect(relativeTime(fiftyNineSecAgo, fixedNow)).toBe('Vừa xong');
    });

    it('trả về "N phút trước" khi thời gian từ 1 phút đến dưới 60 phút', () => {
      const oneMinAgo = new Date('2026-11-11T11:59:00.000Z').toISOString();
      const fifteenMinAgo = new Date('2026-11-11T11:45:00.000Z').toISOString();
      const fiftyNineMinAgo = new Date('2026-11-11T11:01:00.000Z').toISOString();

      expect(relativeTime(oneMinAgo, fixedNow)).toBe('1 phút trước');
      expect(relativeTime(fifteenMinAgo, fixedNow)).toBe('15 phút trước');
      expect(relativeTime(fiftyNineMinAgo, fixedNow)).toBe('59 phút trước');
    });

    it('trả về "N giờ trước" khi cùng ngày và từ 1 giờ đến dưới 24 giờ', () => {
      const oneHourAgo = new Date('2026-11-11T11:00:00.000Z').toISOString();
      const sixHoursAgo = new Date('2026-11-11T06:00:00.000Z').toISOString();
      const tenHoursAgo = new Date('2026-11-11T02:00:00.000Z').toISOString();

      expect(relativeTime(oneHourAgo, fixedNow)).toBe('1 giờ trước');
      expect(relativeTime(sixHoursAgo, fixedNow)).toBe('6 giờ trước');
      expect(relativeTime(tenHoursAgo, fixedNow)).toBe('10 giờ trước');
    });

    it('trả về "Hôm qua" khi thời gian rơi vào ngày hôm trước', () => {
      // Ngày hôm qua đối với 2026-11-11 là 2026-11-10
      const yesterday = new Date('2026-11-10T15:30:00.000Z').toISOString();
      expect(relativeTime(yesterday, fixedNow)).toBe('Hôm qua');
    });

    it('trả về "dd/mm/yyyy" khi thời gian cũ hơn hôm qua', () => {
      const oldDate1 = new Date('2026-11-05T08:00:00.000Z').toISOString();
      const oldDate2 = new Date('2025-01-15T10:20:00.000Z').toISOString();

      expect(relativeTime(oldDate1, fixedNow)).toMatch(/^0?5\/11\/2026$/);
      expect(relativeTime(oldDate2, fixedNow)).toMatch(/^15\/0?1\/2025$/);
    });
  });

  describe('isSafeInternalLink(link)', () => {
    it('chấp nhận đường dẫn nội bộ hợp lệ bắt đầu bằng "/"', () => {
      expect(isSafeInternalLink('/cases/c1')).toBe(true);
      expect(isSafeInternalLink('/')).toBe(true);
      expect(isSafeInternalLink('/notifications')).toBe(true);
      expect(isSafeInternalLink('/crm/opportunities/123?tab=info#overview')).toBe(true);
    });

    it('từ chối đường dẫn bắt đầu bằng "//" (protocol-relative URL)', () => {
      expect(isSafeInternalLink('//evil.com')).toBe(false);
      expect(isSafeInternalLink('//evil.com/cases')).toBe(false);
      expect(isSafeInternalLink('///evil.com')).toBe(false);
    });

    it('từ chối đường dẫn bắt đầu bằng "/\\" (bypass qua backslash)', () => {
      expect(isSafeInternalLink('/\\evil.com')).toBe(false);
      expect(isSafeInternalLink('/\\evil.com/path')).toBe(false);
    });

    it('từ chối mọi scheme/protocol (https, http, javascript, data, mailto, vbscript)', () => {
      expect(isSafeInternalLink('https://evil.com')).toBe(false);
      expect(isSafeInternalLink('http://evil.com')).toBe(false);
      expect(isSafeInternalLink('javascript:alert(1)')).toBe(false);
      expect(isSafeInternalLink('javascript:void(0)')).toBe(false);
      expect(isSafeInternalLink('data:text/html;base64,...')).toBe(false);
      expect(isSafeInternalLink('mailto:attacker@evil.com')).toBe(false);
      expect(isSafeInternalLink('vbscript:msgbox(1)')).toBe(false);
    });

    it('từ chối chuỗi rỗng, đường dẫn tương đối không bắt đầu bằng "/", hoặc giá trị không hợp lệ', () => {
      expect(isSafeInternalLink('')).toBe(false);
      expect(isSafeInternalLink('cases/c1')).toBe(false);
      expect(isSafeInternalLink('evil.com')).toBe(false);
      expect(isSafeInternalLink(null as any)).toBe(false);
      expect(isSafeInternalLink(undefined as any)).toBe(false);
    });
  });

  describe('mergeIncoming(list, item)', () => {
    const item1: NotificationItem = {
      id: 'notif-1',
      kind: 'TASK_DUE_SOON',
      title: 'Hạn chót task',
      body: 'Task sắp đến hạn hoàn thành',
      link: '/cases/c-1/tasks/t-1',
      created_at: '2026-11-11T10:00:00Z',
      read_at: null,
    };

    const item2: NotificationItem = {
      id: 'notif-2',
      kind: 'APPROVAL_REQUESTED',
      title: 'Yêu cầu duyệt mới',
      body: 'Có một yêu cầu phê duyệt mới',
      link: '/approvals/a-2',
      created_at: '2026-11-11T10:30:00Z',
      read_at: null,
    };

    const item3: NotificationItem = {
      id: 'notif-3',
      kind: 'PAYMENT_CONFIRMED',
      title: 'Thanh toán thành công',
      body: 'Đợt 1 đã được xác nhận',
      link: '/finance/invoices',
      created_at: '2026-11-11T11:00:00Z',
      read_at: null,
    };

    it('thêm phần tử mới lên đầu danh sách', () => {
      const initialList = [item2, item1];
      const result = mergeIncoming(initialList, item3);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('notif-3');
      expect(result[1].id).toBe('notif-2');
      expect(result[2].id).toBe('notif-1');
    });

    it('bỏ qua phần tử nếu id đã tồn tại trong danh sách (không trùng lặp)', () => {
      const initialList = [item2, item1];
      const duplicateItem: NotificationItem = {
        ...item1,
        title: 'Tiêu đề cập nhật',
      };

      const result = mergeIncoming(initialList, duplicateItem);
      expect(result).toHaveLength(2);
      expect(result.map((n) => n.id)).toEqual(['notif-2', 'notif-1']);
    });

    it('không làm đột biến (mutate) mảng đầu vào (immutability)', () => {
      const initialList = [item1];
      const initialCopy = [...initialList];

      const result = mergeIncoming(initialList, item2);
      expect(result).not.toBe(initialList);
      expect(initialList).toEqual(initialCopy);
    });

    it('xử lý chính xác khi danh sách ban đầu là mảng rỗng', () => {
      const result = mergeIncoming([], item1);
      expect(result).toEqual([item1]);
    });
  });
});
