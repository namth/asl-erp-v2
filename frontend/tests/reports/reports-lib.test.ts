import { describe, it, expect } from 'vitest';
import {
  defaultRange,
  validateRange,
  formatVnd,
  formatPct,
  barWidths,
  exportFilename,
} from '@/lib/reports';

describe('Thư viện hàm thuần Báo cáo & Thống kê - lib/reports.ts (brief mục 4, 5)', () => {
  describe('defaultRange(today: Date): tính khoảng ngày mặc định từ đầu quý đến hôm nay', () => {
    it('Quý 1: ngày đầu quý (01/01) -> từ 01/01 đến 01/01', () => {
      const today = new Date(2026, 0, 1); // 2026-01-01
      const range = defaultRange(today);
      expect(range).toEqual({
        from: '2026-01-01',
        to: '2026-01-01',
      });
    });

    it('Quý 1: giữa quý (15/02) -> từ 01/01 đến 15/02', () => {
      const today = new Date(2026, 1, 15); // 2026-02-15
      const range = defaultRange(today);
      expect(range).toEqual({
        from: '2026-01-01',
        to: '2026-02-15',
      });
    });

    it('Quý 1: ngày cuối quý (31/03) -> từ 01/01 đến 31/03', () => {
      const today = new Date(2026, 2, 31); // 2026-03-31
      const range = defaultRange(today);
      expect(range).toEqual({
        from: '2026-01-01',
        to: '2026-03-31',
      });
    });

    it('Quý 2: giữa quý (20/05) -> từ 01/04 đến 20/05', () => {
      const today = new Date(2026, 4, 20); // 2026-05-20
      const range = defaultRange(today);
      expect(range).toEqual({
        from: '2026-04-01',
        to: '2026-05-20',
      });
    });

    it('Quý 3: giữa quý (10/08) -> từ 01/07 đến 10/08', () => {
      const today = new Date(2026, 7, 10); // 2026-08-10
      const range = defaultRange(today);
      expect(range).toEqual({
        from: '2026-07-01',
        to: '2026-08-10',
      });
    });

    it('Quý 4: ngày 11/11 (ví dụ trong brief) -> từ 01/10 đến 11/11', () => {
      const today = new Date(2026, 10, 11); // 2026-11-11
      const range = defaultRange(today);
      expect(range).toEqual({
        from: '2026-10-01',
        to: '2026-11-11',
      });
    });

    it('Quý 4: ngày cuối năm (31/12) -> từ 01/10 đến 31/12', () => {
      const today = new Date(2026, 11, 31); // 2026-12-31
      const range = defaultRange(today);
      expect(range).toEqual({
        from: '2026-10-01',
        to: '2026-12-31',
      });
    });
  });

  describe('validateRange(from, to): kiểm tra hợp lệ khoảng thời gian', () => {
    it('khoảng ngày bình thường hợp lệ -> trả về null', () => {
      expect(validateRange('2026-10-01', '2026-11-11')).toBeNull();
      expect(validateRange('2026-01-01', '2026-03-31')).toBeNull();
    });

    it('ngày bắt đầu bằng ngày kết thúc -> hợp lệ (trả về null)', () => {
      expect(validateRange('2026-11-11', '2026-11-11')).toBeNull();
      expect(validateRange('2026-01-01', '2026-01-01')).toBeNull();
    });

    it('ngày bắt đầu sau ngày kết thúc (from > to) -> báo lỗi', () => {
      const errorMsg = 'Ngày bắt đầu phải trước ngày kết thúc';
      expect(validateRange('2026-11-12', '2026-11-11')).toBe(errorMsg);
      expect(validateRange('2027-01-01', '2026-12-31')).toBe(errorMsg);
    });

    it('khoảng 366 ngày tính cả hai đầu (2026-01-01 đến 2027-01-01) -> hợp lệ (trả về null)', () => {
      // 2026 không nhuận có 365 ngày + ngày 2027-01-01 = đúng 366 ngày
      expect(validateRange('2026-01-01', '2027-01-01')).toBeNull();
    });

    it('khoảng 367 ngày tính cả hai đầu (2026-01-01 đến 2027-01-02) -> chặn với lỗi tối đa 366 ngày', () => {
      const maxErrorMsg = 'Khoảng thời gian tối đa 366 ngày';
      expect(validateRange('2026-01-01', '2027-01-02')).toBe(maxErrorMsg);
      expect(validateRange('2025-01-01', '2026-06-01')).toBe(maxErrorMsg);
    });

    it('năm nhuận 2024: 01/01/2024 đến 31/12/2024 là 366 ngày -> nhận; đến 01/01/2025 là 367 ngày -> chặn', () => {
      expect(validateRange('2024-01-01', '2024-12-31')).toBeNull();
      expect(validateRange('2024-01-01', '2025-01-01')).toBe('Khoảng thời gian tối đa 366 ngày');
    });
  });

  describe('formatVnd(s: string): định dạng tiền tệ VND với dấu chấm phân cách hàng nghìn', () => {
    it('định dạng số tiền thông thường chuẩn chuỗi', () => {
      expect(formatVnd('5280000000')).toBe('5.280.000.000 ₫');
      expect(formatVnd('7400000000')).toBe('7.400.000.000 ₫');
      expect(formatVnd('1500000')).toBe('1.500.000 ₫');
    });

    it('hỗ trợ giá trị bằng 0', () => {
      expect(formatVnd('0')).toBe('0 ₫');
    });

    it('xử lý chuỗi số lớn vượt quá Number.MAX_SAFE_INTEGER (2^53 - 1) mà không mất độ chính xác', () => {
      const hugeValue = '12345678901234567890';
      const formatted = formatVnd(hugeValue);
      expect(formatted).toBe('12.345.678.901.234.567.890 ₫');
      expect(formatted).not.toContain('e+');
      expect(formatted).not.toContain('NaN');
    });

    it('định dạng số tròn chục nghìn, trăm nghìn, triệu', () => {
      expect(formatVnd('10000')).toBe('10.000 ₫');
      expect(formatVnd('100000')).toBe('100.000 ₫');
      expect(formatVnd('1000000')).toBe('1.000.000 ₫');
    });
  });

  describe('formatPct(s: string): định dạng tỷ lệ phần trăm với dấu phẩy thập phân và ký hiệu %', () => {
    it('định dạng tỷ lệ phần trăm thập phân sang dấu phẩy', () => {
      expect(formatPct('71.35')).toBe('71,35%');
      expect(formatPct('26.67')).toBe('26,67%');
      expect(formatPct('0.00')).toBe('0,00%');
    });

    it('hỗ trợ tỷ lệ 100% hoặc các giá trị nguyên', () => {
      const pct100 = formatPct('100');
      expect(pct100).toMatch(/^100(,00)?%$/);
    });
  });

  describe('barWidths(values: string[]): tính tỷ lệ bề rộng thanh biểu đồ (0-100)', () => {
    it('tính tỷ lệ phần trăm so với giá trị lớn nhất trong mảng', () => {
      const widths = barWidths(['100', '50', '0']);
      expect(widths).toEqual([100, 50, 0]);
    });

    it('hỗ trợ mảng toàn số 0 -> trả về toàn 0', () => {
      expect(barWidths(['0', '0', '0'])).toEqual([0, 0, 0]);
      expect(barWidths(['0'])).toEqual([0]);
    });

    it('hỗ trợ mảng rỗng -> trả về mảng rỗng', () => {
      expect(barWidths([])).toEqual([]);
    });

    it('xử lý các giá trị tiền tệ lớn bằng BigInt hoặc số an toàn', () => {
      const widths = barWidths(['5000000000', '2500000000', '1250000000']);
      expect(widths).toEqual([100, 50, 25]);
    });

    it('mảng có một phần tử duy nhất lớn hơn 0 -> 100%', () => {
      expect(barWidths(['420000000'])).toEqual([100]);
    });

    it('các phần tử bằng nhau và lớn hơn 0 -> đều bằng 100%', () => {
      expect(barWidths(['300', '300'])).toEqual([100, 100]);
    });
  });

  describe('exportFilename(name, from, to): tạo tên file Excel chuẩn', () => {
    it('tạo đúng tên file với tiền tố bao-cao-, tên báo cáo, khoảng ngày và đuôi .xlsx', () => {
      expect(exportFilename('revenue', '2026-10-01', '2026-11-11')).toBe(
        'bao-cao-revenue-2026-10-01-2026-11-11.xlsx'
      );
      expect(exportFilename('commissions', '2026-01-01', '2026-03-31')).toBe(
        'bao-cao-commissions-2026-01-01-2026-03-31.xlsx'
      );
      expect(exportFilename('operations', '2026-10-01', '2026-11-11')).toBe(
        'bao-cao-operations-2026-10-01-2026-11-11.xlsx'
      );
    });
  });
});
