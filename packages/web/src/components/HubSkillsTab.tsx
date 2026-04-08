'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import styles from './HubSkillsTab.module.css';
import { InfoTooltip, OverflowTooltip } from './InfoTooltip';
import { NameInitialIcon } from './NameInitialIcon';

interface SearchSkill {
  id: string;
  slug: string;
  name: string;
  description: string;
  tags: string[];
  stars?: number;
  repo: { githubOwner: string; githubRepoName: string };
  isInstalled: boolean;
}

interface SearchResult {
  skills: SearchSkill[];
  total: number;
  page: number;
  hasMore: boolean;
}

type InstallStatus = 'installing' | string;
type ViewMode = 'browse' | 'search';

const GENERAL_CATEGORY = '通用技能';
const INSTALLING_LABEL = '安装中...';
const INSTALL_FAILED_LABEL = '安装失败';
const INSTALL_LABEL = '安装';
const NO_RESULTS_LABEL = '未找到匹配的技能';
const FALLBACK_DESCRIPTION = '暂未提供技能描述。';
const INSTALLED_LABEL = '已安装';
const SEARCH_PLACEHOLDER = '输入关键字搜索、过滤';
const SEARCH_ARIA_LABEL = '搜索技能';
const LOADING_LABEL = '加载中...';
const ALL_CATEGORY = '全部';
const PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 300;

const CATEGORY_MAP: Record<string, string> = {
  'ai-intelligence': 'AI 智能',
  'developer-tools': '开发工具',
  productivity: '效率提升',
  'content-creation': '内容创作',
  'data-analysis': '数据分析',
  'security-compliance': '安全合规',
  'communication-collaboration': '沟通协作',
};

function normalizeCategory(cat: string): string {
  return CATEGORY_MAP[cat] ?? cat;
}

function resolveCategoryParam(category: string): string | null {
  if (!category || category === ALL_CATEGORY) return null;
  return Object.entries(CATEGORY_MAP).find(([, zh]) => zh === category)?.[0] ?? category;
}

function getSkillCategory(skill: SearchSkill): string {
  const primaryTag = skill.tags.find((tag) => tag.trim().length > 0);
  return primaryTag ? primaryTag.replace(/[-_]/g, ' ') : GENERAL_CATEGORY;
}

function InstallButton({
  slug,
  owner,
  repo,
  status,
  onInstall,
}: {
  slug: string;
  owner: string;
  repo: string;
  status: InstallStatus | undefined;
  onInstall: (owner: string, repo: string, skill: string) => void;
}) {
  if (status === 'installing') {
    return (
      <button type="button" disabled className={`${styles.installButton} ${styles.installButtonMuted}`}>
        {INSTALLING_LABEL}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onInstall(owner, repo, slug)}
      className={`${styles.installButton} ${styles.installButtonPrimary}`}
    >
      {INSTALL_LABEL}
    </button>
  );
}

