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

describe('Quy chuẩn kỹ thuật phân hệ Báo cáo & Thống kê (brief mục 3, 5, 6)', () => {
  const reportsDirs = [
    path.resolve(__dirname, '../../src/app/(dashboard)/reports'),
    path.resolve(__dirname, '../../src/components/reports'),
  ];

  const reportsFiles = [
    path.resolve(__dirname, '../../src/hooks/use-reports.ts'),
    path.resolve(__dirname, '../../src/types/reports.ts'),
    path.resolve(__dirname, '../../src/lib/reports.ts'),
  ];

  function getAllReportsFiles(): string[] {
    const files: string[] = [];
    for (const d of reportsDirs) {
      files.push(...getFilesRecursively(d));
    }
    for (const f of reportsFiles) {
      if (fs.existsSync(f)) files.push(f);
    }
    return files;
  }

  it('phải có các file mã nguồn Báo cáo & Thống kê được tạo theo phạm vi brief mục 3', () => {
    const files = getAllReportsFiles();
    expect(
      files.length,
      'Chưa tìm thấy file mã nguồn nào của Báo cáo & Thống kê trong frontend/src'
    ).toBeGreaterThan(0);
  });

  it('tên file và thư mục tuân thủ kebab-case hoặc chuẩn Next.js (page.tsx, layout.tsx)', () => {
    const files = getAllReportsFiles();
    expect(files.length).toBeGreaterThan(0);

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

  it('không sử dụng localStorage hoặc sessionStorage (brief mục 4 & 5)', () => {
    const files = getAllReportsFiles();
    expect(files.length).toBeGreaterThan(0);
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

  it('không chứa mã đặc tả SCR-xx, TSK-xx, DEC-xx trong chuỗi giao diện hiển thị', () => {
    const files = getAllReportsFiles();
    expect(files.length).toBeGreaterThan(0);
    const specCodeRegex = /\b(SCR-\d+|TSK-\d+|DEC-\d+)\b/;

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

  it('không chứa emoji trong các nút bấm (button) (brief mục 5)', () => {
    const files = getAllReportsFiles();
    expect(files.length).toBeGreaterThan(0);
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    files.forEach((file) => {
      if (!file.endsWith('.tsx')) return;
      const content = fs.readFileSync(file, 'utf-8');
      const buttonMatches = content.match(/<button[\s\S]*?<\/button>/gi) || [];

      buttonMatches.forEach((btn) => {
        const match = emojiRegex.exec(btn);
        expect(
          match,
          `Nút bấm trong ${file} chứa emoji: "${match?.[0]}"`
        ).toBeNull();
      });
    });
  });

  it('không cài thêm thư viện biểu đồ hay Excel ngoài quy định vào package.json (brief mục 5 & 6)', () => {
    const packageJsonPath = path.resolve(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    const forbiddenLibs = [
      'recharts',
      'chart.js',
      'react-chartjs-2',
      'echarts',
      'echarts-for-react',
      'apexcharts',
      'react-apexcharts',
      'xlsx',
      'exceljs',
      'sheetjs',
      'file-saver',
    ];

    forbiddenLibs.forEach((lib) => {
      expect(
        allDeps[lib],
        `Phát hiện thư viện ${lib} trong package.json trái quy định brief mục 5, 6`
      ).toBeUndefined();
    });
  });

  it('trong lib/reports.ts: không sử dụng Number() hoặc parseFloat() làm mất chính xác chuỗi số lớn', () => {
    const reportsLibFile = path.resolve(__dirname, '../../src/lib/reports.ts');
    if (fs.existsSync(reportsLibFile)) {
      const content = fs.readFileSync(reportsLibFile, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
          return;
        }
        // Cho phép Number() nếu không phải trong logic định dạng tiền tệ hoặc ép số tiền
        // Nhưng theo brief mục 4: "không Number() với số > 2^53; dùng BigInt hoặc thao tác chuỗi"
        if (/formatVnd/.test(content)) {
          // Kiểm tra xem formatVnd có gọi Number(s) không
          const formatVndMatch = content.match(/function\s+formatVnd[\s\S]*?^}/m);
          if (formatVndMatch) {
            expect(
              /Number\s*\(/.test(formatVndMatch[0]),
              `formatVnd trong ${reportsLibFile} không được dùng Number() (dùng BigInt hoặc chuỗi)`
            ).toBe(false);
            expect(
              /parseFloat\s*\(/.test(formatVndMatch[0]),
              `formatVnd trong ${reportsLibFile} không được dùng parseFloat() (dùng BigInt hoặc chuỗi)`
            ).toBe(false);
          }
        }
      });
    }
  });
});
