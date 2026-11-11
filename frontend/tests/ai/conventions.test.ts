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

describe('Quy chuẩn kỹ thuật Trợ lý AI (brief mục 4, 5 & 6)', () => {
  const srcDir = path.resolve(__dirname, '../../src');
  const aiDir = path.join(srcDir, 'components/ai');
  const aiHookFile = path.join(srcDir, 'hooks/use-ai-chat.ts');
  const aiStoreFile = path.join(srcDir, 'stores/ai-drawer-store.ts');
  const aiLibFile = path.join(srcDir, 'lib/ai-links.ts');
  const layoutFile = path.join(srcDir, 'app/(dashboard)/layout.tsx');

  it('không sử dụng localStorage hoặc sessionStorage để lưu session_id hay tin nhắn trong mã nguồn AI', () => {
    const aiFiles = [
      ...getFilesRecursively(aiDir),
      ...(fs.existsSync(aiHookFile) ? [aiHookFile] : []),
      ...(fs.existsSync(aiStoreFile) ? [aiStoreFile] : []),
      ...(fs.existsSync(aiLibFile) ? [aiLibFile] : []),
    ];

    expect(aiFiles.length).toBeGreaterThan(0);

    const storageRegex = /\b(localStorage|sessionStorage)\b/;
    aiFiles.forEach((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
          return;
        }
        const match = storageRegex.exec(line);
        expect(
          match,
          `File ${file} dòng ${idx + 1} vi phạm: Không được dùng localStorage/sessionStorage trong tính năng Trợ lý AI`
        ).toBeNull();
      });
    });
  });

  it('không sử dụng dangerouslySetInnerHTML trong thư mục components/ai (bảo mật XSS)', () => {
    const aiComponents = getFilesRecursively(aiDir);
    expect(aiComponents.length).toBeGreaterThan(0);

    aiComponents.forEach((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      expect(
        content.includes('dangerouslySetInnerHTML'),
        `File ${file} vi phạm: Không được sử dụng dangerouslySetInnerHTML, phải dùng văn bản thuần (plain text)`
      ).toBe(false);
    });
  });

  it('không chứa mã đặc tả SCR-xx hoặc TSK-xx trong chuỗi giao diện hiển thị', () => {
    const aiFiles = [
      ...getFilesRecursively(aiDir),
      ...(fs.existsSync(aiHookFile) ? [aiHookFile] : []),
      ...(fs.existsSync(aiStoreFile) ? [aiStoreFile] : []),
    ];
    const specCodeRegex = /\b(SCR-\d+|TSK-\d+)\b/;

    aiFiles.forEach((file) => {
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
          `File ${file} dòng ${idx + 1} chứa mã đặc tả: "${line.trim()}"`
        ).toBeNull();
      });
    });
  });

  it('không sử dụng emoji trong nhãn nút bấm của các component AI', () => {
    const aiComponents = getFilesRecursively(aiDir);
    // Regex bắt các ký tự emoji phổ biến
    const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/u;

    aiComponents.forEach((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        // Chỉ quét các dòng liên quan tới button hoặc label
        if (line.includes('<button') || line.includes('label:') || line.includes('title=')) {
          const match = emojiRegex.exec(line);
          expect(
            match,
            `File ${file} dòng ${idx + 1} chứa emoji trong nút bấm: "${line.trim()}"`
          ).toBeNull();
        }
      });
    });
  });

  it('layout.tsx gắn nút mở Trợ lý AI và tích hợp component AiChatDrawer', () => {
    expect(fs.existsSync(layoutFile)).toBe(true);
    const layoutContent = fs.readFileSync(layoutFile, 'utf-8');

    // Phải có nút Sparkles hoặc nút Trợ lý AI
    expect(
      layoutContent.includes('Sparkles') ||
      layoutContent.includes('AiChat') ||
      layoutContent.includes('Trợ lý AI') ||
      layoutContent.includes('AiChatDrawer'),
      'layout.tsx phải gắn nút mở Trợ lý AI'
    ).toBe(true);

    // Phải gắn component AiChatDrawer
    expect(
      layoutContent.includes('AiChatDrawer'),
      'layout.tsx phải gắn component <AiChatDrawer />'
    ).toBe(true);
  });
});
