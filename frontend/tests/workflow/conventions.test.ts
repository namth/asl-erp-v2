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

describe('Quy chuẩn kỹ thuật cho module Màn hình Thiết kế Quy trình & Ngày nghỉ (SCR-06 & brief mục 5)', () => {
  const workflowDirs = [
    path.resolve(__dirname, '../../src/app/(dashboard)/admin/workflows'),
    path.resolve(__dirname, '../../src/app/(dashboard)/admin/holidays'),
    path.resolve(__dirname, '../../src/components/workflow'),
  ];
  const workflowFiles = [
    path.resolve(__dirname, '../../src/hooks/use-workflows.ts'),
    path.resolve(__dirname, '../../src/types/workflow.ts'),
    path.resolve(__dirname, '../../src/lib/workflow-graph.ts'),
  ];

  function getAllModuleFiles(): string[] {
    const files: string[] = [];
    for (const d of workflowDirs) {
      files.push(...getFilesRecursively(d));
    }
    for (const f of workflowFiles) {
      if (fs.existsSync(f)) files.push(f);
    }
    return files;
  }

  it('không sử dụng localStorage hoặc sessionStorage trong toàn bộ code của task (bảo mật & kiến trúc)', () => {
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
          `File ${file} dòng ${idx + 1} chứa mã đặc tả giao diện không được hiển thị cho người dùng: "${line.trim()}"`
        ).toBeNull();
      });
    });
  });

  it('tên file và thư mục trong module tuân thủ kebab-case (hoặc Next.js conventions)', () => {
    const files = getAllModuleFiles();
    const validFilenameRegex =
      /^[a-z0-9]+(-[a-z0-9]+)*(\.test|\.spec)?\.(ts|tsx|js|jsx)$|^\[.*\]\.(ts|tsx)$|^page\.(tsx|ts)$|^layout\.(tsx|ts)$|^loading\.(tsx|ts)$|^error\.(tsx|ts)$|^not-found\.(tsx|ts)$/;

    files.forEach((file) => {
      const basename = path.basename(file);
      if (basename.startsWith('(') && basename.endsWith(')')) return;
      expect(
        validFilenameRegex.test(basename),
        `File ${basename} không tuân thủ quy ước đặt tên kebab-case`
      ).toBe(true);
    });
  });
});
