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

describe('Quy chuẩn kỹ thuật phân hệ Vụ việc (cases) (brief mục 5 & 6)', () => {
  const casesSrcDirs = [
    path.resolve(__dirname, '../../src/app/(dashboard)/cases'),
    path.resolve(__dirname, '../../src/components/cases'),
    path.resolve(__dirname, '../../src/hooks/use-cases.ts'),
    path.resolve(__dirname, '../../src/types/cases.ts'),
  ];

  function getCasesFiles(): string[] {
    const files: string[] = [];
    for (const p of casesSrcDirs) {
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

  it('các file thuộc phân hệ cases trong frontend/src tuân thủ kebab-case hoặc chuẩn Next.js', () => {
    const files = getCasesFiles();
    expect(files.length, 'Phải có các file mã nguồn cases được tạo').toBeGreaterThan(0);

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
    const files = getCasesFiles();
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

  it('không sử dụng localStorage trong phân hệ cases', () => {
    const files = getCasesFiles();
    expect(files.length).toBeGreaterThan(0);

    files.forEach((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      expect(
        content.includes('localStorage'),
        `Phát hiện sử dụng localStorage tại ${file}`
      ).toBe(false);
    });
  });

  it('tiền tệ hiển thị phải sử dụng formatVnd (không dùng parseFloat/Number cho hiển thị tiền)', () => {
    const files = getCasesFiles();
    expect(files.length).toBeGreaterThan(0);

    files.forEach((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      // Không được dùng Number(xxx).toLocaleString('vi-VN') để format tiền
      expect(
        /Number\([^)]+\)\.toLocaleString/i.test(content),
        `File ${file} dùng Number().toLocaleString thay vì formatVnd`
      ).toBe(false);
    });
  });
});
