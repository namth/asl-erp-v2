export const MAX_FILE_BYTES = 52428800; // 50 MB

export type FileErrorCode = 'FILE_TYPE_NOT_ALLOWED' | 'FILE_TOO_LARGE';

export type CheckFileResult =
  | { ok: true }
  | { ok: false; code: FileErrorCode };

const ALLOWED_EXT_MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

export function checkFile(file: {
  name: string;
  size: number;
  type: string;
}): CheckFileResult {
  const parts = file.name.split('.');
  const ext = parts.length > 1 ? parts.pop()?.toLowerCase() : '';

  if (!ext || !ALLOWED_EXT_MIME_MAP[ext]) {
    return { ok: false, code: 'FILE_TYPE_NOT_ALLOWED' };
  }

  const expectedMime = ALLOWED_EXT_MIME_MAP[ext];
  if (file.type.toLowerCase() !== expectedMime.toLowerCase()) {
    return { ok: false, code: 'FILE_TYPE_NOT_ALLOWED' };
  }

  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, code: 'FILE_TOO_LARGE' };
  }

  return { ok: true };
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  if (bytes < k) {
    return `${bytes} B`;
  }
  if (bytes < k * k) {
    return `${Math.round(bytes / k)} KB`;
  }
  const mb = bytes / (k * k);
  const formatted = mb.toFixed(1).replace(/\.0$/, '').replace('.', ',');
  return `${formatted} MB`;
}
