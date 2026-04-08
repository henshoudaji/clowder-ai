import { useCallback, useEffect, useRef, useState } from 'react';
import { useCatData } from '@/hooks/useCatData';
import { getMentionLabel, getMentionRe, getMentionToCat } from '@/lib/mention-highlight';
import type { ThreadState } from '@/stores/chat-types';
import { API_URL } from '@/utils/api-client';
import { AppModal } from '../AppModal';
import { CatAvatar } from '../CatAvatar';
import { PawIcon } from '../icons/PawIcon';
import { formatRelativeTime } from './thread-utils';

export interface ThreadItemProps {
  id: string;
  title: string | null;
  participants: string[];
  lastActiveAt: number;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  onRename?: (id: string, title: string) => void | Promise<void>;
  onTogglePin?: (id: string, pinned: boolean) => void | Promise<void>;
  onToggleFavorite?: (id: string, favorited: boolean) => void | Promise<void>;
  onUpdatePreferredCats?: (id: string, cats: string[]) => void | Promise<void>;
  isPinned?: boolean;
  isFavorited?: boolean;
  threadState?: ThreadState;
  indented?: boolean;
  preferredCats?: string[];
  isHubThread?: boolean;
  sourceLabel?: string;
}

type ContextMenuState = {
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
  arrowY: number;
};

function getMentionedCatIdsFromMessages(
  messages: ThreadState['messages'] | undefined,
  getCatById: (id: string) => unknown,
): string[] {
  if (!messages?.length) return [];
  const mentionToCat = getMentionToCat();
  const mentionRe = getMentionRe();
  const ids: string[] = [];
  const seen = new Set<string>();

  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (!message?.content) continue;

    mentionRe.lastIndex = 0;
    const matches = [...message.content.matchAll(mentionRe)];
    for (const match of matches) {
      const alias = match[1]?.toLowerCase();
      if (!alias) continue;
      const candidateId = mentionToCat[alias] ?? match[1];
      if (!candidateId) continue;
      if (!getCatById(candidateId)) continue;
      if (seen.has(candidateId)) continue;
      seen.add(candidateId);
      ids.push(candidateId);
    }
  }

  return ids;
}

function normalizeTitleMentions(
  title: string,
  cats: Array<{ id: string; displayName: string; mentionPatterns: string[] }>,
): string {
  const mentionLabel = getMentionLabel();
  const aliasToLabel: Record<string, string> = { ...mentionLabel };

  for (const cat of cats) {
    const display = cat.displayName.trim();
    if (!display) continue;
    const label = display.startsWith('@') ? display : `@${display}`;
    aliasToLabel[cat.id.toLowerCase()] = label;
    aliasToLabel[display.replace(/^@/, '').toLowerCase()] = label;
    for (const pattern of cat.mentionPatterns) {
      const alias = pattern.replace(/^@/, '').trim().toLowerCase();
      if (alias) aliasToLabel[alias] = label;
    }
  }

  const tokenRe = /@([^\s,.:;!?()\[\]{}<>，。！？、：；（）【】《》「」『』〈〉]+)/g;
  return title.replace(tokenRe, (fullMatch: string, alias: string) => {
    const mapped = aliasToLabel[alias.toLowerCase()];
    return mapped ?? fullMatch;
  });
}

