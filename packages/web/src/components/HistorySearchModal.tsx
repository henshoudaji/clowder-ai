'use client';

import { KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useInputHistoryStore } from '@/stores/inputHistoryStore';

interface HistorySearchModalProps {
  onSelect: (text: string) => void;
  onClose: () => void;
}

export function HistorySearchModal({ onSelect, onClose }: HistorySearchModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useInputHistoryStore((s) => s.search);

  const results = query ? search(query) : useInputHistoryStore.getState().entries.slice(0, 20);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIdx(0);
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' && results.length > 0 && !e.nativeEvent.isComposing) {
        e.preventDefault();
        onSelect(results[selectedIdx]);
      }
    },
    [results, selectedIdx, onSelect, onClose],
  );

  return (
    <div
      data-testid="history-search"
      className="absolute bottom-full left-0 right-0 mb-1 mx-4 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-20"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
        <span className="text-xs text-gray-400 font-mono">Ctrl+R</span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search history..."
          className="ui-input ui-input-plain flex-1 text-sm"
        />
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs">
          Esc
        </button>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {results.length === 0 && <div className="px-3 py-2 text-xs text-gray-400">No matches</div>}
        {results.map((entry, i) => (
          <button
            key={`${i}-${entry}`}
            className={`w-full text-left px-3 py-1.5 text-sm truncate transition-colors ${
              i === selectedIdx ? 'bg-gray-50 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
            }`}
            onMouseEnter={() => setSelectedIdx(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(entry);
            }}
          >
            {entry}
          </button>
        ))}
      </div>
      <div className="px-3 py-1 text-[10px] text-gray-300 border-t border-gray-100">
        {'\u2191\u2193 \u9009\u62E9 \u00B7 Enter \u786E\u8BA4 \u00B7 Esc \u5173\u95ED'}
      </div>
    </div>
  );
}
