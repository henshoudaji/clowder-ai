import type { Thread } from '@/stores/chat-types';
import { getRecentThreads, splitIntoActiveAndArchived } from './active-workspace';

export function formatRelativeTime(ts: number, compact = false): string {
  if (!Number.isFinite(ts) || ts <= 0) return '-';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '-';
  const now = new Date();
  const isSameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  if (!isSameDay) return `${mm}/${dd}`;
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${min}`;
}

export function projectDisplayName(path: string): string {
  if (path === 'default') return '未分类';
  const parts = path.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || path;
}

export function getProjectPaths(threads: Thread[]): string[] {
  const paths = new Set<string>();
  for (const t of threads) {
    if (t.projectPath && t.projectPath !== 'default') {
      paths.add(t.projectPath);
    }
  }
  // F095 Phase C (AC-C4): Sort by most recent thread activity, not alphabetically
  const pathList = [...paths];
  const activityMap = new Map<string, number>();
  for (const t of threads) {
    if (t.projectPath && t.projectPath !== 'default') {
      const current = activityMap.get(t.projectPath) ?? 0;
      if (t.lastActiveAt > current) activityMap.set(t.projectPath, t.lastActiveAt);
    }
  }
  return pathList.sort((a, b) => (activityMap.get(b) ?? 0) - (activityMap.get(a) ?? 0));
}

/** Thread group for sidebar rendering */
export interface ThreadGroup {
  type: 'pinned' | 'recent' | 'project' | 'archived-container' | 'favorites';
  label: string;
  threads: Thread[];
  projectPath?: string;
  /** For archived-container: nested project groups */
  archivedGroups?: ThreadGroup[];
}

/** Sort comparator: unread first, then by lastActiveAt descending. */
function sortByUnreadThenActive(a: Thread, b: Thread, unreadIds?: Set<string>): number {
  if (unreadIds) {
    const aUnread = unreadIds.has(a.id) ? 1 : 0;
    const bUnread = unreadIds.has(b.id) ? 1 : 0;
    if (aUnread !== bUnread) return bUnread - aUnread;
  }
  return b.lastActiveAt - a.lastActiveAt;
}

/**
 * Sort and group threads into: pinned 鈫?project groups 鈫?favorites.
 * Excludes the "default" thread (lobby) which is rendered separately.
 * Within each group: unread threads first, then by lastActiveAt descending.
 */
export function sortAndGroupThreads(threads: Thread[], unreadIds?: Set<string>): ThreadGroup[] {
  const groups: ThreadGroup[] = [];

  // 1. Pinned threads (unread first, then by lastActiveAt desc)
  const pinned = threads
    .filter((t) => t.pinned && t.id !== 'default')
    .sort((a, b) => sortByUnreadThenActive(a, b, unreadIds));
  if (pinned.length > 0) {
    groups.push({ type: 'pinned', label: '缃《', threads: pinned });
  }

  // 2. Regular threads grouped by project (each group sorted)
  const regular = threads.filter((t) => !t.pinned && !t.favorited && t.id !== 'default');
  const projectGroups = groupByProject(regular, unreadIds);
  for (const [projectPath, projectThreads] of projectGroups) {
    groups.push({
      type: 'project',
      label: projectDisplayName(projectPath),
      threads: projectThreads,
      projectPath,
    });
  }

  // 3. Favorites (unread first, then by lastActiveAt desc, excluding pinned)
  const favorited = threads
    .filter((t) => t.favorited && !t.pinned && t.id !== 'default')
    .sort((a, b) => sortByUnreadThenActive(a, b, unreadIds));
  if (favorited.length > 0) {
    groups.push({ type: 'favorites', label: '鏀惰棌', threads: favorited });
  }

  return groups;
}

export interface WorkspaceConfig {
  activeCutoffMs: number;
  recentLimit: number;
}

const DEFAULT_CONFIG: WorkspaceConfig = {
  activeCutoffMs: 7 * 86400_000,
  recentLimit: 8,
};

/**
 * Sort and group threads with active workspace layout:
 * pinned 鈫?recent 鈫?active projects 鈫?archived-container 鈫?favorites
 */
export function sortAndGroupThreadsWithWorkspace(
  threads: Thread[],
  unreadIds: Set<string> | undefined,
  pinnedProjects: Set<string>,
  config: WorkspaceConfig = DEFAULT_CONFIG,
  now: number = Date.now(),
): ThreadGroup[] {
  const groups: ThreadGroup[] = [];

  // 1. Pinned threads
  const pinned = threads
    .filter((t) => t.pinned && t.id !== 'default')
    .sort((a, b) => sortByUnreadThenActive(a, b, unreadIds));
  if (pinned.length > 0) {
    groups.push({ type: 'pinned', label: '缃《', threads: pinned });
  }

  // 2. Recent threads (cross-project, excluding pinned/default)
  const recent = getRecentThreads(threads, config.recentLimit, now);
  if (recent.length > 0) {
    groups.push({ type: 'recent', label: '最近对话', threads: recent });
  }

  // 3. Project groups split into active/archived
  const regular = threads.filter((t) => !t.pinned && !t.favorited && t.id !== 'default');
  const projectGroupEntries = groupByProject(regular, unreadIds);
  const allProjectGroups: ThreadGroup[] = projectGroupEntries.map(([projectPath, projectThreads]) => ({
    type: 'project' as const,
    label: projectDisplayName(projectPath),
    threads: projectThreads,
    projectPath,
  }));

  const { active, archived } = splitIntoActiveAndArchived(
    allProjectGroups,
    threads,
    pinnedProjects,
    config.activeCutoffMs,
    now,
  );

  for (const g of active) {
    groups.push(g);
  }

  if (archived.length > 0) {
    const allArchivedThreads = archived.flatMap((g) => g.threads);
    groups.push({
      type: 'archived-container',
      label: `鍏朵粬椤圭洰 (${archived.length})`,
      threads: allArchivedThreads,
      archivedGroups: archived,
    });
  }

  // 4. Favorites
  const favorited = threads
    .filter((t) => t.favorited && !t.pinned && t.id !== 'default')
    .sort((a, b) => sortByUnreadThenActive(a, b, unreadIds));
  if (favorited.length > 0) {
    groups.push({ type: 'favorites', label: '鏀惰棌', threads: favorited });
  }

  return groups;
}

function groupByProject(threads: Thread[], unreadIds?: Set<string>): [string, Thread[]][] {
  const groups = new Map<string, Thread[]>();
  for (const thread of threads) {
    const key = thread.projectPath;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(thread);
  }
  // Sort threads within each project group
  for (const [, projectThreads] of groups) {
    projectThreads.sort((a, b) => sortByUnreadThenActive(a, b, unreadIds));
  }
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === 'default') return 1;
    if (b === 'default') return -1;
    return a.localeCompare(b);
  });
}