function SkillList({
  results,
  installStatus,
  onInstall,
}: {
  results: SearchResult;
  installStatus: Map<string, InstallStatus>;
  onInstall: (owner: string, repo: string, skill: string) => void;
}) {
  if (results.skills.length === 0) {
    return <p className="py-2 text-xs text-[var(--text-muted)]">{NO_RESULTS_LABEL}</p>;
  }

  return (
    <div className="space-y-4">
      <div className={styles.skillGrid}>
        {results.skills.map((skill) => {
          const resolvedDescription = skill.description.trim() || FALLBACK_DESCRIPTION;

          return (
            <article key={skill.id} className={`ui-card ui-card-hover ${styles.card}`}>
              <div className={styles.header}>
                <NameInitialIcon name={skill.slug} />
                <div className={styles.content}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <OverflowTooltip
                        content={skill.slug}
                        className="min-w-0"
                        as="h3"
                        textClassName={`${styles.title} block truncate`}
                      />
                      <div className="mt-1 flex flex-wrap items-center gap-2 leading-[18px] text-[var(--text-secondary)] text-xs">
                        <span className="ui-badge-muted">{getSkillCategory(skill)}</span>
                        {skill.stars !== undefined ? (
                          <span className="inline-flex items-center gap-1 text-[var(--text-muted)]">
                            <svg aria-hidden="true" className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
                              <path d="M6 1.2 7.55 4.3l3.45.5-2.5 2.45.6 3.45L6 9.1l-3.1 1.6.6-3.45L1 4.8l3.45-.5L6 1.2Z" />
                            </svg>
                            <span>{skill.stars}</span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <InfoTooltip content={resolvedDescription} className="w-full">
                <p className={styles.description}>{resolvedDescription}</p>
              </InfoTooltip>

              <div className={styles.footer}>
                {!skill.isInstalled ? (
                  <div className="shrink-0">
                    <InstallButton
                      slug={skill.slug}
                      owner={skill.repo.githubOwner}
                      repo={skill.repo.githubRepoName}
                      status={installStatus.get(skill.slug)}
                      onInstall={onInstall}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled
                    className={`${styles.installButton} ${styles.installButtonSuccess} shrink-0`}
                  >
                    {INSTALLED_LABEL}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function HubSkillsTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>('browse');
  const [installStatus, setInstallStatus] = useState<Map<string, InstallStatus>>(new Map());
  const statusTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORY);
  const [displayCategory, setDisplayCategory] = useState(ALL_CATEGORY);
  const [categories, setCategories] = useState<string[]>([]);
  const latestQueryRef = useRef('');
  const requestSeqRef = useRef(0);
  const activeAbortRef = useRef<AbortController | null>(null);
  const searchEffectReadyRef = useRef(false);

  const loadCategories = useCallback(async () => {
    try {
      const res = await apiFetch('/api/skills/categories');
      if (res.ok) {
        const data = (await res.json()) as { categories: string[] };
        setCategories(data.categories.map(normalizeCategory));
      }
    } catch {
      // ignore error
    }
  }, []);

  const buildSkillsUrl = useCallback((mode: ViewMode, page: number, query: string, category: string) => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    const categoryParam = resolveCategoryParam(category);
    if (categoryParam) {
      params.set('category', categoryParam);
    }
    if (mode === 'search') {
      params.set('keyword', query);
      return `/api/skills/search?${params.toString()}`;
    }
    return `/api/skills/all?${params.toString()}`;
  }, []);

  const mergeResults = useCallback((prev: SearchResult | null, next: SearchResult, append: boolean): SearchResult => {
    if (!append || !prev) return next;
    return {
      ...next,
      skills: [...prev.skills, ...next.skills],
    };
  }, []);

  const loadPage = useCallback(
    async ({
      mode,
      page,
      append = false,
      query = '',
      category = ALL_CATEGORY,
    }: {
      mode: ViewMode;
      page: number;
      append?: boolean;
      query?: string;
      category?: string;
    }) => {
      const requestId = ++requestSeqRef.current;
      activeAbortRef.current?.abort();
      const controller = new AbortController();
      activeAbortRef.current = controller;

      const setLoadingFn = append ? setLoadingMore : setLoading;
      setLoadingFn(true);

      try {
        const res = await apiFetch(buildSkillsUrl(mode, page, query, category), { signal: controller.signal });
        if (!res.ok) return;
        const data = (await res.json()) as SearchResult;
        if (requestId !== requestSeqRef.current) return;

        setViewMode(mode);
        setResults((prev) => mergeResults(prev, data, append));
        setDisplayCategory(category);
        setCurrentPage(page);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        // ignore error
      } finally {
        if (requestId === requestSeqRef.current) {
          setLoadingFn(false);
        }
      }
    },
    [buildSkillsUrl, mergeResults],
  );

  const handleCategoryChange = useCallback(
    (category: string) => {
      latestQueryRef.current = '';
      setSearchQuery('');
      setActiveCategory(category);
      setCurrentPage(1);
      setViewMode('browse');
      void loadPage({ mode: 'browse', page: 1, category });
    },
    [loadPage],
  );

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !results?.hasMore) return;
    if (viewMode === 'search') {
      const query = latestQueryRef.current.trim();
      if (!query) return;
      void loadPage({ mode: 'search', page: currentPage + 1, append: true, query, category: activeCategory });
      return;
    }
    void loadPage({ mode: 'browse', page: currentPage + 1, append: true, category: activeCategory });
  }, [activeCategory, currentPage, loadPage, loadingMore, results, viewMode]);

  const setInstallStatusWithTimer = useCallback((slug: string, status: InstallStatus) => {
    setInstallStatus((prev) => new Map(prev).set(slug, status));
    const existing = statusTimers.current.get(slug);
    if (existing) clearTimeout(existing);
    if (typeof status === 'string' && status !== 'installing') {
      const timer = setTimeout(() => {
        setInstallStatus((prev) => {
          const next = new Map(prev);
          next.delete(slug);
          return next;
        });
        statusTimers.current.delete(slug);
      }, 3000);
      statusTimers.current.set(slug, timer);
    }
  }, []);

  const clearInstallStatus = useCallback((slug: string) => {
    setInstallStatus((prev) => {
      const next = new Map(prev);
      next.delete(slug);
      return next;
    });
    const existing = statusTimers.current.get(slug);
    if (existing) {
      clearTimeout(existing);
      statusTimers.current.delete(slug);
    }
  }, []);

  const markSkillInstalled = useCallback((slug: string) => {
    const markInstalled = (result: SearchResult | null): SearchResult | null => {
      if (!result) return result;
      let changed = false;
      const skills = result.skills.map((item) => {
        if (item.slug !== slug || item.isInstalled) return item;
        changed = true;
        return { ...item, isInstalled: true };
      });
      return changed ? { ...result, skills } : result;
    };

    setResults((prev) => markInstalled(prev));
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    const timers = statusTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      activeAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    void loadPage({ mode: 'browse', page: 1, category: ALL_CATEGORY });
  }, [loadPage]);

  useEffect(() => {
    if (!searchEffectReadyRef.current) {
      searchEffectReadyRef.current = true;
      return;
    }

    const timer = setTimeout(() => {
      const trimmed = searchQuery.trim();
      latestQueryRef.current = trimmed;
      setCurrentPage(1);

      if (!trimmed) {
        void loadPage({ mode: 'browse', page: 1, category: activeCategory });
        return;
      }

      void loadPage({ mode: 'search', page: 1, query: trimmed, category: activeCategory });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [activeCategory, loadPage, searchQuery]);

  const handleInstall = useCallback(
    async (owner: string, repo: string, skill: string) => {
      setInstallStatusWithTimer(skill, 'installing');
      try {
        const res = await apiFetch('/api/skills/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ owner, repo, skill }),
        });
        if (res.ok) {
          clearInstallStatus(skill);
          markSkillInstalled(skill);
          showToast(`"${skill}" 安装成功`, 'success');
        } else {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          const detail = payload.error ?? `HTTP ${res.status}`;
          const message = `${INSTALL_FAILED_LABEL}：${detail}`;
          clearInstallStatus(skill);
          showToast(message, 'error');
        }
      } catch {
        clearInstallStatus(skill);
        showToast(`${INSTALL_FAILED_LABEL}：网络错误，请重试`, 'error');
      }
    },
    [clearInstallStatus, markSkillInstalled, setInstallStatusWithTimer, showToast],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {toast && (
        <div
          aria-live="polite"
          className={`shrink-0 rounded-[var(--radius-md)] px-3 py-2 text-xs font-medium ${
            toast.type === 'success' ? 'ui-status-success' : 'ui-status-error'
          }`}
        >
          {toast.message}
        </div>
      )}

      <section className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="shrink-0" data-testid="hub-skills-fixed-header">
          {categories.length > 0 && (
            <div className="flex flex-wrap items-center gap-4 pb-6">
              {[ALL_CATEGORY, ...categories].map((category, index) => (
                <div key={category} className="flex items-center">
                  {index > 0 ? <div aria-hidden="true" className="mr-4 h-4 w-px self-center bg-[#dbdbdb]" /> : null}
                  <button
                    type="button"
                    onClick={() => handleCategoryChange(category)}
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
          )}

          <div className="space-y-0">
            <p className="text-[20px] font-semibold">
              {displayCategory}
              {results ? ` (${results.total})` : ''}
            </p>
            <div className="flex flex-col gap-[var(--space-5)] py-6 sm:flex-row sm:items-center">
              <input
                type="text"
                aria-label={SEARCH_ARIA_LABEL}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={SEARCH_PLACEHOLDER}
                className="ui-input h-[28px] min-h-[28px] flex-1 px-3 py-0 text-xs"
              />
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto" data-testid="hub-skills-scroll-region">
          {results ? (
            <>
              <SkillList results={results} installStatus={installStatus} onInstall={handleInstall} />
              {results.hasMore && (
                <div className="flex justify-center py-4">
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="ui-btn-secondary px-4 py-2 text-xs"
                  >
                    {loadingMore ? '加载中...' : '加载更多'}
                  </button>
                </div>
              )}
            </>
          ) : loading ? (
            <p className="text-[11px] text-[var(--text-muted)]">{LOADING_LABEL}</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