export function ThreadItem({
  id,
  title,
  participants,
  lastActiveAt,
  isActive,
  onSelect,
  onDelete,
  onRename,
  onTogglePin,
  onToggleFavorite,
  isPinned,
  isFavorited,
  threadState,
  indented,
  preferredCats,
  isHubThread,
  sourceLabel,
}: ThreadItemProps) {
  const { cats, getCatById } = useCatData();
  const unreadCount = Math.max(0, threadState?.unreadCount ?? 0);
  const showUnreadBadge = unreadCount > 0;
  const unreadLabel = unreadCount > 99 ? '99+' : String(unreadCount);
  const canDelete = id !== 'default' && onDelete;
  const canRename = id !== 'default' && onRename;
  const canPin = id !== 'default' && onTogglePin;
  const canFavorite = id !== 'default' && onToggleFavorite;

  const [isSaving, setIsSaving] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title ?? '');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showRenameDialog) setDraftTitle(title ?? '');
  }, [title, showRenameDialog]);

  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = () => setContextMenu(null);
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return;
      const target = event.target as Node | null;
      if (target && !menuRef.current.contains(target)) {
        closeMenu();
      }
    };

    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('blur', closeMenu);

    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('blur', closeMenu);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu || !menuRef.current) return;
    const viewportPadding = 8;
    const anchorGap = 10;
    const rect = menuRef.current.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - viewportPadding;
    const nextX = Math.min(
      Math.max(contextMenu.anchorX + anchorGap, viewportPadding),
      Math.max(viewportPadding, maxX),
    );

    const topBoundY = viewportPadding;
    const bottomBoundY = Math.max(viewportPadding, window.innerHeight - rect.height - viewportPadding);
    const oneFifthOffset = rect.height * 0.2;
    const fourFifthsOffset = rect.height * 0.8;
    const arrowMargin = 18;
    const clampedOneFifth = Math.min(
      Math.max(oneFifthOffset, arrowMargin),
      Math.max(arrowMargin, rect.height - arrowMargin),
    );
    const clampedFourFifths = Math.min(
      Math.max(fourFifthsOffset, arrowMargin),
      Math.max(arrowMargin, rect.height - arrowMargin),
    );

    const oneFifthRawY = contextMenu.anchorY - clampedOneFifth;
    const fourFifthsRawY = contextMenu.anchorY - clampedFourFifths;
    const oneFifthWouldOverflowBottom = oneFifthRawY + rect.height > window.innerHeight - viewportPadding;
    const useOneFifth = !oneFifthWouldOverflowBottom;
    const targetRawY = useOneFifth ? oneFifthRawY : fourFifthsRawY;
    const nextArrowY = useOneFifth ? clampedOneFifth : clampedFourFifths;
    const nextY = Math.min(Math.max(targetRawY, topBoundY), bottomBoundY);

    if (nextX !== contextMenu.x || nextY !== contextMenu.y || nextArrowY !== contextMenu.arrowY) {
      setContextMenu({
        x: nextX,
        y: nextY,
        anchorX: contextMenu.anchorX,
        anchorY: contextMenu.anchorY,
        arrowY: nextArrowY,
      });
    }
  }, [contextMenu]);

  const submitRename = useCallback(async () => {
    if (!onRename) return;
    const next = draftTitle.trim();
    if (!next) {
      setDraftTitle(title ?? '');
      setShowRenameDialog(false);
      return;
    }
    if (next === (title ?? '')) {
      setShowRenameDialog(false);
      return;
    }

    setIsSaving(true);
    try {
      await onRename(id, next);
      setShowRenameDialog(false);
    } finally {
      setIsSaving(false);
    }
  }, [onRename, draftTitle, title, id]);

  const rawTitle = title ?? (id === 'default' ? '大厅' : '未命名对话');
  const displayTitle = normalizeTitleMentions(rawTitle, cats);
  const participantNames = participants.map((catId) => getCatById(catId)?.displayName ?? catId).join(', ');
  const description = participantNames || (isHubThread ? 'Hub 会话' : '暂无会话描述');
  const mentionedCatIds = getMentionedCatIdsFromMessages(threadState?.messages, getCatById);
  const avatarCatIds = Array.from(
    new Set(
      [...participants, ...(threadState?.targetCats ?? []), ...(preferredCats ?? []), ...mentionedCatIds].filter(
        (catId) => !!catId && !!getCatById(catId),
      ),
    ),
  ).slice(0, 4);
  const tooltipLines = [displayTitle];
  if (participantNames) tooltipLines.push(`参与: ${participantNames}`);
  tooltipLines.push(formatRelativeTime(lastActiveAt, false));
  const tooltip = tooltipLines.join('\n');
  const contextMenuItemClass =
    'block w-full whitespace-nowrap px-3 py-2 text-left text-xs transition-colors hover:bg-[rgba(245,245,245,1)] focus-visible:bg-[rgba(245,245,245,1)] focus-visible:outline-none';

  return (
    <div
      className={`ui-thread-item group relative cursor-pointer transition-colors ${
        indented ? 'pl-7' : ''
      } mx-4 mb-1 last:mb-0 border-0 border-b-0 ${isActive ? 'ui-thread-item-active bg-white rounded-[8px]' : 'ui-thread-item-inactive rounded-[8px]'}`}
      onClick={() => onSelect(id)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const itemRect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        setContextMenu({
          x: e.clientX + 10,
          y: e.clientY + 10,
          anchorX: e.clientX,
          anchorY: itemRect.top + itemRect.height / 2,
          arrowY: 16,
        });
      }}
      title={tooltip}
    >
      <div className="flex items-center gap-[10px]">
        <div className="relative shrink-0">
          {avatarCatIds.length === 1 ? (
            <CatAvatar catId={avatarCatIds[0]!} size={32} showRing={false} />
          ) : avatarCatIds.length > 1 ? (
            <div className="relative h-8 w-8">
              {avatarCatIds.length === 2 && (
                <>
                  <div className="absolute left-[1px] top-[6px] z-10">
                    <CatAvatar catId={avatarCatIds[0]!} size={20} showRing={false} />
                  </div>
                  <div className="absolute left-[11px] top-[6px] z-0">
                    <CatAvatar catId={avatarCatIds[1]!} size={20} showRing={false} />
                  </div>
                </>
              )}
              {avatarCatIds.length === 3 && (
                <>
                  <div className="absolute left-[8px] top-0">
                    <CatAvatar catId={avatarCatIds[0]!} size={16} showRing={false} />
                  </div>
                  <div className="absolute left-0 top-[16px]">
                    <CatAvatar catId={avatarCatIds[1]!} size={16} showRing={false} />
                  </div>
                  <div className="absolute left-[16px] top-[16px]">
                    <CatAvatar catId={avatarCatIds[2]!} size={16} showRing={false} />
                  </div>
                </>
              )}
              {avatarCatIds.length >= 4 && (
                <>
                  <div className="absolute left-0 top-0">
                    <CatAvatar catId={avatarCatIds[0]!} size={16} showRing={false} />
                  </div>
                  <div className="absolute left-[16px] top-0">
                    <CatAvatar catId={avatarCatIds[1]!} size={16} showRing={false} />
                  </div>
                  <div className="absolute left-0 top-[16px]">
                    <CatAvatar catId={avatarCatIds[2]!} size={16} showRing={false} />
                  </div>
                  <div className="absolute left-[16px] top-[16px]">
                    <CatAvatar catId={avatarCatIds[3]!} size={16} showRing={false} />
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="ui-avatar-fallback-shell h-8 w-8">
              <PawIcon className="ui-avatar-fallback-icon" />
            </div>
          )}
          {showUnreadBadge && (
            <span
              className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[10px] font-medium leading-none text-white"
              aria-label={`未读消息 ${unreadCount}`}
            >
              {unreadLabel}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="ui-thread-title block min-w-0 flex-1 truncate text-[#191919] font-semibold">{displayTitle}</span>
            {sourceLabel && (
              <span className="shrink-0 rounded-full bg-[rgba(20,118,255,0.1)] px-2 py-[1px] text-[10px] leading-4 text-[rgba(20,118,255,1)]">
                {sourceLabel}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="block min-w-0 flex-1 truncate text-[12px] text-[#808080]">{description}</span>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="ui-thread-meta shrink-0 text-[#808080]">{formatRelativeTime(lastActiveAt, true)}</span>
            </div>
          </div>
        </div>
      </div>

      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 inline-block w-[100px] rounded-lg border border-[var(--border-default)] bg-[var(--surface-panel)] shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -left-[6px] h-0 w-0 border-y-[6px] border-y-transparent border-r-[6px] border-r-[var(--border-default)]"
            style={{ top: contextMenu.arrowY - 6 }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -left-[5px] h-0 w-0 border-y-[5px] border-y-transparent border-r-[5px] border-r-[var(--surface-panel)]"
            style={{ top: contextMenu.arrowY - 5 }}
          />
          {canRename && (
            <button
              type="button"
              onClick={() => {
                setContextMenu(null);
                setDraftTitle(title ?? '');
                setShowRenameDialog(true);
              }}
              className={contextMenuItemClass}
            >
              重命名
            </button>
          )}

          {canPin && (
            <button
              type="button"
              onClick={() => {
                setContextMenu(null);
                void onTogglePin?.(id, !isPinned);
              }}
              className={contextMenuItemClass}
            >
              {isPinned ? '取消置顶' : '置顶'}
            </button>
          )}

          {canFavorite && (
            <button
              type="button"
              onClick={() => {
                setContextMenu(null);
                void onToggleFavorite?.(id, !isFavorited);
              }}
              className={contextMenuItemClass}
            >
              {isFavorited ? '取消收藏' : '收藏'}
            </button>
          )}

          {id !== 'default' && (
            <button
              type="button"
              onClick={() => {
                setContextMenu(null);
                window.open(`${API_URL}/api/export/thread/${id}?format=md`);
              }}
              className={contextMenuItemClass}
            >
              导出对话
            </button>
          )}

          {canDelete && (
            <button
              type="button"
              onClick={() => {
                setContextMenu(null);
                onDelete?.(id);
              }}
              className={contextMenuItemClass}
            >
              删除对话
            </button>
          )}
        </div>
      )}

      <AppModal
        open={showRenameDialog}
        onClose={() => setShowRenameDialog(false)}
        title="编辑会话名称"
        panelClassName="w-[500px]"
        bodyClassName="pt-5"
        zIndexClassName="z-[60]"
        backdropTestId="thread-rename-modal"
        panelTestId="thread-rename-modal-panel"
      >
        <div className="flex flex-col gap-5" data-testid="thread-rename-modal-content">
          <input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submitRename();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setShowRenameDialog(false);
              }
            }}
            autoFocus
            maxLength={200}
            disabled={isSaving}
            className="ui-input h-7 w-full px-3 text-sm"
          />

          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setShowRenameDialog(false)} className="ui-button-default ui-modal-action-button">
              取消
            </button>
            <button type="button" onClick={() => void submitRename()} disabled={isSaving} className="ui-button-primary ui-modal-action-button">
              确定
            </button>
          </div>
        </div>
      </AppModal>
    </div>
  );
}
