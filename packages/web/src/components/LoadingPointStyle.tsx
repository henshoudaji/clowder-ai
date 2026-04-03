'use client';

import Image from 'next/image';

export function LoadingPointStyle({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`relative inline-block ${className}`}>
      <Image src="/loading-point-style.webp" alt="" fill sizes="20px" className="object-contain" draggable={false} />
    </span>
  );
}
