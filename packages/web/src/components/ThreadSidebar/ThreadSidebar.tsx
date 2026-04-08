'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Thread, useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';
import { AppModal } from '../AppModal';
import { BootcampIcon } from '../icons/BootcampIcon';
import { HubIcon } from '../icons/HubIcon';
import { TaskPanel } from '../TaskPanel';
import { UserProfile } from '../UserProfile';
import { DirectoryPickerModal, type NewThreadOptions } from './DirectoryPickerModal';
import { SectionGroup } from './SectionGroup';
import { ThreadItem } from './ThreadItem';
import { getProjectPaths, type ThreadGroup } from './thread-utils';
import { createToggleWithReconcile } from './toggle-with-reconcile';
import { useCollapseState } from './use-collapse-state';
import { useProjectPins } from './use-project-pins';

interface ThreadSidebarProps {
  onClose?: () => void;
  className?: string;
  onBootcampClick?: () => void;
  onHubClick?: () => void;
  onThreadSelect?: () => void;
  onMenuClick?: (menu: 'models' | 'agents' | 'channels' | 'skills') => void;
  onNewChatClick?: () => void;
  activeMenu?: 'models' | 'agents' | 'channels' | 'skills';
}

const CONNECTOR_SOURCE_LABELS: Record<string, string> = {
  feishu: '飞书',
  telegram: 'Telegram',
  wechat: '微信',
  slack: 'Slack',
  discord: 'Discord',
  dingtalk: '钉钉',
};

function getThreadSourceLabel(thread: Thread): string | undefined {
  const connectorId = thread.connectorHubState?.connectorId;
  if (!connectorId) return undefined;
  return CONNECTOR_SOURCE_LABELS[connectorId] ?? connectorId;
}

