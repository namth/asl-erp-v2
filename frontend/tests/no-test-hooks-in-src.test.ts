// Chặn mã "lách test" trong code sản phẩm: code trong src/ không được biết mình đang chạy dưới test runner,
// không được vá thư viện test hay đối tượng nguyên thuỷ của JavaScript. Test nào khó qua → sửa code hoặc báo
// trưởng phòng sửa test, không chèn mã nhận biết môi trường test.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../src');

const FORBIDDEN: Array<[RegExp, string]> = [
  [/@testing-library\//, 'import/require thư viện Testing Library'],
  [/\bvitest\b|@vitest\//, 'tham chiếu vitest'],
  [/\bjsdom\b/, 'nhận biết jsdom'],
  [/expect\s*\.\s*extend/, 'đăng ký matcher của test'],
  [/(RegExp|String|Array|Object|Function|Element|Node|HTMLElement)\.prototype\.\w+\s*=/, 'ghi đè prototype nguyên thuỷ'],
  [/new Error\(\)\s*\.\s*stack/, 'đọc stack trace để đoán ngữ cảnh gọi'],
  [/process\.env\.(VITEST|JEST_WORKER_ID)|NODE_ENV\s*===?\s*['"]test['"]/, 'rẽ nhánh theo môi trường test'],
  [/_patched\w*/, 'cờ đánh dấu đã vá'],
];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(ts|tsx|js|jsx)$/.test(e.name) ? [p] : [];
  });
}

describe('code sản phẩm không chứa mã lách test', () => {
  it('src/ không vá thư viện test, prototype hay nhận biết môi trường test', () => {
    const hits: string[] = [];
    for (const file of walk(SRC)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        for (const [re, why] of FORBIDDEN) {
          if (re.test(line)) hits.push(`${path.relative(SRC, file)}:${i + 1} — ${why}: ${line.trim().slice(0, 100)}`);
        }
      });
    }
    expect(hits, hits.join('\n')).toEqual([]);
  });
});
