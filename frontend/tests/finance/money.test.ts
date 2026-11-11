import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseMoneyInput, compareMoney, subtractMoney } from '@/lib/money';

describe('Thư viện xử lý tiền tệ chuỗi thập phân - lib/money.ts (brief mục 4 & 5)', () => {
  describe('parseMoneyInput: chuẩn hoá chuỗi nhập tiền thành chuỗi thập phân chuẩn', () => {
    it('chuẩn hoá định dạng có dấu chấm phân cách hàng nghìn thành chuỗi số nguyên', () => {
      expect(parseMoneyInput('30.000.000')).toBe('30000000');
    });

    it('loại bỏ khoảng trắng thừa ở đầu, cuối và giữa các chữ số', () => {
      expect(parseMoneyInput(' 1 500 000 ')).toBe('1500000');
      expect(parseMoneyInput('  500 000  ')).toBe('500000');
    });

    it('chuẩn hoá 1 chữ số thập phân thành 2 chữ số thập phân', () => {
      expect(parseMoneyInput('1500000.5')).toBe('1500000.50');
    });

    it('giữ nguyên định dạng 2 chữ số thập phân hợp lệ', () => {
      expect(parseMoneyInput('1500000.50')).toBe('1500000.50');
      expect(parseMoneyInput('30000000.25')).toBe('30000000.25');
    });

    it('hỗ trợ giá trị bằng 0', () => {
      expect(parseMoneyInput('0')).toBe('0');
      expect(parseMoneyInput('0.00')).toBe('0.00');
    });

    it('xử lý chuỗi tiền lớn với 2 chữ số thập phân', () => {
      expect(parseMoneyInput('999.999.999.999,99')).toMatch(/^999999999999\.99$/);
      expect(parseMoneyInput('999999999999.99')).toBe('999999999999.99');
    });

    it('từ chối chuỗi chứa chữ cái hoặc ký tự không hợp lệ ("abc", "12a34")', () => {
      const invalidInputs = ['abc', '12a34', 'xyz', '---', '$100'];
      for (const input of invalidInputs) {
        let rejected = false;
        try {
          const res = parseMoneyInput(input);
          if (res === null || res === undefined || res === '') {
            rejected = true;
          }
        } catch {
          rejected = true;
        }
        expect(rejected, `Giá trị "${input}" phải bị từ chối`).toBe(true);
      }
    });

    it('từ chối định dạng nhiều dấu phân cách lộn xộn ("1.2.3,45")', () => {
      const invalidInputs = ['1.2.3,45', '1,,200', '1..500', '1.2.3.4.5'];
      for (const input of invalidInputs) {
        let rejected = false;
        try {
          const res = parseMoneyInput(input);
          if (res === null || res === undefined || res === '') {
            rejected = true;
          }
        } catch {
          rejected = true;
        }
        expect(rejected, `Giá trị "${input}" phải bị từ chối`).toBe(true);
      }
    });

    it('từ chối chuỗi có từ 3 chữ số thập phân trở lên ("100.123", "1500000.555")', () => {
      const invalidDecimals = ['100.123', '1500000.555', '30000000.9999'];
      for (const input of invalidDecimals) {
        let rejected = false;
        try {
          const res = parseMoneyInput(input);
          if (res === null || res === undefined || res === '') {
            rejected = true;
          }
        } catch {
          rejected = true;
        }
        expect(rejected, `Giá trị "${input}" có > 2 chữ số thập phân phải bị từ chối`).toBe(true);
      }
    });
  });

  describe('compareMoney: so sánh hai chuỗi tiền tệ thập phân (-1 | 0 | 1)', () => {
    it('trả về -1 khi a < b', () => {
      expect(compareMoney('1000000', '2000000')).toBe(-1);
      expect(compareMoney('1500000.25', '1500000.50')).toBe(-1);
      expect(compareMoney('0', '100')).toBe(-1);
    });

    it('trả về 1 khi a > b', () => {
      expect(compareMoney('2000000', '1000000')).toBe(1);
      expect(compareMoney('1500000.50', '1500000.25')).toBe(1);
      expect(compareMoney('100', '0')).toBe(1);
    });

    it('trả về 0 khi hai số bằng nhau, kể cả khi khác định dạng thập phân', () => {
      expect(compareMoney('30000000', '30000000.00')).toBe(0);
      expect(compareMoney('1500000.5', '1500000.50')).toBe(0);
      expect(compareMoney('0', '0.00')).toBe(0);
      expect(compareMoney('000100', '100')).toBe(0);
    });

    it('so sánh chính xác với số lớn ("999999999999.99") không bị sai số làm tròn float', () => {
      expect(compareMoney('999999999999.99', '999999999999.99')).toBe(0);
      expect(compareMoney('999999999999.99', '999999999999.98')).toBe(1);
      expect(compareMoney('999999999999.98', '999999999999.99')).toBe(-1);
      expect(compareMoney('999999999999999999.99', '999999999999999999.98')).toBe(1);
    });
  });

  describe('subtractMoney: trừ hai chuỗi tiền tệ trả về chuỗi kết quả', () => {
    it('trừ hai số nguyên chính xác', () => {
      const result = subtractMoney('30000000', '10000000');
      expect(compareMoney(result, '20000000')).toBe(0);
    });

    it('trừ hai số có phần thập phân chính xác', () => {
      const result = subtractMoney('100.50', '50.25');
      expect(compareMoney(result, '50.25')).toBe(0);
    });

    it('trừ hai số bằng nhau trả về 0', () => {
      const result = subtractMoney('30000000', '30000000');
      expect(compareMoney(result, '0')).toBe(0);
    });

    it('trừ số lớn không bị sai số làm tròn float', () => {
      const result1 = subtractMoney('999999999999.99', '0.99');
      expect(compareMoney(result1, '999999999900')).toBe(0);

      const result2 = subtractMoney('999999999999.99', '999999999999.98');
      expect(compareMoney(result2, '0.01')).toBe(0);
    });
  });

  describe('Ràng buộc kỹ thuật không sử dụng float/Number/parseFloat trong money.ts', () => {
    it('file lib/money.ts không chứa Number( hoặc parseFloat(', () => {
      const moneyFilePath = path.resolve(__dirname, '../../src/lib/money.ts');
      expect(fs.existsSync(moneyFilePath), 'File src/lib/money.ts phải tồn tại').toBe(true);

      const content = fs.readFileSync(moneyFilePath, 'utf-8');
      expect(
        /Number\s*\(/i.test(content),
        'File lib/money.ts không được dùng Number() (dùng BigInt trên chuỗi)'
      ).toBe(false);
      expect(
        /parseFloat\s*\(/i.test(content),
        'File lib/money.ts không được dùng parseFloat() (dùng BigInt trên chuỗi)'
      ).toBe(false);
    });
  });
});
