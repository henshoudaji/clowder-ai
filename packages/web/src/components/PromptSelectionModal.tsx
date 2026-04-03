'use client';

import { useEffect, useMemo, useState } from 'react';
import { MarkdownContent } from './MarkdownContent';

export interface PromptSelectionItem {
  id: string;
  title: string;
  dexcription: string;
  content: string;
}

interface PromptSelectionModalProps {
  open: boolean;
  items: PromptSelectionItem[];
  initialSelectedId?: string | null;
  title?: string;
  searchPlaceholder?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (item: PromptSelectionItem) => void;
}

const MODAL_WIDTH = 900;
const MODAL_HEIGHT = 564;
const CONTENT_HEIGHT = 380;
const LIST_WIDTH = 240;
const DETAIL_WIDTH = 596;

function SearchIcon() {
  return (
    <svg className="h-4 w-4 text-[#A5ADBA]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M20 20L16.65 16.65" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="h-[18px] w-[18px] text-[#7A8290]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 11A8 8 0 1 0 17.66 16.66"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M20 4V11H13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-[18px] w-[18px] text-[#97A0AE]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6L18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function PromptDetailContent({ item }: { item: PromptSelectionItem }) {
  return (
    <div className="h-full overflow-y-auto">
      <MarkdownContent
        content={item.content}
        className="text-[12px] leading-7 text-[#2E3542] [&_h1]:mb-3 [&_h1]:text-[16px] [&_h1]:font-semibold [&_h2]:mb-3 [&_h2]:text-[16px] [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:text-[16px] [&_h3]:font-semibold [&_ul]:mb-3 [&_li]:text-[#555E6D] [&_p]:text-[#555E6D]"
        disableCommandPrefix
      />
    </div>
  );
}

function buildItemSummary(item: PromptSelectionItem): string {
  const summary = item.dexcription.trim();
  if (summary) return summary;

  return item.content
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>#-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSearchFields(item: PromptSelectionItem): string[] {
  return [item.id, item.title, item.dexcription, item.content];
}

function promptItemMatchesQuery(item: PromptSelectionItem, query: string): boolean {
  const lowered = query.toLowerCase();
  return buildSearchFields(item).some((field) => field.toLowerCase().includes(lowered));
}

export function PromptSelectionModal({
  open,
  items,
  initialSelectedId = null,
  title = '灵魂模板',
  searchPlaceholder = '输入关键字搜索',
  cancelLabel = '取消',
  confirmLabel = '插入',
  onClose,
  onConfirm,
}: PromptSelectionModalProps) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedId(initialSelectedId ?? items[0]?.id ?? null);
  }, [initialSelectedId, items, open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  const filteredItems = useMemo(() => {
    const normalized = normalizeSearch(query);
    if (!normalized) return items;

    return items.filter((item) => promptItemMatchesQuery(item, normalized));
  }, [items, query]);

  const selectedItem = useMemo(() => {
    if (filteredItems.length === 0) return null;
    return filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0];
  }, [filteredItems, selectedId]);

  useEffect(() => {
    if (!open) return;
    if (!selectedItem) {
      setSelectedId(null);
      return;
    }
    if (selectedItem.id !== selectedId) {
      setSelectedId(selectedItem.id);
    }
  }, [open, selectedId, selectedItem]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-6 py-8"
      data-testid="prompt-selection-modal"
    >
      <div
        className="flex w-full max-w-[900px] flex-col overflow-hidden rounded-[8px] bg-white p-6 shadow-[0_16px_48px_rgba(15,23,42,0.16)]"
        style={{ width: MODAL_WIDTH, height: MODAL_HEIGHT }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-semibold leading-none text-[#1F2329]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 transition hover:bg-[#F5F7FB]"
            aria-label="关闭提示词选择"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-3">
            <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-[6px] border border-[#D9E0EA] bg-white px-3">
              <SearchIcon />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="w-full border-0 bg-transparent text-[13px] text-[#262626] outline-none placeholder:text-[#A5ADBA]"
                data-testid="prompt-search-input"
              />
            </label>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[#D9E0EA] bg-white transition hover:bg-[#F7F9FC]"
              aria-label="刷新模板"
            >
              <RefreshIcon />
            </button>
          </div>

          <div className="mt-4 flex min-h-0 " style={{ height: CONTENT_HEIGHT }}>
            <aside
              className="flex shrink-0 flex-col gap-2 overflow-x-hidden overflow-y-auto rounded-[10px]  bg-white p-0.5"
              style={{ width: LIST_WIDTH, height: CONTENT_HEIGHT }}
            >
              {filteredItems.length === 0 ? (
                <div className="rounded-[10px] border border-[#EDF1F6] bg-[#fafafa] px-3 py-4 text-[12px] text-[#8C8C8C]">
                  没有匹配的提示词
                </div>
              ) : (
                filteredItems.map((item) => {
                  const isSelected = item.id === selectedItem?.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={`block h-[68px] min-h-[68px] w-full shrink-0 overflow-hidden rounded-[8px] p-3 text-left transition ${
                        isSelected
                          ? 'border border-[#1476ff] bg-white shadow-[0_4px_12px_rgba(134,177,255,0.12)]'
                          : 'border border-[#f0f0f0] bg-[#fafafa] hover:bg-white'
                      }`}
                      data-testid={`prompt-list-item-${item.id}`}
                    >
                      <div className="flex h-full min-w-0 w-full flex-col justify-center overflow-hidden">
                        <div className="h-[22px] w-full truncate text-[14px] font-semibold leading-[22px] text-[#303744]">
                          {item.title}
                        </div>
                        <div className="mt-1 h-[18px] w-full truncate overflow-hidden text-[12px] leading-[18px] text-[#969EAA]">
                          {buildItemSummary(item)}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </aside>

            <section
              data-testid="prompt-detail-panel"
              className="flex min-h-0 flex-col overflow-hidden rounded-[10px] border border-[#E7ECF3] bg-white p-4 flex-1"
              style={{ width: DETAIL_WIDTH, height: CONTENT_HEIGHT }}
            >
              {selectedItem ? (
                <PromptDetailContent item={selectedItem} />
              ) : (
                <div className="flex h-full items-center justify-center text-[13px] text-[#8C8C8C]">请选择左侧提示词</div>
              )}
            </section>
          </div>

          <div className="mt-3 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-7 min-w-[84px] rounded-full border border-[#C9D1DC] bg-white px-4 text-[14px] font-normal text-[#202020] transition hover:bg-[#FAFAFA]"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => selectedItem && onConfirm(selectedItem)}
              disabled={!selectedItem}
              className="h-7 min-w-[84px] rounded-full bg-[#1F2430] px-4 text-[14px] font-normal text-white transition hover:bg-[#111111] disabled:cursor-not-allowed disabled:bg-[#BFBFBF]"
              data-testid="prompt-confirm-button"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

