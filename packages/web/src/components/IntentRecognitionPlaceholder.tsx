'use client';

import { CatAvatar } from './CatAvatar';
import { LoadingPointStyle } from './LoadingPointStyle';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatRecognitionTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface IntentRecognitionPlaceholderProps {
  catId: string;
  label: string;
  timestamp: number;
  status?: 'pending' | 'stopped';
}

export function IntentRecognitionPlaceholder({
  catId,
  label,
  timestamp,
  status = 'pending',
}: IntentRecognitionPlaceholderProps) {
  return (
    <div data-testid="intent-recognition-placeholder" className="answer-group group flex gap-3 pb-2 pt-1 items-start">
      <CatAvatar catId={catId} size={32} />
      <div className="min-w-0 max-w-[85%] md:max-w-[75%]">
        <div className="mb-1 flex items-center gap-3 text-xs text-[rgb(128_128_128)]">
          <span>{label}</span>
          <span data-testid="intent-recognition-time">{formatRecognitionTimestamp(timestamp)}</span>
        </div>
        <div className="flex items-center gap-3 text-[16px] text-[#1F1F1F] md:text-[18px]">
          {status === 'pending' ? (
            <LoadingPointStyle className="w-4 h-4 flex-shrink-0" />
          ) : (
            <span aria-hidden="true" className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-[#94A3B8]" />
          )}
          <span className="text-[16px]">{status === 'pending' ? '正在识别你的需求...' : '已停止对话'}</span>
        </div>
      </div>
    </div>
  );
}
