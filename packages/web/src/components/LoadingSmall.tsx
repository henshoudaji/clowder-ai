'use client';

import Image from 'next/image';

export function LoadingSmall({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`relative inline-block ${className}`}>
      <Image src="/loading-small.webp" alt="" fill sizes="16px" className="object-contain" draggable={false} />
    </span>
  );
}
