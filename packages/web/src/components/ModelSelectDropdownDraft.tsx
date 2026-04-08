'use client';

import { useMemo, useState } from 'react';

const DEFAULT_MODEL_ICON = '/avatars/assistant.svg';

export interface DraftModelOption {
  id: string;
  name: string;
  icon?: string;
  providerGroup?: string;
  experienceText?: string;
  statusText?: string;
  rightLabel?: string;
}

export interface DraftModelOptionGroup {
  id: string;
  label: string;
  items: DraftModelOption[];
}

interface ModelSelectDropdownDraftProps {
  groups: DraftModelOptionGroup[];
  selectedId?: string | null;
  searchPlaceholder?: string;
  onSelect?: (item: DraftModelOption) => void;
}

interface ModelSelectValueDraftProps {
  item?: DraftModelOption | null;
  placeholder?: string;
  loading?: boolean;
}

function SearchIcon() {
  return (
    <svg className="h-3 w-3 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M20 20L16.65 16.65" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="h-4 w-4 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ModelIcon({ item }: { item: DraftModelOption }) {
  const imageSrc = item.icon?.trim() || DEFAULT_MODEL_ICON;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageSrc}
      alt={`${item.name} icon`}
      data-testid={`model-logo-${item.name}`}
      className="h-[18px] w-[18px] shrink-0 object-contain"
    />
  );
}

export function ModelSelectValueDraft({
  item,
  placeholder = '请选择模型',
  loading = false,
}: ModelSelectValueDraftProps) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      {item && !loading ? <ModelIcon item={item} /> : null}
      <span className={`truncate text-[12px] ${item ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
        {loading ? '加载模型中...' : item?.name ?? placeholder}
      </span>
    </span>
  );
}

export function ModelSelectTriggerIcon() {
  return <ChevronDownIcon />;
}

export function ModelSelectDropdownDraft({
  groups,
  selectedId = null,
  searchPlaceholder = '输入关键字搜索',
  onSelect,
}: ModelSelectDropdownDraftProps) {
  const [query, setQuery] = useState('');

  const filteredGroups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return groups;

    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const haystack = [item.name, item.providerGroup, item.experienceText, item.statusText, item.rightLabel]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return haystack.includes(normalized);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  return (
    <div
      className="ui-panel flex max-h-[335px] w-full flex-col overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface-panel)] shadow-[0_10px_24px_rgba(0,0,0,0.09)]"
      data-testid="model-select-dropdown"
    >
      <div className="px-[10px] pb-1 pt-[10px]">
        <label className="ui-field flex h-7 items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--surface-panel)] px-[10px]">
          <SearchIcon />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="ui-input ui-input-plain w-full text-[10px]"
          />
        </label>
      </div>

      <div role="listbox" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-0 pb-2 pt-1">
        {filteredGroups.map((group) => (
          <div key={group.id} className="pt-1">
            <div className="px-4 pb-1 text-[10px] font-medium text-[var(--text-muted)]">{group.label}</div>
            {group.items.map((item) => {
              const isSelected = item.id === selectedId;

              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-testid={`model-row-${item.id}`}
                  onClick={() => onSelect?.(item)}
                  className={`flex min-h-[34px] w-full items-center border-0 px-4 py-1.5 text-left transition-colors ${
                    isSelected
                      ? 'bg-[var(--surface-selected)]'
                      : 'bg-[var(--surface-panel)] hover:bg-[rgb(245,245,245)]'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <ModelIcon item={item} />
                    <div className="min-w-0">
                      <div
                        className={`truncate text-[14px] leading-[20px] text-[var(--text-primary)] ${
                          isSelected ? 'font-medium text-[var(--text-accent)]' : 'font-normal'
                        }`}
                      >
                        {item.name}
                      </div>
                      {item.providerGroup && item.providerGroup !== group.label ? (
                        <div className="truncate text-[11px] text-[var(--text-muted)]">{item.providerGroup}</div>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}

        {filteredGroups.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">没有匹配的模型</div>
        ) : null}
      </div>
    </div>
  );
}
