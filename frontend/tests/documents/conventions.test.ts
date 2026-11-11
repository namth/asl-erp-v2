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

describe('Quy chuẩn kỹ thuật phân hệ Tài liệu (documents) (brief mục 5 & 6)', () => {
  const documentsSrcDirs = [
    path.resolve(__dirname, '../../src/app/(dashboard)/cases/[id]/documents'),
    path.resolve(__dirname, '../../src/components/documents'),
    path.resolve(__dirname, '../../src/hooks/use-documents.ts'),
    path.resolve(__dirname, '../../src/types/documents.ts'),
    path.resolve(__dirname, '../../src/lib/file-rules.ts'),
  ];

  function getDocumentsFiles(): string[] {
    const files: string[] = [];
    for (const p of documentsSrcDirs) {
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

  it('các file thuộc phân hệ documents trong frontend/src tuân thủ kebab-case hoặc chuẩn Next.js', () => {
    const files = getDocumentsFiles();
    expect(files.length, 'Phải có các file mã nguồn documents được tạo').toBeGreaterThan(0);

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
    const files = getDocumentsFiles();
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

  it('không sử dụng localStorage trong phân hệ documents', () => {
    const files = getDocumentsFiles();
    expect(files.length).toBeGreaterThan(0);

    files.forEach((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      expect(
        content.includes('localStorage'),
        `Phát hiện sử dụng localStorage tại ${file}`
      ).toBe(false);
    });
  });

  it('không mở tệp bằng window.open(url) (cần dùng fetch gửi cookie và xử lý 409)', () => {
    const files = getDocumentsFiles();
    expect(files.length).toBeGreaterThan(0);

    files.forEach((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      expect(
        /window\.open\s*\(/i.test(content),
        `File ${file} dùng window.open thay vì fetch download`
      ).toBe(false);
    });
  });

  it('không chứa emoji trong nút (button)', () => {
    const files = getDocumentsFiles();
    expect(files.length).toBeGreaterThan(0);

    // Emoji regex checking buttons
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    files.forEach((file) => {
      if (!file.endsWith('.tsx')) return;
      const content = fs.readFileSync(file, 'utf-8');
      // Tìm các thẻ button hoặc Button component
      const buttonMatches = content.match(/<button[\s\S]*?<\/button>/gi) || [];
      buttonMatches.forEach((btn) => {
        expect(
          emojiRegex.test(btn),
          `Phát hiện emoji trong nút tại ${file}: ${btn.slice(0, 50)}...`
        ).toBe(false);
      });
    });
  });
});
