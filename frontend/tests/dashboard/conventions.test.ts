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

describe('Quy chuẩn kỹ thuật cho module Bàn làm việc & Cài đặt (SCR-02, SCR-20 & brief mục 5, 6)', () => {
  const taskDirs = [
    path.resolve(__dirname, '../../src/app/(dashboard)/settings'),
    path.resolve(__dirname, '../../src/components/dashboard'),
    path.resolve(__dirname, '../../src/components/settings'),
  ];
  const taskFiles = [
    path.resolve(__dirname, '../../src/app/(dashboard)/page.tsx'),
    path.resolve(__dirname, '../../src/hooks/use-my-tasks.ts'),
    path.resolve(__dirname, '../../src/hooks/use-settings.ts'),
  ];

  function getAllModuleFiles(): string[] {
    const files: string[] = [];
    for (const d of taskDirs) {
      files.push(...getFilesRecursively(d));
    }
    for (const f of taskFiles) {
      if (fs.existsSync(f)) files.push(f);
    }
    return files;
  }

  it('các file thuộc module trong frontend/src tuân thủ kebab-case hoặc chuẩn Next.js', () => {
    const files = getAllModuleFiles();
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

  it('không sử dụng localStorage hoặc sessionStorage trong toàn bộ code của task', () => {
    const files = getAllModuleFiles();
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
    const files = getAllModuleFiles();
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

  it('không sử dụng parseFloat hoặc Number cho tỷ lệ hoa hồng trong code của task', () => {
    const files = getAllModuleFiles();
    files.forEach((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
          return;
        }
        // Cho phép Number() nếu là đếm số lượng trang/id/timestamp, nhưng kiểm tra không dùng parseFloat cho tỷ lệ
        expect(
          /parseFloat\s*\(/i.test(line),
          `File ${file} dòng ${idx + 1} không được dùng parseFloat() cho tỷ lệ`
        ).toBe(false);
      });
    });
  });

  it('không chứa emoji trong nhãn của các nút bấm (buttons)', () => {
    const files = getAllModuleFiles();
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/u;

    files.forEach((file) => {
      if (file.endsWith('.tsx')) {
        const content = fs.readFileSync(file, 'utf-8');
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
