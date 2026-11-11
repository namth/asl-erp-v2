import { describe, it, expect } from 'vitest';
import { MAX_FILE_BYTES, checkFile, formatBytes } from '@/lib/file-rules';

describe('Kiểm tra quy tắc tệp tin và định dạng dung lượng - lib/file-rules.ts (brief mục 4 & 5)', () => {
  describe('Hằng số MAX_FILE_BYTES', () => {
    it('đúng giới hạn 50 MB = 52.428.800 bytes', () => {
      expect(MAX_FILE_BYTES).toBe(50 * 1024 * 1024);
      expect(MAX_FILE_BYTES).toBe(52428800);
    });
  });

  describe('checkFile - Kiểm tra định dạng và dung lượng tệp', () => {
    it('chấp nhận các định dạng tệp hợp lệ kèm MIME type tương ứng', () => {
      // PDF
      expect(
        checkFile({
          name: 'hop-dong-dich-vu.pdf',
          size: 1024 * 1024,
          type: 'application/pdf',
        })
      ).toEqual({ ok: true });

      // DOCX
      expect(
        checkFile({
          name: 'don-khoi-kien.docx',
          size: 2 * 1024 * 1024,
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        })
      ).toEqual({ ok: true });

      // XLSX
      expect(
        checkFile({
          name: 'bang-ke-chi-phi.xlsx',
          size: 500 * 1024,
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
      ).toEqual({ ok: true });

      // JPG
      expect(
        checkFile({
          name: 'giay-uy-quyen.jpg',
          size: 800 * 1024,
          type: 'image/jpeg',
        })
      ).toEqual({ ok: true });

      // JPEG
      expect(
        checkFile({
          name: 'chung-cu-kem-theo.jpeg',
          size: 900 * 1024,
          type: 'image/jpeg',
        })
      ).toEqual({ ok: true });

      // PNG
      expect(
        checkFile({
          name: 'chu-ky-so.png',
          size: 300 * 1024,
          type: 'image/png',
        })
      ).toEqual({ ok: true });
    });

    it('không phân biệt chữ hoa chữ thường với phần mở rộng tệp (.PDF, .Docx, .XLSX, .PNG)', () => {
      expect(
        checkFile({
          name: 'BAN-SAO-CONG-CHUNG.PDF',
          size: 2048,
          type: 'application/pdf',
        })
      ).toEqual({ ok: true });

      expect(
        checkFile({
          name: 'To-Khai.Docx',
          size: 4096,
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        })
      ).toEqual({ ok: true });

      expect(
        checkFile({
          name: 'Du-Toan.XLSX',
          size: 8192,
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
      ).toEqual({ ok: true });

      expect(
        checkFile({
          name: 'Hinh-Anh.PNG',
          size: 16384,
          type: 'image/png',
        })
      ).toEqual({ ok: true });
    });

    it('chặn phần mở rộng không được phép (.exe, .sh, .bat, .zip) với mã FILE_TYPE_NOT_ALLOWED', () => {
      expect(
        checkFile({
          name: 'trojan.exe',
          size: 1024,
          type: 'application/x-msdownload',
        })
      ).toEqual({ ok: false, code: 'FILE_TYPE_NOT_ALLOWED' });

      expect(
        checkFile({
          name: 'script.sh',
          size: 512,
          type: 'text/x-shellscript',
        })
      ).toEqual({ ok: false, code: 'FILE_TYPE_NOT_ALLOWED' });

      expect(
        checkFile({
          name: 'tailieu.zip',
          size: 2048,
          type: 'application/zip',
        })
      ).toEqual({ ok: false, code: 'FILE_TYPE_NOT_ALLOWED' });
    });

    it('chặn trường hợp giả mạo phần mở rộng: đuôi .pdf nhưng MIME type là application/x-msdownload', () => {
      const result = checkFile({
        name: 'gia-mao-hop-dong.pdf',
        size: 5000,
        type: 'application/x-msdownload',
      });
      expect(result).toEqual({ ok: false, code: 'FILE_TYPE_NOT_ALLOWED' });
    });

    it('chặn trường hợp giả mạo MIME type: đuôi .exe nhưng khai báo MIME type là application/pdf', () => {
      const result = checkFile({
        name: 'virus-doi-mime.exe',
        size: 5000,
        type: 'application/pdf',
      });
      expect(result).toEqual({ ok: false, code: 'FILE_TYPE_NOT_ALLOWED' });
    });

    it('đúng 50 MB (52.428.800 bytes) vẫn chấp nhận', () => {
      const result = checkFile({
        name: 'ho-so-day-du-50mb.pdf',
        size: 52428800,
        type: 'application/pdf',
      });
      expect(result).toEqual({ ok: true });
    });

    it('vượt quá 50 MB đúng 1 byte (52.428.801 bytes) bị chặn với mã FILE_TOO_LARGE', () => {
      const result = checkFile({
        name: 'ho-so-vuot-1-byte.pdf',
        size: 52428801,
        type: 'application/pdf',
      });
      expect(result).toEqual({ ok: false, code: 'FILE_TOO_LARGE' });
    });

    it('tệp dung lượng lớn hơn nhiều so với 50 MB bị chặn với mã FILE_TOO_LARGE', () => {
      const result = checkFile({
        name: 'video-chung-cu.mp4',
        size: 100 * 1024 * 1024,
        type: 'video/mp4',
      });
      // Có thể lỗi type hoặc size, nhưng dung lượng > 50MB phải chặn
      expect(result.ok).toBe(false);
      expect(['FILE_TOO_LARGE', 'FILE_TYPE_NOT_ALLOWED']).toContain((result as any).code);
    });
  });

  describe('formatBytes - Định dạng dung lượng tệp chuẩn tiếng Việt', () => {
    it('định dạng 0 B chính xác', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('định dạng đơn vị B', () => {
      expect(formatBytes(500)).toBe('500 B');
    });

    it('định dạng đơn vị KB', () => {
      expect(formatBytes(482133)).toBe('471 KB');
    });

    it('định dạng đơn vị MB với dấu phẩy thập phân kiểu Việt', () => {
      // 1.258.291 bytes ~ 1,2 MB (1258291 / (1024 * 1024) ≈ 1.2 MB)
      expect(formatBytes(1258291)).toBe('1,2 MB');
    });

    it('định dạng chính xác 50 MB', () => {
      expect(formatBytes(52428800)).toBe('50 MB');
    });
  });
});
