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

describe('Quy chuẩn kỹ thuật trung tâm thông báo (brief mục 3, 5, 6)', () => {
  const notifDirs = [
    path.resolve(__dirname, '../../src/components/notifications'),
  ];

  const notifFiles = [
    path.resolve(__dirname, '../../src/hooks/use-notifications.ts'),
    path.resolve(__dirname, '../../src/hooks/use-notifications-live.ts'),
    path.resolve(__dirname, '../../src/types/notifications.ts'),
    path.resolve(__dirname, '../../src/lib/notifications.ts'),
  ];

  function getAllNotifFiles(): string[] {
    const files: string[] = [];
    for (const d of notifDirs) {
      files.push(...getFilesRecursively(d));
    }
    for (const f of notifFiles) {
      if (fs.existsSync(f)) files.push(f);
    }
    return files;
  }

  it('phải có các file mã nguồn thông báo được tạo theo phạm vi brief mục 3', () => {
    const files = getAllNotifFiles();
    expect(
      files.length,
      'Chưa tìm thấy file mã nguồn nào của trung tâm thông báo trong frontend/src'
    ).toBeGreaterThan(0);
  });

  it('các file thuộc phân hệ notifications tuân thủ kebab-case', () => {
    const files = getAllNotifFiles();
    const validFilenameRegex = /^[a-z0-9]+(-[a-z0-9]+)*(\.test|\.spec)?\.(ts|tsx|js|jsx)$/;

    files.forEach((file) => {
      const basename = path.basename(file);
      expect(
        validFilenameRegex.test(basename),
        `File ${basename} không đúng chuẩn kebab-case`
      ).toBe(true);
    });
  });

  it('không sử dụng localStorage hoặc sessionStorage trong toàn bộ code của task (brief mục 5)', () => {
    const files = getAllNotifFiles();
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
          `File ${file} dòng ${idx + 1} vi phạm: sử dụng ${match?.[0]}`
        ).toBeNull();
      });
    });
  });

  it('không sử dụng dangerouslySetInnerHTML trong components/notifications (chống XSS & brief mục 5)', () => {
    const componentDir = path.resolve(__dirname, '../../src/components/notifications');
    const files = getFilesRecursively(componentDir);

    files.forEach((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      expect(
        content.includes('dangerouslySetInnerHTML'),
        `File ${file} sử dụng dangerouslySetInnerHTML vi phạm tiêu chuẩn bảo mật`
      ).toBe(false);
    });
  });

  it('không chứa mã đặc tả SCR-xx, TSK-xx trong chuỗi giao diện hiển thị cho người dùng', () => {
    const files = getAllNotifFiles();
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
          `File ${file} dòng ${idx + 1} chứa mã đặc tả không được hiển thị cho người dùng: "${line.trim()}"`
        ).toBeNull();
      });
    });
  });

  it('không sử dụng emoji trong các nút bấm (button) (brief mục 5)', () => {
    const files = getAllNotifFiles();
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

  it('không cài thêm thư viện ngoài vào package.json (brief mục 6)', () => {
    const packageJsonPath = path.resolve(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const dependencies = Object.keys(pkg.dependencies || {});
    const devDependencies = Object.keys(pkg.devDependencies || {});

    // Danh sách dependency chuẩn ban đầu
    const allowedDeps = [
      '@tanstack/react-query',
      'lucide-react',
      'next',
      'qrcode.react',
      'react',
      'react-dom',
      'zustand',
    ];
    const allowedDevDeps = [
      '@eslint/eslintrc',
      '@testing-library/dom',
      '@testing-library/react',
      '@types/node',
      '@types/react',
      '@types/react-dom',
      '@vitejs/plugin-react',
      'autoprefixer',
      'eslint',
      'eslint-config-next',
      'jsdom',
      'postcss',
      'tailwindcss',
      'typescript',
      'vitest',
    ];

    dependencies.forEach((dep) => {
      expect(allowedDeps, `Phát hiện dependency mới trái phép: ${dep}`).toContain(dep);
    });

    devDependencies.forEach((dep) => {
      expect(allowedDevDeps, `Phát hiện devDependency mới trái phép: ${dep}`).toContain(dep);
    });
  });
});
