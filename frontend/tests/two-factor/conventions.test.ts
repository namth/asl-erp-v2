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

describe('Quy chuẩn kỹ thuật TASK-017 2FA & Bảo mật (brief mục 5 & 6)', () => {
  const targetDirs = [
    path.resolve(__dirname, '../../src/app/(dashboard)/account/security'),
    path.resolve(__dirname, '../../src/components/two-factor'),
  ];
  const targetFiles = [
    path.resolve(__dirname, '../../src/hooks/use-two-factor.ts'),
  ];

  function getAllTaskFiles(): string[] {
    const files: string[] = [];
    for (const d of targetDirs) {
      files.push(...getFilesRecursively(d));
    }
    for (const f of targetFiles) {
      if (fs.existsSync(f)) {
        files.push(f);
      }
    }
    return files;
  }

  it('tên file và thư mục tuân thủ kebab-case chuẩn Next.js / React', () => {
    const files = getAllTaskFiles();
    const validFilenameRegex =
      /^[a-z0-9]+(-[a-z0-9]+)*(\.test|\.spec)?\.(ts|tsx|js|jsx)$|^\[.*\]\.(ts|tsx)$|^page\.(tsx|ts)$|^layout\.(tsx|ts)$|^loading\.(tsx|ts)$|^error\.(tsx|ts)$|^not-found\.(tsx|ts)$|^route\.(ts|js)$/;

    files.forEach((file) => {
      const basename = path.basename(file);
      if (basename.startsWith('(') && basename.endsWith(')')) return;
      expect(
        validFilenameRegex.test(basename),
        `File ${basename} không tuân thủ kebab-case`
      ).toBe(true);
    });
  });

  it('KHÔNG lưu token, password, secret hay recovery codes vào localStorage hoặc sessionStorage', () => {
    const files = getAllTaskFiles();
    const forbiddenPatterns = [
      /localStorage\.setItem\s*\(\s*['"`][^'"`]*(token|password|secret|recovery|totp)/i,
      /localStorage\[['"`][^'"`]*(token|password|secret|recovery|totp)/i,
      /sessionStorage\.setItem\s*\(\s*['"`][^'"`]*(token|password|secret|recovery|totp)/i,
      /sessionStorage\[['"`][^'"`]*(token|password|secret|recovery|totp)/i,
    ];

    files.forEach((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      forbiddenPatterns.forEach((pattern) => {
        const match = pattern.exec(content);
        expect(
          match,
          `Phát hiện lưu trữ dữ liệu nhạy cảm vào storage tại ${file}: ${match?.[0]}`
        ).toBeNull();
      });
    });
  });

  it('KHÔNG chứa mã đặc tả SCR-xx hoặc TSK-xx trong chuỗi giao diện hiển thị', () => {
    const files = getAllTaskFiles();
    const specCodeRegex = /\b(SCR-\d+|TSK-\d+)\b/;

    files.forEach((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        // Bỏ qua dòng comment
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

  it('KHÔNG sử dụng emoji trong nút bấm (button) hoặc text nhãn', () => {
    const files = getAllTaskFiles();
    // Regex nhận diện emoji phổ biến
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;

    files.forEach((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
          return;
        }
        // Kiểm tra trong thẻ button
        if (line.includes('<button') || line.includes('Button')) {
          const match = emojiRegex.exec(line);
          expect(
            match,
            `File ${file} dòng ${idx + 1} chứa emoji trong nút bấm: "${line.trim()}"`
          ).toBeNull();
        }
      });
    });
  });
});
