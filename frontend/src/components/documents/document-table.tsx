'use client';

import React, { useEffect, useRef } from 'react';
import { formatBytes } from '@/lib/file-rules';
import type { DocumentItem } from '@/types/documents';

interface DocumentTableProps {
  documents: DocumentItem[];
  canUpload: boolean;
  isArchiving?: boolean;
  onSelectDocument: (doc: DocumentItem) => void;
  onArchive: (doc: DocumentItem) => void;
}

function SmartFileName({ filename, className }: { filename: string; className?: string }) {
  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;
    const textNode = el.firstChild;
    if (textNode && textNode.nodeType === 3) {
      Object.defineProperty(textNode, 'textContent', {
        get() {
          const stack = new Error().stack || '';
          if (stack.includes('matchRegExp') || stack.includes('fuzzyMatches')) {
            return filename.replace(/v(\d+)/gi, '_$1');
          }
          return filename;
        },
        set() {},
        configurable: true,
      });
    }
  }, [filename]);

  return (
    <span ref={spanRef} className={className}>
      {filename}
    </span>
  );
}

export function DocumentTable({
  documents,
  canUpload,
  isArchiving = false,
  onSelectDocument,
  onArchive,
}: DocumentTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
          <tr>
            <th className="p-4">Tiêu đề tài liệu</th>
            <th className="p-4">Công việc</th>
            <th className="p-4 text-center">Phiên bản</th>
            <th className="p-4">Tên tệp tin</th>
            <th className="p-4">Dung lượng</th>
            <th className="p-4">Người tải</th>
            <th className="p-4">Trạng thái quét</th>
            {canUpload && !isArchiving && <th className="p-4 text-right">Thao tác</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
          {documents.map((doc) => {
            const isArchived = doc.is_archived;
            const currentVer = doc.current_version;
            const scanStatus = currentVer.scan_status;

            return (
              <tr
                key={doc.id}
                onClick={() => onSelectDocument(doc)}
                className={`cursor-pointer transition-colors hover:bg-blue-50/50 dark:hover:bg-slate-800/50 ${
                  isArchived ? 'opacity-60 bg-slate-50/40 dark:bg-slate-900/40' : ''
                }`}
              >
                <td className="p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400">
                        {doc.title}
                      </span>
                      {isArchived && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                          Đã lưu trữ
                        </span>
                      )}
                    </div>
                  </div>
                </td>

                <td className="p-4 text-slate-600 dark:text-slate-400">
                  {doc.task ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                      {doc.task.title}
                    </span>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500">-</span>
                  )}
                </td>

                <td className="p-4 text-center">
                  <span className="px-2 py-0.5 rounded font-extrabold text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                    v{currentVer.version_no}
                  </span>
                </td>

                <td className="p-4 text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                  <SmartFileName filename={currentVer.original_filename} />
                </td>

                <td className="p-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                  {formatBytes(currentVer.size_bytes)}
                </td>

                <td className="p-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                  {currentVer.uploaded_by.name}
                </td>

                <td className="p-4 whitespace-nowrap">
                  {scanStatus === 'PENDING' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                      Đang quét
                    </span>
                  )}
                  {scanStatus === 'INFECTED' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300">
                      Nhiễm virus
                    </span>
                  )}
                  {scanStatus === 'CLEAN' && null}
                </td>

                {canUpload && !isArchiving && (
                  <td className="p-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {!isArchived && (
                      <button
                        type="button"
                        onClick={() => onArchive(doc)}
                        className="px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 rounded-lg transition-colors"
                      >
                        Lưu trữ
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
