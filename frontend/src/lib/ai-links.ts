/**
 * Kiem tra duong dan noi bo an toan
 * Chi chap nhan duong dan tuong doi bat dau bang mot dau gach cheo don '/'
 */
export function isSafeInternalUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return false;
  }

  // Bat buoc bat dau bang '/' va khong bat dau bang '//'
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return false;
  }

  // Khong chua backslash de tranh bypass
  if (trimmed.includes('\\')) {
    return false;
  }

  // Khong chua ky tu dieu khien
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
    return false;
  }

  try {
    const parsed = new URL(trimmed, 'https://internal.test');
    return parsed.origin === 'https://internal.test' && parsed.pathname.startsWith('/');
  } catch {
    return false;
  }
}
