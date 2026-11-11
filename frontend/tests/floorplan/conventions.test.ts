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

describe('Quy chuẩn kỹ thuật phân hệ Văn phòng số trực quan (SCR-15, FEAT-01 & brief mục 5, 6)', () => {
  const floorplanDirs = [
    path.resolve(__dirname, '../../src/app/(dashboard)/operations/floorplan'),
    path.resolve(__dirname, '../../src/components/floorplan'),
  ];

  const floorplanFiles = [
    path.resolve(__dirname, '../../src/hooks/use-floorplan.ts'),
    path.resolve(__dirname, '../../src/hooks/use-floorplan-live.ts'),
    path.resolve(__dirname, '../../src/types/floorplan.ts'),
    path.resolve(__dirname, '../../src/lib/floorplan.ts'),
  ];

  function getAllFloorplanFiles(): string[] {
    const files: string[] = [];
    for (const d of floorplanDirs) {
      files.push(...getFilesRecursively(d));
    }
    for (const f of floorplanFiles) {
      if (fs.existsSync(f)) files.push(f);
    }
    return files;
  }

  it('phải có các file mã nguồn floorplan được tạo theo phạm vi brief mục 3', () => {
    const files = getAllFloorplanFiles();
    expect(
      files.length,
      'Chưa tìm thấy file mã nguồn nào của floorplan trong frontend/src'
    ).toBeGreaterThan(0);
  });

  it('các file thuộc phân hệ floorplan tuân thủ kebab-case hoặc chuẩn Next.js (page.tsx, layout.tsx)', () => {
    const files = getAllFloorplanFiles();
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

  it('không sử dụng localStorage hoặc sessionStorage trong toàn bộ code của task (bảo mật & brief mục 5)', () => {
    const files = getAllFloorplanFiles();
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

  it('không chứa mã đặc tả SCR-xx, TSK-xx, FEAT-xx trong chuỗi giao diện hiển thị cho người dùng', () => {
    const files = getAllFloorplanFiles();
    const specCodeRegex = /\b(SCR-\d+|TSK-\d+|FEAT-\d+)\b/;

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

  it('không sử dụng emoji trong các nút bấm (button) (chỉ huy hiệu trạng thái được phép dùng emoji theo spec)', () => {
    const files = getAllFloorplanFiles();
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

  it('không cài thêm thư viện 3D/canvas ngoài quy định vào package.json (brief mục 6: 2.5D bằng CSS transform)', () => {
    const packageJsonPath = path.resolve(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    const forbidden3dLibs = [
      'three',
      '@types/three',
      '@react-three/fiber',
      '@react-three/drei',
      'pixi.js',
      'phaser',
      'babylonjs',
    ];

    forbidden3dLibs.forEach((lib) => {
      expect(
        allDeps[lib],
        `Phát hiện thư viện 3D/canvas ${lib} trong package.json trái quy định brief mục 6`
      ).toBeUndefined();
    });
  });
});
