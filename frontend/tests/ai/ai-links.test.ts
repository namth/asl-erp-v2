import { describe, it, expect } from 'vitest';
import { isSafeInternalUrl } from '@/lib/ai-links';

describe('Kiểm tra hàm isSafeInternalUrl trong lib/ai-links.ts (brief mục 4 & 5)', () => {
  describe('Đường dẫn nội bộ an toàn (hợp lệ)', () => {
    it('chấp nhận các đường dẫn tương đối bắt đầu bằng một dấu gạch chéo đơn', () => {
      expect(isSafeInternalUrl('/cases/c1')).toBe(true);
      expect(isSafeInternalUrl('/cases/ASL-2026-TM-0012')).toBe(true);
      expect(isSafeInternalUrl('/accounting/inbox')).toBe(true);
      expect(isSafeInternalUrl('/dashboard')).toBe(true);
      expect(isSafeInternalUrl('/')).toBe(true);
    });

    it('chấp nhận đường dẫn nội bộ có query parameters hoặc hash', () => {
      expect(isSafeInternalUrl('/cases/c1?tab=documents&filter=active')).toBe(true);
      expect(isSafeInternalUrl('/settings#profile')).toBe(true);
      expect(isSafeInternalUrl('/finance/commissions?page=2&limit=20#summary')).toBe(true);
    });
  });

  describe('Đường dẫn không an toàn hoặc chứa scheme bên ngoài (phải từ chối)', () => {
    it('từ chối URL giao thức kép // (protocol-relative URL gây open redirect)', () => {
      expect(isSafeInternalUrl('//evil.com')).toBe(false);
      expect(isSafeInternalUrl('//evil.com/phishing')).toBe(false);
      expect(isSafeInternalUrl('///triple-slash.com')).toBe(false);
    });

    it('từ chối giao thức http và https tuyệt đối', () => {
      expect(isSafeInternalUrl('https://example.com')).toBe(false);
      expect(isSafeInternalUrl('https://asllaw.com/cases/c1')).toBe(false);
      expect(isSafeInternalUrl('http://localhost:3000/cases/c1')).toBe(false);
      expect(isSafeInternalUrl('http://127.0.0.1:8000/')).toBe(false);
    });

    it('từ chối giao thức thực thi mã độc javascript, data, vbscript, blob', () => {
      expect(isSafeInternalUrl('javascript:alert(1)')).toBe(false);
      expect(isSafeInternalUrl('javascript:alert(document.cookie)')).toBe(false);
      expect(isSafeInternalUrl('JavaScript:void(0)')).toBe(false);
      expect(isSafeInternalUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
      expect(isSafeInternalUrl('data:text/plain;base64,SGVsbG8=')).toBe(false);
      expect(isSafeInternalUrl('vbscript:msgbox(1)')).toBe(false);
      expect(isSafeInternalUrl('blob:http://localhost:3000/uuid')).toBe(false);
    });

    it('từ chối các scheme thông dụng khác như mailto, tel, ftp, file', () => {
      expect(isSafeInternalUrl('mailto:contact@asllaw.com')).toBe(false);
      expect(isSafeInternalUrl('tel:+84987654321')).toBe(false);
      expect(isSafeInternalUrl('ftp://ftp.asllaw.com')).toBe(false);
      expect(isSafeInternalUrl('file:///etc/passwd')).toBe(false);
    });

    it('từ chối các giá trị rỗng, khoảng trắng hoặc không có dấu gạch chéo đầu', () => {
      expect(isSafeInternalUrl('')).toBe(false);
      expect(isSafeInternalUrl('   ')).toBe(false);
      expect(isSafeInternalUrl('cases/c1')).toBe(false);
      expect(isSafeInternalUrl('relative/path')).toBe(false);
      expect(isSafeInternalUrl(null)).toBe(false);
      expect(isSafeInternalUrl(undefined)).toBe(false);
    });

    it('từ chối các nỗ lực bypass bằng backslash (\\)', () => {
      expect(isSafeInternalUrl('/\\evil.com')).toBe(false);
      expect(isSafeInternalUrl('\\evil.com')).toBe(false);
      expect(isSafeInternalUrl('/\\/evil.com')).toBe(false);
    });
  });
});
