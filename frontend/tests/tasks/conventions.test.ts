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

describe('Quy chuẩn kỹ thuật cho module Tác vụ & Phê duyệt (SCR-09, SCR-10, SCR-16 & brief mục 5, 6)', () => {
  const taskDirs = [
    path.resolve(__dirname, '../../src/app/(dashboard)/cases/[id]/tasks'),
    path.resolve(__dirname, '../../src/app/(dashboard)/approvals'),
    path.resolve(__dirname, '../../src/components/cases/tasks'),
    path.resolve(__dirname, '../../src/components/approvals'),
  ];
  const taskFiles = [
    path.resolve(__dirname, '../../src/hooks/use-tasks.ts'),
    path.resolve(__dirname, '../../src/hooks/use-approvals.ts'),
    path.resolve(__dirname, '../../src/types/tasks.ts'),
    path.resolve(__dirname, '../../src/lib/task-state.ts'),
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
          `File ${file} dòng ${idx + 1} chứa mã đặc tả giao diện không được hiển thị cho người dùng: "${line.trim()}"`
        ).toBeNull();
      });
    });
  });

  it('không sử dụng emoji trong các nút bấm (button)', () => {
    const files = getAllModuleFiles();
    // Bắt các emoji Unicode thông dụng
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    files.forEach((file) => {
      if (!file.endsWith('.tsx')) return;
      const content = fs.readFileSync(file, 'utf-8');
      const buttonMatches = content.match(/<button[\s\S]*?<\/button>/gi) || [];

      buttonMatches.forEach((btn) => {
        const match = emojiRegex.exec(btn);
        expect(
          match,
          `File ${file} chứa emoji "${match?.[0]}" trong nút bấm: ${btn.slice(0, 100)}`
        ).toBeNull();
      });
    });
  });

  it('không cài thêm thư viện kéo-thả ngoài quy định vào package.json', () => {
    const packageJsonPath = path.resolve(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    const forbiddenDndLibs = [
      'react-beautiful-dnd',
      '@hello-pangea/dnd',
      '@dnd-kit/core',
      'react-dnd',
      'sortablejs',
      'react-sortablejs',
    ];

    forbiddenDndLibs.forEach((lib) => {
      expect(
        allDeps[lib],
        `Phát hiện thư viện kéo thả ${lib} trong package.json trái quy định của brief mục 6`
      ).toBeUndefined();
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
