import type { NotificationItem } from '@/types/notifications';

/**
 * Trả về chuỗi hiển thị huy hiệu: '' khi n <= 0, '1'..'99', '99+' khi >= 100.
 */
export function badgeText(n: number): string {
  if (n <= 0) {
    return '';
  }
  if (n >= 100) {
    return '99+';
  }
  return String(n);
}

/**
 * Chuyển đổi mốc thời gian ISO sang dạng tương đối:
 * - < 1 phút: 'Vừa xong'
 * - 1..59 phút: 'N phút trước'
 * - Cùng ngày (>= 1 giờ): 'N giờ trước'
 * - Ngày hôm trước: 'Hôm qua'
 * - Cũ hơn hôm qua: 'dd/mm/yyyy'
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const target = new Date(iso);
  const diffMs = now.getTime() - target.getTime();

  if (diffMs < 60 * 1000) {
    return 'Vừa xong';
  }

  if (diffMs < 60 * 60 * 1000) {
    const minutes = Math.floor(diffMs / (60 * 1000));
    return `${minutes} phút trước`;
  }

  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate()
  ).getTime();
  const dayDiff = Math.round((startOfNow - startOfTarget) / (24 * 60 * 60 * 1000));

  if (dayDiff <= 0) {
    const hours = Math.floor(diffMs / (60 * 60 * 1000));
    return `${hours} giờ trước`;
  }

  if (dayDiff === 1) {
    return 'Hôm qua';
  }

  const day = String(target.getDate()).padStart(2, '0');
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const year = target.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Kiểm tra xem đường dẫn có phải đường dẫn nội bộ an toàn hay không.
 * Chỉ nhận đường dẫn bắt đầu bằng '/' và không bắt đầu bằng '//' hoặc '/\'.
 */
export function isSafeInternalLink(link: unknown): boolean {
  if (typeof link !== 'string' || !link) {
    return false;
  }
  if (!link.startsWith('/')) {
    return false;
  }
  if (link.startsWith('//') || link.startsWith('/\\')) {
    return false;
  }
  return true;
}

/**
 * Trộn thông báo mới vào đầu danh sách, bỏ qua nếu trùng id, không sửa mảng đầu vào.
 */
export function mergeIncoming(
  list: NotificationItem[],
  item: NotificationItem
): NotificationItem[] {
  if (!item || !item.id) {
    return list;
  }
  if (list.some((existing) => existing.id === item.id)) {
    return list;
  }
  return [item, ...list];
}
