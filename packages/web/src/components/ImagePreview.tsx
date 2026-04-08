'use client';

import { useEffect, useMemo, useState } from 'react';
import { Lightbox } from './Lightbox';

interface ImagePreviewProps {
  files: File[];
  onRemove: (index: number) => void;
}

export function ImagePreview({ files, onRemove }: ImagePreviewProps) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(1)} GB`;
  };

  const getFileExt = (name: string) => {
    const parts = name.split('.');
    if (parts.length <= 1) return '未知';
    return parts[parts.length - 1].toUpperCase();
  };

  // Create object URLs once per file set, revoke on cleanup
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);

  useEffect(() => {
    return () => {
      for (const url of urls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [urls]);

  if (files.length === 0) return null;

  return (
    <>
      <div className="flex gap-2 border-b pt-3 border-gray-100 overflow-visible pb-2 mb-2 mx-4 w-auto">
        {files.map((file, i) => (
          <div key={`${file.name}-${i}`} className="relative inline-flex gap-[10px] py-2 flex-shrink-0 group border border-gray-200 rounded-lg px-2  hover:shadow-md transition-shadow" title={file.name}>
            <img
              src={urls[i]}
              alt={file.name}
              className="w-10 h-10 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => setLightboxIdx(i)}
            />
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setLightboxIdx(i)}>
              <div
                className="truncate max-w-[120px] text-ellipsis overflow-hidden"
                style={{ color: '#191919', fontSize: 12, fontWeight: 400, lineHeight: '18px' }}
                title={file.name}
              >
                {file.name}
              </div>
              <div className="mt-1 text-[12px]" style={{ color: '#808080', fontWeight: 400, lineHeight: '18px' }}>
                <span>{getFileExt(file.name)}</span>
                <span className="mx-2"></span>
                <span>{formatFileSize(file.size)}</span>
              </div>
            </div>
            <button
              onClick={() => onRemove(i)}
              className="hidden group-hover:flex items-center absolute top-0 right-0 transform translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[rgba(0,0,0,0.3)] pb-1 text-white text-xs flex items-center justify-center z-10"
              style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.8)' }}
              title={`移除 ${file.name}`}
              aria-label={`Remove ${file.name}`}
            >
              x
            </button>
          </div>
        ))}
      </div>
      {lightboxIdx !== null && urls[lightboxIdx] && (
        <Lightbox
          url={urls[lightboxIdx]}
          alt={files[lightboxIdx]?.name ?? 'preview'}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </>
  );
}
