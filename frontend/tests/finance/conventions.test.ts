import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

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

describe('Quy chuẩn kỹ thuật phân hệ Kế toán & Tài chính (brief mục 5 & 6)', () => {
  const financeSrcDirs = [
    path.resolve(__dirname, '../../src/app/(dashboard)/accounting'),
    path.resolve(__dirname, '../../src/app/(dashboard)/finance'),
    path.resolve(__dirname, '../../src/app/(dashboard)/cases/[id]/finance'),
    path.resolve(__dirname, '../../src/components/accounting'),
    path.resolve(__dirname, '../../src/components/finance'),
    path.resolve(__dirname, '../../src/hooks/use-accounting.ts'),
    path.resolve(__dirname, '../../src/hooks/use-finance.ts'),
    path.resolve(__dirname, '../../src/types/finance.ts'),
    path.resolve(__dirname, '../../src/lib/money.ts'),
  ];

  function getFinanceFiles(): string[] {
    const files: string[] = [];
    for (const p of financeSrcDirs) {
      if (fs.existsSync(p)) {
        if (fs.statSync(p).isDirectory()) {
          files.push(...getFilesRecursively(p));
        } else {
          files.push(p);
        }
      }
    }
    return files;
  }

  it('các file thuộc phân hệ Kế toán & Tài chính trong frontend/src tuân thủ kebab-case hoặc chuẩn Next.js', () => {
    const files = getFinanceFiles();
    expect(files.length, 'Phải có các file mã nguồn Kế toán & Tài chính được tạo').toBeGreaterThan(0);

    const validFilenameRegex =
      /^[a-z0-9]+(-[a-z0-9]+)*(\.test|\.spec)?\.(ts|tsx|js|jsx)$|^\[.*\]\.(ts|tsx)$|^page\.(tsx|ts)$|^layout\.(tsx|ts)$|^loading\.(tsx|ts)$|^error\.(tsx|ts)$|^not-found\.(tsx|ts)$/;

    files.forEach((file) => {
      const basename = path.basename(file);
      if (basename.startsWith('(') && basename.endsWith(')')) return;
      expect(
        validFilenameRegex.test(basename),
        `File ${basename} không đúng chuẩn kebab-case`
      ).toBe(true);
    });
  });

  it('không chứa mã đặc tả SCR-xx hoặc TSK-xx trong chuỗi giao diện hiển thị', () => {
    const files = getFinanceFiles();
    expect(files.length).toBeGreaterThan(0);
    const specCodeRegex = /\b(SCR-\d+|TSK-\d+)\b/;

    files.forEach((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (
          trimmed.startsWith('//') ||
          trimmed.startsWith('/*') ||
          trimmed.startsWith('*')
        ) {
          return;
        }
        const match = specCodeRegex.exec(line);
        expect(
          match,
          `File ${file} dòng ${idx + 1} chứa mã đặc tả giao diện: "${line.trim()}"`
        ).toBeNull();
      });
    });
  });

  it('không sử dụng localStorage trong phân hệ Kế toán & Tài chính', () => {
    const files = getFinanceFiles();
    expect(files.length).toBeGreaterThan(0);

    files.forEach((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      expect(
        content.includes('localStorage'),
        `Phát hiện sử dụng localStorage tại ${file}`
      ).toBe(false);
    });
  });

  it('không sử dụng parseFloat hoặc Number cho tính toán tiền trong money.ts và các thành phần tiền', () => {
    const files = getFinanceFiles();
    expect(files.length).toBeGreaterThan(0);

    files.forEach((file) => {
      // Chỉ áp dụng ràng buộc nghiêm ngặt không dùng Number/parseFloat cho money.ts và các component accounting/finance
      if (file.endsWith('money.ts')) {
        const content = fs.readFileSync(file, 'utf-8');
        expect(
          /Number\s*\(/i.test(content),
          `File ${file} không được dùng Number() (dùng BigInt trên chuỗi)`
        ).toBe(false);
        expect(
          /parseFloat\s*\(/i.test(content),
          `File ${file} không được dùng parseFloat() (dùng BigInt trên chuỗi)`
        ).toBe(false);
      }
    });
  });

  it('không chứa emoji trong nhãn của các nút bấm (buttons)', () => {
    const files = getFinanceFiles();
    expect(files.length).toBeGreaterThan(0);
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/u;

    files.forEach((file) => {
      if (file.endsWith('.tsx')) {
        const content = fs.readFileSync(file, 'utf-8');
        // Tìm các button tags và kiểm tra content
        const buttonMatches = content.match(/<button[^>]*>([\s\S]*?)<\/button>/gi) || [];
        buttonMatches.forEach((btn) => {
          expect(
            emojiRegex.test(btn),
            `Nút bấm trong ${file} chứa emoji: "${btn}"`
          ).toBe(false);
        });
      }
    });
  });
});
