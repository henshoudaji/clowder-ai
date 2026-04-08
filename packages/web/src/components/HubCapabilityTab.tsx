'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import type { CapabilityBoardItem, CapabilityBoardResponse, CatFamily, ToggleHandler } from './capability-board-ui';
import { CapabilityCard } from './capability-board-ui';
import { useConfirm } from './useConfirm';

const ALL_CATEGORY = '全部';
const UNCATEGORIZED = '其他';
const ALL_SOURCES = 'all';
const SKILL_SEARCH_PLACEHOLDER = '输入关键字搜索、过滤';
const SKILL_SEARCH_ARIA_LABEL = '搜索我的技能';
const SOURCE_FILTER_ARIA_LABEL = '筛选来源';
const IMPORT_LABEL = '导入';
const NO_SEARCH_RESULTS_TITLE = '未找到匹配技能';

function sourceToLabel(source: string): string {
  if (source === 'cat-cafe') return '官方';
  if (source === 'external') return '三方';
  return '未知';
}

export function HubCapabilityTab({
  hideSkillMountStatus,
  onImport,
  refreshSignal,
}: {
  hideSkillMountStatus?: boolean;
  onImport?: () => void;
  refreshSignal?: number;
}) {
  const [items, setItems] = useState<CapabilityBoardItem[]>([]);
  const [catFamilies, setCatFamilies] = useState<CatFamily[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORY);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSource, setActiveSource] = useState(ALL_SOURCES);
  const [toggling, setToggling] = useState<string | null>(null);

  const confirm = useConfirm();

  const fetchCapabilities = useCallback(async () => {
    setError(null);
    try {
      const query = new URLSearchParams();
      query.set('probe', 'true');
      const res = await apiFetch(`/api/capabilities?${query.toString()}`);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        setError((data.error as string) ?? '加载失败');
        return;
      }
      const data = (await res.json()) as CapabilityBoardResponse;
      setItems(data.items);
      setCatFamilies(data.catFamilies);
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCapabilities();
  }, [fetchCapabilities, refreshSignal]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void fetchCapabilities();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchCapabilities]);

  const handleToggle: ToggleHandler = useCallback(
    async (capabilityId, capabilityType, enabled, scope = 'global', catId) => {
      const toggleKey = catId ? `${capabilityType}:${capabilityId}:${catId}` : `${capabilityType}:${capabilityId}`;
      setToggling(toggleKey);
      try {
        const body: Record<string, unknown> = {
          capabilityId,
          capabilityType,
          scope,
          enabled,
        };
        if (catId) body.catId = catId;

        const res = await apiFetch('/api/capabilities', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          setError((data.error as string) ?? `开关失败 (${res.status})`);
          return;
        }
        await fetchCapabilities();
      } catch {
        setError('网络错误');
      } finally {
        setToggling(null);
      }
    },
    [fetchCapabilities],
  );

  const handleUninstall = useCallback(
    async (skillId: string) => {
      const ok = await confirm({
        title: '卸载技能',
        message: `确定要卸载 “${skillId}” 吗？此操作不可恢复。`,
        confirmLabel: '卸载',
        cancelLabel: '取消',
        variant: 'danger',
      });
      if (!ok) return;
      try {
        const res = await apiFetch('/api/skills/uninstall', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: skillId }),
        });
        if (res.ok) {
          await fetchCapabilities();
        }
      } catch {
        // ignore
      }
    },
    [confirm, fetchCapabilities],
  );

  const visibleItems = useMemo(() => items.filter((item) => item.type !== 'mcp'), [items]);
  const skillItems = useMemo(() => visibleItems.filter((item) => item.type === 'skill'), [visibleItems]);
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of skillItems) {
      const category = item.category?.trim() || UNCATEGORIZED;
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return counts;
  }, [skillItems]);
  const categoryTabs = useMemo(() => {
    const tabs = [ALL_CATEGORY];
    const categories = Array.from(categoryCounts.keys());
    const ordered = categories.filter((category) => category !== UNCATEGORIZED);
    if (categories.includes(UNCATEGORIZED)) ordered.push(UNCATEGORIZED);
    tabs.push(...ordered);
    return tabs;
  }, [categoryCounts]);
  const displayedSkillItems = useMemo(() => {
    if (activeCategory === ALL_CATEGORY) return skillItems;
    return skillItems.filter((item) => (item.category?.trim() || UNCATEGORIZED) === activeCategory);
  }, [activeCategory, skillItems]);
  const sourceOptions = useMemo(() => {
    const options = Array.from(new Set(skillItems.map((item) => item.source).filter(Boolean)));
    return [ALL_SOURCES, ...options];
  }, [skillItems]);
  const sourceFilteredItems = useMemo(() => {
    if (activeSource === ALL_SOURCES) return displayedSkillItems;
    return displayedSkillItems.filter((item) => item.source === activeSource);
  }, [activeSource, displayedSkillItems]);
  const normalizedSearchQuery = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery]);
  const filteredDisplayedSkillItems = useMemo(() => {
    if (!normalizedSearchQuery) return sourceFilteredItems;
    return sourceFilteredItems.filter((item) => {
      const sourceLabel = item.source === 'cat-cafe' ? '官方' : item.source === 'external' ? '三方' : '未知';
      const haystack = [item.id, item.description ?? '', item.category ?? '', sourceLabel].join(' ').toLowerCase();
      return haystack.includes(normalizedSearchQuery);
    });
  }, [sourceFilteredItems, normalizedSearchQuery]);

  useEffect(() => {
    if (!categoryTabs.includes(activeCategory)) setActiveCategory(ALL_CATEGORY);
  }, [activeCategory, categoryTabs]);

  if (loading) return <p className="text-sm text-[var(--text-muted)]">加载中...</p>;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {error && <p className="ui-status-error rounded-[var(--radius-md)] px-3 py-2 text-sm">{error}</p>}

      <div data-testid="hub-capability-fixed-header">
        <div className="flex flex-wrap items-center gap-4">
          {categoryTabs.map((category, index) => (
            <div key={category} className="flex items-center">
              {index > 0 ? <div aria-hidden="true" className="mr-4 h-4 w-px self-center bg-[#dbdbdb]" /> : null}
              <button
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`inline-flex min-h-7 items-center leading-none text-sm transition-colors ${
                  activeCategory === category
                    ? 'font-semibold text-[var(--text-primary)]'
                    : 'font-normal text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {category}
              </button>
            </div>
          ))}
        </div>
        <div className="pt-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[20px] font-semibold">{`${activeCategory} (${filteredDisplayedSkillItems.length})`}</p>
            {onImport ? (
              <button
                type="button"
                onClick={onImport}
                className="ui-button-default min-h-[var(--control-height-touch)] shrink-0 sm:min-h-[var(--control-height-sm)]"
              >
                {IMPORT_LABEL}
              </button>
            ) : null}
          </div>
          <div className="py-6">
            <div className="flex items-center gap-2">
              <select
                aria-label={SOURCE_FILTER_ARIA_LABEL}
                value={activeSource}
                onChange={(event) => setActiveSource(event.target.value)}
                className="ui-field h-[28px] min-h-[28px] w-[200px] shrink-0 px-3 py-0 pr-8 text-xs"
              >
                {sourceOptions.map((source) => (
                  <option key={source} value={source}>
                    {source === ALL_SOURCES ? '全部来源' : sourceToLabel(source)}
                  </option>
                ))}
              </select>
              <input
                type="search"
                aria-label={SKILL_SEARCH_ARIA_LABEL}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={SKILL_SEARCH_PLACEHOLDER}
                className="ui-input h-[28px] min-h-[28px] w-full px-3 py-0 text-xs"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" data-testid="hub-capability-scroll-region">
        {filteredDisplayedSkillItems.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredDisplayedSkillItems.map((item) => (
              <CapabilityCard
                key={`${item.type}:${item.id}`}
                item={item}
                catFamilies={catFamilies}
                toggling={toggling}
                onToggle={handleToggle}
                onUninstall={handleUninstall}
                hideSkillMountStatus={hideSkillMountStatus}
              />
            ))}
          </div>
        ) : skillItems.length > 0 ? (
          <h3 className="py-2 text-xs text-[var(--text-muted)]">{NO_SEARCH_RESULTS_TITLE}</h3>
        ) : null}
      </div>

      {skillItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--surface-card-muted)]">
            <svg
              className="h-8 w-8 text-[var(--text-subtle)]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">暂无数据</h3>
        </div>
      )}
    </div>
  );
}
