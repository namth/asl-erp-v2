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

describe('Quy chuẩn kỹ thuật frontend/src (docs/09-conventions.md & brief mục 5)', () => {
  const srcDir = path.resolve(__dirname, '../src');

  it('thư mục frontend/src tồn tại và có các file mã nguồn', () => {
    expect(fs.existsSync(srcDir)).toBe(true);
    const files = getFilesRecursively(srcDir);
    expect(files.length).toBeGreaterThan(0);
  });

  it('tên file và thư mục trong frontend/src tuân thủ kebab-case (hoặc chuẩn Next.js như page.tsx, layout.tsx)', () => {
    const files = getFilesRecursively(srcDir);
    const validFilenameRegex = /^[a-z0-9]+(-[a-z0-9]+)*(\.test|\.spec)?\.(ts|tsx|js|jsx)$|^\[.*\]\.(ts|tsx)$|^page\.(tsx|ts)$|^layout\.(tsx|ts)$|^loading\.(tsx|ts)$|^error\.(tsx|ts)$|^not-found\.(tsx|ts)$|^route\.(ts|js)$/;

    files.forEach((file) => {
      const basename = path.basename(file);
      // Bỏ qua các file chuẩn route / dynamic param của Next.js
      if (basename.startsWith('(') && basename.endsWith(')')) return;
      expect(
        validFilenameRegex.test(basename),
        `File ${basename} không đúng chuẩn kebab-case`
      ).toBe(true);
    });
  });

  it('không có localStorage.setItem lưu token hoặc mật khẩu trong frontend/src', () => {
    const files = getFilesRecursively(srcDir);
    const forbiddenPatterns = [
      /localStorage\.setItem\s*\(\s*['"`][^'"`]*(token|password|auth_token|access_token|refresh_token|reset_token)/i,
      /localStorage\[['"`][^'"`]*(token|password|auth_token|access_token|refresh_token|reset_token)/i,
    ];

    files.forEach((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      forbiddenPatterns.forEach((pattern) => {
        const match = pattern.exec(content);
        expect(
          match,
          `Phát hiện lưu trữ token/mật khẩu vào localStorage tại ${file}: ${match?.[0]}`
        ).toBeNull();
      });
    });
  });

  it('không chứa mã đặc tả SCR-xx hoặc TSK-xx trong chuỗi giao diện hiển thị', () => {
    const files = getFilesRecursively(srcDir);
    const specCodeRegex = /\b(SCR-\d+|TSK-\d+)\b/;

    files.forEach((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        // Cho phép trong comment
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
