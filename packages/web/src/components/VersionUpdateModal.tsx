import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/utils/api-client';

export interface VersionUpdateModalProps {
  open: boolean;
  onCancel: () => void;
}

interface VersionInfo {
  curversion: string;
  lastversion: string;
  description: string;
  downloadUrl?: string;
  download_url?: string;
}

const VersionUpdateModal: React.FC<VersionUpdateModalProps> = ({ open, onCancel }) => {
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const normalizeVersion = (version: string): number[] =>
    version
      .trim()
      .replace(/^[^\d]*/, '')
      .split(/[.\-+_]/)
      .map((part) => Number.parseInt(part, 10))
      .map((part) => (Number.isFinite(part) ? part : 0));

  const compareVersions = (a: string, b: string): number => {
    const aParts = normalizeVersion(a);
    const bParts = normalizeVersion(b);
    const maxLen = Math.max(aParts.length, bParts.length);
    for (let i = 0; i < maxLen; i += 1) {
      const aVal = aParts[i] ?? 0;
      const bVal = bParts[i] ?? 0;
      if (aVal > bVal) return 1;
      if (aVal < bVal) return -1;
    }
    return 0;
  };

  const checkVersion = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/lastversion');
      const data = (await res.json()) as VersionInfo;
      setVersionInfo(data);
    } catch (error) {
      console.error('获取版本信息失败:', error);
      setVersionInfo(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      checkVersion();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setDownloadProgress(0);
      setIsDownloading(false);
    }
  }, [open]);

  const currentVersion = versionInfo?.curversion ?? '';
  const hasNewVersion =
    !!versionInfo?.lastversion &&
    !!versionInfo?.curversion &&
    compareVersions(versionInfo.lastversion, versionInfo.curversion) > 0;

  const handleDownload = () => {
    const downloadUrl = versionInfo?.downloadUrl || versionInfo?.download_url || '';
    if (!downloadUrl) return;
    setIsDownloading(true);
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setDownloadProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        setIsDownloading(false);
        window.open(downloadUrl, '_blank');
      }
    }, 200);
  };

  const handleCancel = () => {
    setDownloadProgress(0);
    setIsDownloading(false);
    onCancel();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg w-[400px] max-w-[90vw] text-center relative">
        <button className="absolute right-5 top-5 text-gray-400 hover:text-gray-600" onClick={handleCancel}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
        <div className="p-8">
          <div className="flex justify-center mb-6">
            <img src="/images/version.svg" alt="版本更新" className="w-[100px] h-[100px] object-contain" />
          </div>

          <div className="mb-2">
            {isLoading ? (
              <span className="text-base font-bold">检查版本中...</span>
            ) : hasNewVersion ? (
              <span className="text-base font-bold">发现新版本 {versionInfo?.lastversion}</span>
            ) : (
              <span className="text-base font-bold">暂无新版本</span>
            )}
          </div>

          <div className="text-sm text-gray-500 mb-4">当前版本 {currentVersion}</div>

          {hasNewVersion && versionInfo && (
            <div className="text-sm text-gray-600 text-left bg-gray-50 p-4 rounded-lg mb-6 max-h-[150px] overflow-y-auto">
              <pre className="whitespace-pre-wrap font-sans">{versionInfo.description}</pre>
            </div>
          )}

          {isDownloading && (
            <div className="mb-4">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-black h-2 rounded-full transition-all"
                  style={{ width: `${downloadProgress}%` }}
                ></div>
              </div>
              <div className="text-sm text-gray-500 mt-1">下载中... {downloadProgress}%</div>
            </div>
          )}

          {hasNewVersion && !isLoading && (
            <div className="flex justify-end gap-3">
              <button
                className="px-6 py-2 rounded-full border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 transition"
                onClick={handleCancel}
              >
                下次再说
              </button>
              <button
                className="px-6 py-2 rounded-full bg-black text-white font-bold hover:bg-gray-800 transition"
                onClick={handleDownload}
                disabled={isDownloading}
              >
                立即更新
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VersionUpdateModal;
