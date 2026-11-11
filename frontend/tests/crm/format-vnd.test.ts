import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Import formatVnd từ lib/format (người code sẽ hiện thực)
import { formatVnd } from '@/lib/format';

function getFilesRecursively(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getFilesRecursively(fullPath));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Định dạng tiền tệ VNĐ và Quy chuẩn xử lý tiền tệ (lib/format.ts & brief mục 4, 5)', () => {
  it('định dạng số tiền nguyên chuẩn: "150000000" thành "150.000.000 ₫"', () => {
    expect(formatVnd('150000000')).toBe('150.000.000 ₫');
  });

  it('định dạng số tiền rất lớn (chuỗi lớn): "123456789012" thành "123.456.789.012 ₫"', () => {
    expect(formatVnd('123456789012')).toBe('123.456.789.012 ₫');
  });

  it('định dạng số 0: "0" thành "0 ₫"', () => {
    expect(formatVnd('0')).toBe('0 ₫');
  });

  it('định dạng số tiền có phần thập phân: "1500.50"', () => {
    const formatted = formatVnd('1500.50');
    // Định dạng chấp nhận phần thập phân với dấu phẩy hoặc dấu chấm theo chuẩn hiển thị VN
    expect(formatted).toMatch(/1\.500[,.]50?\s*₫/);
  });

  it('xử lý chuỗi rỗng hoặc undefined/null an toàn: trả về "0 ₫"', () => {
    expect(formatVnd('')).toBe('0 ₫');
    expect(formatVnd('   ')).toBe('0 ₫');
  });

  describe('Kiểm tra quy chuẩn cấm float/Number cho tiền trong frontend/src/**/crm* và lib/format.ts', () => {
    const srcDir = path.resolve(__dirname, '../../src');

    it('không sử dụng parseFloat hoặc Number() để tính toán tiền tệ trong lib/format.ts và crm', () => {
      const files = getFilesRecursively(srcDir).filter(
        (f) => f.includes('/crm') || f.endsWith('format.ts')
      );

      // Nếu chưa có file nào (khi chưa code), test này chờ người code tạo file
      expect(files.length).toBeGreaterThan(0);

      const forbiddenFloatRegex = /\bparseFloat\s*\(/;
      const forbiddenNumberCastRegex = /\bNumber\s*\(\s*(amount|value|contract|expected|milestone|money|vnd|total)/i;

      files.forEach((file) => {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          const trimmed = line.trim();
          if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
            return;
          }
          expect(
            forbiddenFloatRegex.test(line),
            `File ${file} dòng ${idx + 1} sử dụng parseFloat trái quy định: "${trimmed}"`
          ).toBe(false);

          expect(
            forbiddenNumberCastRegex.test(line),
            `File ${file} dòng ${idx + 1} ép kiểu Number() cho tiền tệ trái quy định: "${trimmed}"`
          ).toBe(false);
        });
      });
    });

    it('không lưu trữ dữ liệu khách hàng hoặc cơ hội CRM vào localStorage', () => {
      const files = getFilesRecursively(srcDir).filter(
        (f) => f.includes('/crm') || f.includes('use-crm')
      );

      const forbiddenStorageRegex = /localStorage\.(setItem|getItem|removeItem)\s*\(\s*['"`][^'"`]*(client|customer|opportunity|tax_code|identity)/i;

      files.forEach((file) => {
        const content = fs.readFileSync(file, 'utf-8');
        expect(
          forbiddenStorageRegex.test(content),
          `Phát hiện lưu trữ dữ liệu CRM vào localStorage tại ${file}`
        ).toBe(false);
      });
    });

    it('không chứa mã đặc tả SCR-xx hay TSK-xx trong mã giao diện CRM', () => {
      const files = getFilesRecursively(srcDir).filter((f) => f.includes('/crm'));
      const specCodeRegex = /\b(SCR-\d+|TSK-\d+)\b/;

      files.forEach((file) => {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          const trimmed = line.trim();
          if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
            return;
          }
          expect(
            specCodeRegex.test(line),
            `File ${file} dòng ${idx + 1} chứa mã đặc tả: "${trimmed}"`
          ).toBe(false);
        });
      });
    });

    it('không chứa emoji trong nhãn nút bấm hoặc văn bản hành động CRM', () => {
      const files = getFilesRecursively(srcDir).filter((f) => f.includes('/crm'));
      // Regex phát hiện emoji unicode phổ biến
      const emojiRegex = /[\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

      files.forEach((file) => {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          const trimmed = line.trim();
          // Bỏ qua comment
          if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
            return;
          }
          // Chỉ kiểm tra chuỗi JSX hoặc chuỗi string
          if (trimmed.includes('<button') || trimmed.includes('<Link') || trimmed.includes('label:') || trimmed.includes('title:')) {
            expect(
              emojiRegex.test(trimmed),
              `File ${file} dòng ${idx + 1} chứa emoji trong nút/nhãn: "${trimmed}"`
            ).toBe(false);
          }
        });
      });
    });
  });
});
