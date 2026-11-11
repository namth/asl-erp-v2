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

describe('Quy chuẩn kỹ thuật cho module Quản trị Admin (brief mục 5)', () => {
  const adminDirs = [
    path.resolve(__dirname, '../../src/app/(dashboard)/admin'),
    path.resolve(__dirname, '../../src/components/admin'),
  ];
  const adminHookFile = path.resolve(__dirname, '../../src/hooks/use-admin.ts');
  const adminTypesFile = path.resolve(__dirname, '../../src/types/admin.ts');

  function getAllAdminFiles(): string[] {
    const files: string[] = [];
    for (const d of adminDirs) {
      files.push(...getFilesRecursively(d));
    }
    if (fs.existsSync(adminHookFile)) files.push(adminHookFile);
    if (fs.existsSync(adminTypesFile)) files.push(adminTypesFile);
    return files;
  }

  it('không sử dụng localStorage hoặc sessionStorage trong toàn bộ code của task', () => {
    const files = getAllAdminFiles();
    // Khi có code, duyệt kiểm tra
    const forbiddenStorageRegex = /\b(localStorage|sessionStorage)\b/;

    files.forEach((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
          return;
        }
        const match = forbiddenStorageRegex.exec(line);
        expect(
          match,
          `File ${file} dòng ${idx + 1} vi phạm tiêu chuẩn bảo mật: sử dụng ${match?.[0]}`
        ).toBeNull();
      });
    });
  });

  it('không chứa mã đặc tả SCR-xx hoặc TSK-xx trong chuỗi giao diện hiển thị', () => {
    const files = getAllAdminFiles();
    const specCodeRegex = /\b(SCR-\d+|TSK-\d+)\b/;

    files.forEach((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
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
});