export function ThreadSidebar({
  onClose,
  className,
  onBootcampClick,
  onHubClick,
  onThreadSelect,
  onMenuClick,
  onNewChatClick,
  activeMenu,
}: ThreadSidebarProps) {
  const router = useRouter();
  const {
    threads,
    currentThreadId,
    setThreads,
    setCurrentThread,
    setCurrentProject,
    isLoadingThreads,
    setLoadingThreads,
    updateThreadTitle,
    getThreadState,
    threadStates,
  } = useChatStore();
  const [isCreating, setIsCreating] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filterOption, setFilterOption] = useState<'all' | '1m' | '3m' | '6m'>('all');
  const [pendingFilterOption, setPendingFilterOption] = useState<'all' | '1m' | '3m' | '6m'>('all');
  const [bindWarning, setBindWarning] = useState<string | null>(null);
  // I-1: Thread to confirm deletion (null = no dialog)
  const [deleteTarget, setDeleteTarget] = useState<Thread | null>(null);
  // F095 Phase D: Trash bin state
  const [showTrash, setShowTrash] = useState(false);
  const [trashedThreads, setTrashedThreads] = useState<Thread[]>([]);
  const [isLoadingTrash, setIsLoadingTrash] = useState(false);
  // F070: governance health by project path
  const [govHealth, setGovHealth] = useState<Record<string, string>>({});
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const filterToggleRef = useRef<HTMLButtonElement>(null);

  // Shared seq maps 鈥?created once, cross-referenced between pin/fav toggle instances
  const pinSeqMap = useRef(new Map<string, number>());
  const favSeqMap = useRef(new Map<string, number>());

  // Stable toggle-with-reconcile instances (lazy-init in ref, survive re-renders)
  const pinToggle = useRef<ReturnType<typeof createToggleWithReconcile>>();
  const favToggle = useRef<ReturnType<typeof createToggleWithReconcile>>();
  if (!pinToggle.current) {
    pinToggle.current = createToggleWithReconcile({
      fetch: apiFetch,
      onUpdate: (id, val) => useChatStore.getState().updateThreadPin(id, val),
      field: 'pinned',
      seqMap: pinSeqMap.current,
      siblingSeqMap: favSeqMap.current,
      onUpdateSibling: (id, val) => useChatStore.getState().updateThreadFavorite(id, val),
      siblingField: 'favorited',
    });
  }
  if (!favToggle.current) {
    favToggle.current = createToggleWithReconcile({
      fetch: apiFetch,
      onUpdate: (id, val) => useChatStore.getState().updateThreadFavorite(id, val),
      field: 'favorited',
      seqMap: favSeqMap.current,
      siblingSeqMap: pinSeqMap.current,
      onUpdateSibling: (id, val) => useChatStore.getState().updateThreadPin(id, val),
      siblingField: 'pinned',
    });
  }

  const loadThreads = useCallback(async () => {
    setLoadingThreads(true);
    try {
      const res = await apiFetch('/api/threads');
      if (!res.ok) return;
      const data = await res.json();
      const threads = data.threads ?? [];
      setThreads(threads);
      // F069: Restore unread state from API
      const { initThreadUnread } = useChatStore.getState();
      for (const thread of threads) {
        if (thread.unreadCount > 0 || thread.hasUserMention) {
          initThreadUnread(thread.id, thread.unreadCount ?? 0, !!thread.hasUserMention);
        }
      }
    } catch {
      // Silently ignore
    } finally {
      setLoadingThreads(false);
    }
  }, [setThreads, setLoadingThreads]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    const refresh = () => {
      void loadThreads();
    };
    window.addEventListener('cat-cafe:threads-refresh', refresh);
    return () => window.removeEventListener('cat-cafe:threads-refresh', refresh);
  }, [loadThreads]);

  useEffect(() => {
    if (!showFilter) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (filterPanelRef.current?.contains(target)) return;
      if (filterToggleRef.current?.contains(target)) return;
      setShowFilter(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [showFilter]);

  // F070: Fetch governance health for all registered external projects
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/governance/health');
        if (!res.ok) return;
        const data = (await res.json()) as { projects: { projectPath: string; status: string }[] };
        const map: Record<string, string> = {};
        for (const p of data.projects) {
          map[p.projectPath] = p.status;
        }
        setGovHealth(map);
      } catch {
        // Best effort
      }
    })();
  }, []);

  const navigateToThread = useCallback(
    (threadId: string) => {
      router.push(threadId === 'default' ? '/' : `/thread/${threadId}`);
    },
    [router],
  );

  const handleNewChat = useCallback(() => {
    if (onNewChatClick) {
      onNewChatClick();
      return;
    }
    setCurrentThread('default');
    setCurrentProject('default');
    navigateToThread('default');
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      onClose?.();
    }
  }, [onNewChatClick, onClose, setCurrentProject, setCurrentThread, navigateToThread]);

  const createInProject = useCallback(
    async (opts: NewThreadOptions) => {
      setIsCreating(true);
      setShowPicker(false);
      try {
        const res = await apiFetch(`/api/threads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(opts.projectPath ? { projectPath: opts.projectPath } : {}),
            ...(opts.preferredCats?.length ? { preferredCats: opts.preferredCats } : {}),
            ...(opts.title ? { title: opts.title } : {}),
            ...(opts.pinned ? { pinned: opts.pinned } : {}),
            ...(opts.backlogItemId ? { backlogItemId: opts.backlogItemId } : {}),
          }),
        });
        if (!res.ok) return;
        const thread: Thread = await res.json();

        // F33: Bind external sessions after thread creation (best-effort, parallel)
        if (opts.sessionBindings?.length) {
          const results = await Promise.allSettled(
            opts.sessionBindings.map(({ catId, cliSessionId }) =>
              apiFetch(`/api/threads/${thread.id}/sessions/${catId}/bind`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cliSessionId }),
              }),
            ),
          );
          const failed = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok));
          if (failed.length > 0) {
            setBindWarning(`Session 缁戝畾閮ㄥ垎澶辫触锛?{failed.length}/${results.length}锛夛紝鍙湪 Session 闈㈡澘閲嶈瘯`);
            setTimeout(() => setBindWarning(null), 6000);
          }
        }

        if (opts.projectPath) setCurrentProject(opts.projectPath);
        navigateToThread(thread.id);
        // Auto-close sidebar on mobile after creating a new conversation
        if (typeof window !== 'undefined' && window.innerWidth < 768) {
          onClose?.();
        }
        await loadThreads();
      } catch {
        // Silently ignore
      } finally {
        setIsCreating(false);
      }
    },
    [setCurrentProject, navigateToThread, loadThreads, onClose],
  );

  // F095 Phase D: Load trashed threads
  const loadTrash = useCallback(async () => {
    setIsLoadingTrash(true);
    try {
      const res = await apiFetch('/api/threads?deleted=true');
      if (!res.ok) return;
      const data = await res.json();
      setTrashedThreads(data.threads ?? []);
    } catch {
      // Silently ignore
    } finally {
      setIsLoadingTrash(false);
    }
  }, []);

  const handleToggleTrash = useCallback(() => {
    setShowTrash((prev) => {
      const next = !prev;
      if (next) void loadTrash();
      return next;
    });
  }, [loadTrash]);

  const handleRestore = useCallback(
    async (threadId: string) => {
      try {
        const res = await apiFetch(`/api/threads/${threadId}/restore`, { method: 'POST' });
        if (!res.ok) return;
        await loadThreads();
        await loadTrash();
      } catch {
        // Silently ignore
      }
    },
    [loadThreads, loadTrash],
  );

  /** F087: Create a bootcamp onboarding thread */
  const createBootcampThread = useCallback(async () => {
    setIsCreating(true);
    try {
      const res = await apiFetch('/api/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '🎓 猫猫训练营',
          bootcampState: {
            v: 1,
            phase: 'phase-0-select-cat',
            startedAt: Date.now(),
          },
        }),
      });
      if (!res.ok) return;
      const thread: Thread = await res.json();
      navigateToThread(thread.id);
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        onClose?.();
      }
      await loadThreads();
    } catch {
      // Silently ignore
    } finally {
      setIsCreating(false);
    }
  }, [navigateToThread, loadThreads, onClose]);

  // I-1: Show confirmation dialog instead of deleting immediately
  const handleDeleteRequest = useCallback(
    (threadId: string) => {
      const thread = threads.find((t) => t.id === threadId);
      if (thread) setDeleteTarget(thread);
    },
    [threads],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    const threadId = deleteTarget.id;
    setDeleteTarget(null);
    try {
      const res = await apiFetch(`/api/threads/${threadId}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) return;
      if (threadId === currentThreadId) {
        navigateToThread('default');
      }
      await loadThreads();
      // F095 Phase D: Refresh trash bin if visible
      if (showTrash) void loadTrash();
    } catch {
      // Silently ignore
    }
  }, [deleteTarget, currentThreadId, navigateToThread, loadThreads, showTrash, loadTrash]);

  const handleRename = useCallback(
    async (threadId: string, title: string) => {
      const nextTitle = title.trim();
      if (!nextTitle) return;
      try {
        const res = await apiFetch(`/api/threads/${threadId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: nextTitle }),
        });
        if (!res.ok) return;
        const updated = await res.json();
        updateThreadTitle(threadId, updated.title ?? nextTitle);
      } catch {
        // Silently ignore
      }
    },
    [updateThreadTitle],
  );

  const handleTogglePin = useCallback(
    (threadId: string, pinned: boolean) => void pinToggle.current?.toggle(threadId, pinned),
    [],
  );

  const handleToggleFavorite = useCallback(
    (threadId: string, favorited: boolean) => void favToggle.current?.toggle(threadId, favorited),
    [],
  );

  const handleUpdatePreferredCats = useCallback(async (threadId: string, cats: string[]) => {
    const res = await apiFetch(`/api/threads/${threadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferredCats: cats }),
    });
    if (!res.ok) throw new Error('保存失败');
    useChatStore.getState().updateThreadPreferredCats(threadId, cats);
  }, []);

  const handleSelect = useCallback(
    (threadId: string) => {
      onThreadSelect?.();
      if (threadId === currentThreadId) return;
      // B1.1: Restore projectPath from thread metadata on switch
      const target = threads.find((t) => t.id === threadId);
      setCurrentProject(target?.projectPath ?? 'default');
      navigateToThread(threadId);
      // Auto-close sidebar on mobile after selecting a thread
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        onClose?.();
      }
    },
    [currentThreadId, onThreadSelect, threads, setCurrentProject, navigateToThread, onClose],
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredThreads = useMemo(() => {
    let result = threads;
    if (normalizedQuery) {
      result = result.filter((thread) => {
        const title = (thread.title ?? '').toLowerCase();
        const fallback = (thread.id === 'default' ? '大厅' : '未命名对话').toLowerCase();
        const project = (thread.projectPath ?? '').toLowerCase();
        const threadId = thread.id.toLowerCase();
        return (
          title.includes(normalizedQuery) ||
          fallback.includes(normalizedQuery) ||
          project.includes(normalizedQuery) ||
          threadId.includes(normalizedQuery)
        );
      });
    }

    if (filterOption !== 'all') {
      const now = Date.now();
      const days = filterOption === '1m' ? 30 : filterOption === '3m' ? 90 : 180;
      const threshold = now - days * 24 * 60 * 60 * 1000;
      result = result.filter((thread) => thread.lastActiveAt >= threshold);
    }

    return result;
  }, [threads, normalizedQuery, filterOption]);

  const unreadIds = useMemo(() => {
    const ids = new Set<string>();
    for (const thread of threads) {
      const ts = threadStates[thread.id];
      if (ts && ts.unreadCount > 0) {
        ids.add(thread.id);
      }
    }
    return ids;
  }, [threads, threadStates]);

  // F072: Mark all threads as read
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const handleMarkAllRead = useCallback(async () => {
    setIsMarkingAllRead(true);
    try {
      const res = await apiFetch('/api/threads/read/mark-all', { method: 'POST' });
      if (res.ok) {
        useChatStore.getState().clearAllUnread();
      }
    } catch (err) {
      console.debug('[F072] mark-all-read failed:', err);
    } finally {
      setIsMarkingAllRead(false);
    }
  }, []);

  // Sidebar grouping: only "全部" and "置顶"
  const { pinnedProjects, toggleProjectPin } = useProjectPins();
  const threadGroups = useMemo<ThreadGroup[]>(() => {
    const sortable = filteredThreads.filter((t) => t.id !== 'default');
    const sortedAll = [...sortable].sort((a, b) => b.lastActiveAt - a.lastActiveAt);
    const sortedPinned = sortedAll.filter((t) => t.pinned);
    const sortedUnpinned = sortedAll.filter((t) => !t.pinned);
    const groups: ThreadGroup[] = [];
    if (sortedPinned.length > 0) {
      groups.push({ type: 'pinned' as const, label: '置顶', threads: sortedPinned });
    }
    groups.push({ type: 'recent' as const, label: '全部', threads: sortedUnpinned });
    return groups;
  }, [filteredThreads]);
  const displayThreadGroups = useMemo(() => threadGroups, [threadGroups]);
  const existingProjects = useMemo(() => getProjectPaths(threads), [threads]);
  const showDefaultThread = normalizedQuery.length === 0 || '大厅'.includes(normalizedQuery);
  const hasVisibleThreads = useMemo(
    () => displayThreadGroups.some((group) => (group.threads?.length ?? 0) > 0),
    [displayThreadGroups],
  );
  const showNoResults = !hasVisibleThreads && !showDefaultThread && (normalizedQuery.length > 0 || filterOption !== 'all');

  // F095: Collapse state with localStorage persistence + search/active auto-expand
  const { isCollapsed, toggleGroup } = useCollapseState({
    threadGroups,
    searchQuery: normalizedQuery,
    currentThreadId,
  });
  const isChatMenu = !activeMenu && currentThreadId === 'default';
  const menuItemBase = 'ui-menu-item flex h-[38px] w-full items-center gap-2 px-2.5 transition-colors';
  const menuItemActive = 'ui-menu-item-active';
  const menuItemInactive = 'ui-menu-item-inactive';

  return (
    <>
      <aside className={`${className ?? 'w-[248px]'} ui-sidebar-shell flex h-full flex-col`}>
        <div className="ui-sidebar-section ui-sidebar-section-no-divider flex items-center justify-between px-3 py-[14px] border-0">
          <div className="flex items-center gap-2">
            <img src="/images/lobster.svg" alt="OfficeClaw" className="w-9 h-9 rounded-lg" />
            <span className="text-[var(--font-size-hero)] font-semibold leading-none tracking-tight text-[var(--text-primary)]">OfficeClaw</span>
          </div>
        </div>

        <div className="ui-sidebar-section hidden px-3 py-2">
          <button
            type="button"
            onClick={() => {
              const fromParam = currentThreadId ? `?from=${encodeURIComponent(currentThreadId)}` : '';
              router.push(`/mission-hub${fromParam}`);
              if (typeof window !== 'undefined' && window.innerWidth < 768) {
                onClose?.();
              }
            }}
            className="flex w-full items-center gap-2 rounded-md border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-left text-xs font-medium text-[#4B5563] transition-colors hover:bg-[#F9FAFB] hover:text-[#111827]"
            data-testid="sidebar-mission-control"
          >
            <svg
              className="h-4 w-4 shrink-0 text-[#9CA3AF]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            Mission Hub
          </button>
        </div>

        <div className="ui-sidebar-section px-3 py-2.5">
          <div className="flex flex-col gap-1.5 items-start">
            <button
              type="button"
              onClick={handleNewChat}
              className={`${menuItemBase} ${isChatMenu ? menuItemActive : menuItemInactive} text-cafe-black`}
            >
              <img src="/icons/menu/new-chat.svg" alt="" aria-hidden="true" className="w-5 h-5 shrink-0" />
              新建会话
            </button>
            <button
              type="button"
              onClick={() => onMenuClick?.('models')}
              className={`${menuItemBase} ${activeMenu === 'models' ? menuItemActive : menuItemInactive} text-cafe-black`}
            >
              <img src="/icons/menu/models.svg" alt="" aria-hidden="true" className="w-5 h-5 shrink-0" />
              模型
            </button>
            <button
              type="button"
              onClick={() => onMenuClick?.('agents')}
              className={`${menuItemBase} ${activeMenu === 'agents' ? menuItemActive : menuItemInactive} text-cafe-black`}
            >
              <img src="/icons/menu/agents.svg" alt="" aria-hidden="true" className="w-5 h-5 shrink-0" />
              智能体
            </button>
            <button
              type="button"
              onClick={() => onMenuClick?.('channels')}
              className={`${menuItemBase} ${activeMenu === 'channels' ? menuItemActive : menuItemInactive} text-cafe-black`}
            >
              <img src="/icons/menu/channels.svg" alt="" aria-hidden="true" className="w-5 h-5 shrink-0" />
              渠道
            </button>
            <button
              type="button"
              onClick={() => onMenuClick?.('skills')}
              className={`${menuItemBase} ${activeMenu === 'skills' ? menuItemActive : menuItemInactive} text-cafe-black`}
            >
              <img src="/icons/menu/skills.svg" alt="" aria-hidden="true" className="w-5 h-5 shrink-0" />
              技能
            </button>
          </div>
        </div>

        {bindWarning && (
          <div className="px-3 py-1.5 bg-yellow-50 border-b border-yellow-200 text-[10px] text-yellow-700">
            {bindWarning}
          </div>
        )}

        <div className="relative px-4 pt-2 pb-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">会话消息</span>
            <div className="flex items-center">
              <button
                ref={filterToggleRef}
                type="button"
                onClick={() => { setShowFilter((prev) => !prev); setIsSearchOpen(false); }}
                className={`rounded p-1 transition-colors ${showFilter || filterOption !== 'all' ? 'text-[rgba(20,115,255,1)]' : 'text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-accent)]'}`}
                title="筛选会话"
                data-testid="thread-filter-toggle"
              >
                <svg  className="h-4 w-4 align-middle" viewBox="0 0 16 16" fill="currentColor" >
                  <path id="_减去顶层" d="M12.308 1.84961L3.68802 1.84961C3.38802 1.84961 3.09802 1.94961 2.86802 2.13961C2.40802 2.60961 2.26802 3.44961 2.68802 3.96961L5.86802 7.85961L5.86802 13.6396C5.86802 13.9196 6.08802 14.1396 6.36802 14.1396L9.72802 14.1396C9.95802 14.0896 10.138 13.8896 10.138 13.6396L10.138 7.85961L13.328 3.96961C13.518 3.73961 13.618 3.44961 13.618 3.14961C13.618 2.42961 13.028 1.84961 12.308 1.84961ZM12.608 3.14961C12.608 2.97961 12.478 2.84961 12.308 2.84961L3.68802 2.84961C3.61802 2.84961 3.54802 2.86961 3.49802 2.91961C3.36802 3.01961 3.34802 3.20961 3.45802 3.33961L6.74802 7.36961C6.81802 7.45961 6.85802 7.56961 6.85802 7.68961L6.85802 13.1496L9.12802 13.1496L9.12802 7.68961C9.12802 7.59961 9.14802 7.51961 9.19802 7.43961L12.548 3.33961C12.588 3.28961 12.608 3.21961 12.608 3.14961Z" fillRule="evenodd"/>
                </svg>
              </button>
              <button
                type="button"
                onClick={() => { setIsSearchOpen((prev) => !prev); setShowFilter(false) }}
                className={`rounded p-1 transition-colors ${isSearchOpen || normalizedQuery.length > 0 ? 'bg-[var(--accent-soft)] text-[var(--text-accent)]' : 'text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-accent)]'}`}
                title="搜索会话"
                data-testid="thread-search-toggle"
              >
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path
                    d="M1.72656 7.17676C1.72656 4.13919 4.189 1.67676 7.22656 1.67676C10.2641 1.67676 12.7266 4.13919 12.7266 7.17676C12.7266 8.50784 12.2537 9.72845 11.4668 10.6798L14.2009 13.3786C14.3974 13.5726 14.3995 13.8892 14.2055 14.0857C14.033 14.2604 13.7637 14.2814 13.568 14.1477L10.7625 11.3897C9.80641 12.1929 8.57299 12.6768 7.22656 12.6768C4.189 12.6768 1.72656 10.2143 1.72656 7.17676ZM11.7266 7.17676C11.7266 4.69147 9.71184 2.67676 7.22656 2.67676C4.74128 2.67676 2.72656 4.69147 2.72656 7.17676C2.72656 9.66205 4.74128 11.6768 7.22656 11.6768C9.71184 11.6768 11.7266 9.66205 11.7266 7.17676Z"
                    fillRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>
          {(isSearchOpen || normalizedQuery.length > 0) && (
            <div className="relative mt-2">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索对话"
                autoComplete="off"
                className="ui-input h-8 w-full pr-8 pl-2.5 py-1.5 text-[13px]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => { setSearchQuery(''); setShowFilter(false); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full text-[20px] leading-5 text-[#808080] hover:text-[#191919]"
                  aria-label="清除搜索"
                >
                  ×
                </button>
              )}
            </div>
          )}

          {showFilter && (
            <div
              ref={filterPanelRef}
              className="absolute right-4 top-[44px] z-40 w-[200px] rounded-[6px] bg-white p-4 shadow-[0_2px_12px_0_rgba(0,0,0,0.16)]"
            >
              <div className="text-[12px] font-[400] leading-[18px] text-[#808080]">会话时间</div>
              <div className="mt-3 flex flex-col">
                {[
                  { key: 'all', label: '全部' },
                  { key: '1m', label: '近1个月' },
                  { key: '3m', label: '近3个月' },
                  { key: '6m', label: '近6个月' },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`text-[12px] font-[400] leading-[18px] text-[#191919] text-left py-[2px] ${pendingFilterOption === item.key ? 'text-[rgba(20,115,255,1)]' : ''}`}
                    style={{ marginBottom: '14px' }}
                    onClick={() => setPendingFilterOption(item.key as 'all' | '1m' | '3m' | '6m')}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="pt-4 flex justify-end gap-2 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  className="h-6 rounded-full border border-[rgba(89,89,89,1)] px-4 text-[12px] font-[400] text-[#191919]"
                  onClick={() => {
                    setPendingFilterOption('all');
                    setFilterOption('all');
                    setShowFilter(false);
                  }}
                >
                  重置
                </button>
                <button
                  type="button"
                  className="h-6 rounded-full border border-[rgba(89,89,89,1)] px-4 text-[12px] font-[400] text-[#191919]"
                  onClick={() => {
                    setFilterOption(pendingFilterOption);
                    setShowFilter(false);
                  }}
                >
                  确定
                </button>
              </div>
            </div>
          )}

          {unreadIds.size > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={isMarkingAllRead}
              className="mt-1.5 text-[var(--font-size-xs)] text-[var(--text-muted)] transition-colors hover:text-[var(--text-accent)] disabled:opacity-40"
              data-testid="mark-all-read-btn"
            >
              {isMarkingAllRead ? '清理中...' : '全部已读'}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoadingThreads && threads.length === 0 && (
            <div className="text-center py-4 text-xs text-gray-400">加载中...</div>
          )}

          {false && showDefaultThread && (
            <ThreadItem
              id="default"
              title="大厅"
              participants={[]}
              lastActiveAt={Date.now()}
              isActive={currentThreadId === 'default'}
              onSelect={handleSelect}
              threadState={getThreadState('default')}
            />
          )}

          {showNoResults ? (
            <div className="flex h-full min-h-[120px] flex-col items-center justify-center px-3 py-4 text-center text-xs text-gray-400">
              <div className="text-[14px] font-[400] text-[#333]">没有结果</div>
              <div className="flex text-[12px] font-[400]  text-[#333] mt-1 gap-2">请开启 <button
                type="button"
                onClick={handleNewChat}
                className="text-[12px] font-[400] text-[rgba(20,115,255,1)]"
              >
                新的会话
              </button>
              </div>
            </div>
          ) : (
            displayThreadGroups.map((group) => {
              const groupKey = group.projectPath ?? group.type;
              const icon =
                group.type === 'favorites'
                  ? ('star' as const)
                  : group.type === 'archived-container'
                    ? ('archive' as const)
                    : undefined;

              // Archived container: render nested project groups
              if (group.type === 'archived-container') {
                return (
                  <SectionGroup
                    key="archived-container"
                    label={group.label}
                    icon="archive"
                    count={group.archivedGroups?.length ?? 0}
                    isCollapsed={isCollapsed('archived-container')}
                    onToggle={() => toggleGroup('archived-container')}
                  >
                    {group.archivedGroups?.map((sub) => {
                      const subKey = sub.projectPath ?? sub.type;
                      return (
                        <SectionGroup
                          key={subKey}
                          label={sub.label}
                          count={sub.threads.length}
                          isCollapsed={isCollapsed(subKey)}
                          onToggle={() => toggleGroup(subKey)}
                          projectPath={sub.projectPath}
                          governanceStatus={sub.projectPath ? govHealth[sub.projectPath] : undefined}
                          onToggleProjectPin={sub.projectPath ? () => toggleProjectPin(sub.projectPath!) : undefined}
                          isProjectPinned={sub.projectPath ? pinnedProjects.has(sub.projectPath) : undefined}
                        >
                          {sub.threads.map((t) => (
                            <ThreadItem
                              key={t.id}
                              id={t.id}
                              title={t.title}
                              participants={t.participants}
                              lastActiveAt={t.lastActiveAt}
                              isActive={currentThreadId === t.id}
                              onSelect={handleSelect}
                              onDelete={handleDeleteRequest}
                              onRename={handleRename}
                              onTogglePin={handleTogglePin}
                              onToggleFavorite={handleToggleFavorite}
                              onUpdatePreferredCats={handleUpdatePreferredCats}
                              isPinned={t.pinned}
                              isFavorited={t.favorited}
                              threadState={getThreadState(t.id)}
                              indented
                              preferredCats={t.preferredCats}
                              isHubThread={!!t.connectorHubState}
                              sourceLabel={getThreadSourceLabel(t)}
                            />
                          ))}
                        </SectionGroup>
                      );
                    })}
                  </SectionGroup>
                );
              }

              return (
                <SectionGroup
                  key={groupKey}
                  label={group.label}
                  icon={icon}
                  count={group.threads.length}
                  isCollapsed={group.type === 'pinned' || group.type === 'recent' ? false : isCollapsed(groupKey)}
                  onToggle={group.type === 'pinned' || group.type === 'recent' ? () => { } : () => toggleGroup(groupKey)}
                  hideToggle={group.type === 'pinned' || group.type === 'recent'}
                  hideCount={group.type === 'pinned' || group.type === 'recent'}
                  projectPath={group.projectPath}
                  governanceStatus={group.projectPath ? govHealth[group.projectPath] : undefined}
                  onToggleProjectPin={
                    group.type === 'project' && group.projectPath ? () => toggleProjectPin(group.projectPath!) : undefined
                  }
                  isProjectPinned={
                    group.type === 'project' && group.projectPath ? pinnedProjects.has(group.projectPath) : undefined
                  }
                >
                  {group.threads.map((t) => (
                    <ThreadItem
                      key={t.id}
                      id={t.id}
                      title={t.title}
                      participants={t.participants}
                      lastActiveAt={t.lastActiveAt}
                      isActive={currentThreadId === t.id}
                      onSelect={handleSelect}
                      onDelete={handleDeleteRequest}
                      onRename={handleRename}
                      onTogglePin={handleTogglePin}
                      onToggleFavorite={handleToggleFavorite}
                      onUpdatePreferredCats={handleUpdatePreferredCats}
                      isPinned={t.pinned}
                      isFavorited={t.favorited}
                      threadState={getThreadState(t.id)}
                      indented={group.type === 'project'}
                      preferredCats={t.preferredCats}
                      isHubThread={!!t.connectorHubState}
                      sourceLabel={getThreadSourceLabel(t)}
                    />
                  ))}
                </SectionGroup>
              );
            })
          )}

        </div>

        {/* 回收站入口暂时隐藏 */}

        <div className="border-t border-[var(--border-default)]"></div>

        <UserProfile />

        <TaskPanel />
      </aside>

      {showPicker && (
        <DirectoryPickerModal
          existingProjects={existingProjects}
          onSelect={createInProject}
          onCancel={() => setShowPicker(false)}
        />
      )}

      <AppModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={
          <div className="flex items-center gap-2">
            <svg className="h-6 w-6 text-[#FAAD14]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12.866 3.5a1 1 0 0 0-1.732 0l-8.25 14.5A1 1 0 0 0 3.75 19.5h16.5a1 1 0 0 0 .866-1.5l-8.25-14.5ZM12 8a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V9a1 1 0 0 1 1-1Zm0 9a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 12 17Z" />
            </svg>
            <h3 className="text-[16px] font-bold text-gray-900">确认删除对话</h3>
          </div>
        }
        panelClassName="w-[500px]"
        bodyClassName="pt-5"
        backdropTestId="thread-delete-modal"
        panelTestId="thread-delete-modal-panel"
      >
        <div className="flex flex-col gap-5" data-testid="thread-delete-modal-content">
          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-900">{deleteTarget?.title ?? '未命名对话'}</p>
            <p className="text-sm text-gray-600">删除后，对话将移入回收站，你仍可在回收站中恢复该对话。</p>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setDeleteTarget(null)} className="ui-button-default ui-modal-action-button">
              取消
            </button>
            <button type="button" onClick={handleDeleteConfirm} className="ui-button-danger ui-modal-action-button">
              移入回收站
            </button>
          </div>
        </div>
      </AppModal>
    </>
  );
}
