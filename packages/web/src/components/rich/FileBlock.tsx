'use client';

import { useMemo, useState } from 'react';
import type { RichFileBlock } from '@/stores/chat-types';
import { apiFetch } from '@/utils/api-client';

const EXT_ICONS: Record<string, string> = {
  pdf: '📄',
  doc: '📝',
  docx: '📝',
  xls: '📊',
  xlsx: '📊',
  ppt: '📎',
  pptx: '📎',
  md: '📋',
  txt: '📋',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isSafeUrl(url: string): boolean {
  return /^\/uploads\//.test(url) || /^\/api\//.test(url) || /^https:\/\//.test(url);
}

function getWorkspaceTarget(block: RichFileBlock): { worktreeId: string; path: string } | null {
  if (block.worktreeId && block.workspacePath) {
    return { worktreeId: block.worktreeId, path: block.workspacePath };
  }
  if (!block.url.startsWith('/api/workspace/download?')) return null;
  const query = block.url.split('?')[1];
  if (!query) return null;
  const params = new URLSearchParams(query);
  const worktreeId = params.get('worktreeId');
  const path = params.get('path');
  return worktreeId && path ? { worktreeId, path } : null;
}

export function FileBlock({ block }: { block: RichFileBlock }) {
  const [isOpening, setIsOpening] = useState(false);
  const ext = block.fileName.split('.').pop()?.toLowerCase() ?? '';
  const icon = EXT_ICONS[ext] ?? '📎';
  const safeHref = isSafeUrl(block.url) ? block.url : undefined;
  const workspaceTarget = useMemo(() => getWorkspaceTarget(block), [block]);
  const isWorkspaceFile = workspaceTarget != null;
  const secondaryText = isWorkspaceFile
    ? ext === 'ppt' || ext === 'pptx'
      ? '本地 PowerPoint 文件'
      : '本地工作区文件'
    : block.fileSize != null
      ? formatFileSize(block.fileSize)
      : block.mimeType ?? '附件';

  async function handleOpen(): Promise<void> {
    if (!workspaceTarget || isOpening) return;
    setIsOpening(true);
    try {
      await apiFetch('/api/workspace/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workspaceTarget),
      });
    } finally {
      setIsOpening(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#E9E5DF] bg-[#FBF9F6] px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#FFF1E8] text-lg text-[#C96A22]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-[#1F2937]">{block.fileName}</div>
        <div className="text-xs text-[#8C8C8C]">{secondaryText}</div>
      </div>
      {isWorkspaceFile ? (
        <button
          type="button"
          onClick={() => {
            void handleOpen();
          }}
          className="inline-flex flex-shrink-0 items-center rounded-full border border-[#D2CDC4] bg-white px-4 py-1.5 text-xs font-medium text-[#3F3B37] transition-colors hover:bg-[#F4F1EC]"
        >
          {isOpening ? '打开中' : '打开'}
        </button>
      ) : (
        <a
          href={safeHref}
          download={safeHref ? block.fileName : undefined}
          className="inline-flex flex-shrink-0 items-center rounded-full border border-[#D2CDC4] bg-white px-4 py-1.5 text-xs font-medium text-[#3F3B37] transition-colors hover:bg-[#F4F1EC]"
        >
          下载
        </a>
      )}
    </div>
  );
}
