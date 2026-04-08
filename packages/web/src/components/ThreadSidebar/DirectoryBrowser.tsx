/**
 * F113 Phase D: Cross-platform directory browser.
 * Replaces macOS-only osascript folder picker with a web-based solution.
 * Calls GET /api/projects/browse to list directories.
 */
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/utils/api-client';

interface BrowseEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface BrowseResult {
  current: string;
  name: string;
  parent: string | null;
  homePath: string;
  entries: BrowseEntry[];
}

interface DirectoryBrowserProps {
  initialPath?: string;
  activeProjectPath?: string;
  onSelect: (path: string) => void;
  onCancel: () => void;
}

function pathToSegments(absPath: string, homePath: string): { label: string; path: string }[] {
  const sep = absPath.includes('\\') ? '\\' : '/';

  if (absPath === homePath || absPath.startsWith(homePath + sep)) {
    const segments: { label: string; path: string }[] = [{ label: 'Home', path: '' }];
    if (absPath === homePath) return segments;

    const relative = absPath.slice(homePath.length + 1);
    if (!relative) return segments;

    const parts = relative.split(/[/\\]/).filter(Boolean);
    let accumulated = homePath;
    for (const part of parts) {
      accumulated += sep + part;
      segments.push({ label: part, path: accumulated });
    }
    return segments;
  }

  const parts = absPath.split(/[/\\]/).filter(Boolean);
  const segments: { label: string; path: string }[] = [];

  let accumulated = absPath.startsWith('/') ? '' : parts[0];
  const startIdx = absPath.startsWith('/') ? 0 : 1;
  for (let i = startIdx; i < parts.length; i++) {
    accumulated += sep + parts[i];
    segments.push({ label: parts[i], path: accumulated });
  }

  return segments;
}

export function DirectoryBrowser({ initialPath, activeProjectPath, onSelect, onCancel }: DirectoryBrowserProps) {
  const [browseResult, setBrowseResult] = useState<BrowseResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pathInput, setPathInput] = useState('');

  const fetchDirectory = useCallback(async (path?: string, fallbackOnForbidden = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const url = path ? `/api/projects/browse?path=${encodeURIComponent(path)}` : '/api/projects/browse';
      const res = await apiFetch(url);
      if (!res.ok) {
        if (fallbackOnForbidden && path && res.status === 403) {
          setInfo('配置路径不可用，已切换到主目录');
          await fetchDirectory(undefined, false);
          return;
        }
        const data = await res.json();
        setError(data.error || 'Failed to browse directory');
        return;
      }
      const data: BrowseResult = await res.json();
      setBrowseResult(data);
      setPathInput(data.current);
    } catch {
      setError('Unable to connect to server');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDirectory(initialPath, !!initialPath);
  }, [fetchDirectory, initialPath]);

  const handlePathSubmit = useCallback(() => {
    const trimmed = pathInput.trim();
    if (trimmed) fetchDirectory(trimmed);
  }, [pathInput, fetchDirectory]);

  const segments = browseResult ? pathToSegments(browseResult.current, browseResult.homePath) : [];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[#EEF2F6] bg-white">
      <div className="flex h-10 flex-shrink-0 items-center gap-1 overflow-x-auto border-b border-[#EEF2F6] bg-white px-5">
        {segments.map((seg, i) => (
          <span key={seg.path || `_${i}`} className="flex flex-shrink-0 items-center gap-1">
            {i > 0 && (
              <svg aria-hidden="true" className="h-3 w-3 text-[#A8B0BD]" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            {i === segments.length - 1 ? (
              <span className="text-xs font-semibold text-[#2E3440]">{seg.label}</span>
            ) : (
              <button
                type="button"
                onClick={() => fetchDirectory(seg.path || undefined)}
                className="text-xs font-medium text-[#5F6775] transition-colors hover:text-[#2E3440] hover:underline"
              >
                {i === 0 && seg.label === 'Home' ? (
                  <span className="flex items-center gap-1">
                    <HomeIcon />
                    {seg.label}
                  </span>
                ) : (
                  seg.label
                )}
              </button>
            )}
          </span>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <span className="animate-pulse text-xs text-[#A8B0BD]">Loading...</span>
          </div>
        )}

        {info && (
          <div className="mb-1 px-3 py-1.5">
            <p className="text-[10px] text-[#5F6775]">{info}</p>
          </div>
        )}

        {error && (
          <div className="mb-1 px-3 py-1.5">
            <p className="text-xs text-red-500">{error}</p>
          </div>
        )}

        {!isLoading && browseResult && browseResult.entries.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-[#A8B0BD]">No subdirectories</span>
          </div>
        )}

        {!isLoading &&
          browseResult?.entries.map((entry) => {
            const isActive = activeProjectPath === entry.path;
            return (
              <button
                key={entry.path}
                type="button"
                onClick={() => fetchDirectory(entry.path)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                  isActive ? 'bg-[#F7F8FA]' : 'hover:bg-[#F7F8FA]'
                }`}
                title={entry.path}
              >
                <FolderIcon className={isActive ? 'text-[#2E3440]' : 'text-[#A8B0BD]'} />
                <span className="flex-1 truncate font-medium text-[#2E3440]">{entry.name}</span>
                {isActive && <span className="flex-shrink-0 text-[10px] text-[#5F6775]">当前项目</span>}
                <svg
                  aria-hidden="true"
                  className="h-3.5 w-3.5 flex-shrink-0 text-[#A8B0BD]"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            );
          })}
      </div>

      <div className="flex-shrink-0 space-y-2 border-t border-[#EEF2F6] px-5 py-3">
        <div className="flex gap-2">
          <TerminalIcon />
          <input
            type="text"
            value={pathInput}
            onChange={(event) => setPathInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) handlePathSubmit();
            }}
            placeholder="Enter path..."
            className="ui-input flex-1 rounded-[6px] px-3 py-2 text-sm"
          />
          {pathInput.trim() && (
            <button
              type="button"
              onClick={handlePathSubmit}
              className="rounded-[6px] border border-[rgb(194,194,194)] bg-white px-2.5 py-2 text-[#5F6775] transition-colors hover:bg-[#F7F8FA]"
              aria-label="Go to path"
            >
              <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 pt-1">
          {browseResult && (
            <span className="flex-1 truncate text-[11px] text-[#5F6775]" title={browseResult.current}>
              {browseResult.current}
            </span>
          )}
          <button type="button" onClick={onCancel} className="ui-button-default">
            取消
          </button>
          <button
            type="button"
            onClick={() => browseResult && onSelect(browseResult.current)}
            disabled={!browseResult}
            className="ui-button-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}

function HomeIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5 text-[#A8B0BD]" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-4 w-4 flex-shrink-0 ${className ?? ''}`}
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <path d="M1 3.5A1.5 1.5 0 012.5 2h3.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.62 4H13.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg aria-hidden="true" className="mt-2.5 h-3.5 w-3.5 text-[#A8B0BD]" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M2 4.25A2.25 2.25 0 014.25 2h11.5A2.25 2.25 0 0118 4.25v11.5A2.25 2.25 0 0115.75 18H4.25A2.25 2.25 0 012 15.75V4.25zM7.664 6.23a.75.75 0 00-1.078 1.04l2.705 2.805-2.705 2.805a.75.75 0 001.078 1.04l3.25-3.37a.75.75 0 000-1.04l-3.25-3.28zM11 13a.75.75 0 000 1.5h3a.75.75 0 000-1.5h-3z"
        clipRule="evenodd"
      />
    </svg>
  );
}
