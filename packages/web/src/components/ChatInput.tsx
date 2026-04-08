'use client';

import { useRouter } from 'next/navigation';
import { KeyboardEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useCatData } from '@/hooks/useCatData';
import { reconnectGame } from '@/hooks/useGameReconnect';
import { usePathCompletion } from '@/hooks/usePathCompletion';
import type { UploadStatus, WhisperOptions } from '@/hooks/useSendMessage';
import type { DeliveryMode } from '@/stores/chat-types';
import { useChatStore } from '@/stores/chatStore';
import { useInputHistoryStore } from '@/stores/inputHistoryStore';
import { apiFetch } from '@/utils/api-client';
import { compressImage } from '@/utils/compressImage';
import { fetchSkillOptionsWithCache, seedSkillOptionsCache, type SkillOption } from '@/utils/skill-options-cache';
import { ChatInputActionButton } from './ChatInputActionButton';
import { ChatInputMenus } from './ChatInputMenus';
import {
  buildCatOptions,
  buildWhisperOptions,
  type CatOption,
  detectMenuTrigger,
  GAME_LIST,
  WEREWOLF_MODES,
} from './chat-input-options';
import { deriveImageLifecycleStatus, isImageLifecycleBlockingSend } from './chat-input-upload-state';
import { GameLobby, type GameStartPayload } from './game/GameLobby';
import { HistorySearchModal } from './HistorySearchModal';
import { ImagePreview } from './ImagePreview';
import { AttachIcon } from './icons/AttachIcon';
import { MobileInputToolbar } from './MobileInputToolbar';
import { PathCompletionMenu } from './PathCompletionMenu';
import { RichTextarea, type RichTextareaHandle } from './RichTextarea';

/** Module-level draft storage — survives component unmount/remount across thread switches */
export const threadDrafts = new Map<string, string>();

function FolderBadgeIcon({ className }: { className?: string }) {
  return (
    <img
      data-testid="folder-select-icon"
      aria-hidden="true"
      className={className}
      src="/icons/chart/folder.svg"
      alt=""
    />
  );
}

interface ChatInputProps {
  /** Thread ID for draft persistence — drafts are saved per-thread */
  threadId?: string;
  onSend: (content: string, images?: File[], whisper?: WhisperOptions, deliveryMode?: DeliveryMode) => void;
  onStop?: () => void;
  disabled?: boolean;
  hasActiveInvocation?: boolean;
  uploadStatus?: UploadStatus;
  uploadError?: string | null;
  folderSelectionEnabled?: boolean;
  selectedFolderName?: string | null;
  selectedFolderTitle?: string | null;
  onOpenFolderPicker?: () => void;
}

const ACCEPTED_TYPES = 'image/png,image/jpeg,image/gif,image/webp';
const QUICK_ACTIONS = ['文档处理', '视频生成', '深度研究', '幻灯片', '数据分析', '数据可视化', '金融服务'] as const;
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TEXTAREA_MIN_HEIGHT = 70;
const TEXTAREA_MAX_HEIGHT = 253;

function normalizeMentionsForSend(input: string, catOptions: CatOption[]): string {
  let output = input;
  for (const option of catOptions) {
    const routeToken = option.insert.trim();
    if (!routeToken.startsWith('@')) continue;
    const displayMentionBase = option.label.replace(/\s*\([^)]*\)\s*$/, '').trim();
    const displayMention = displayMentionBase.startsWith('@') ? displayMentionBase : `@${displayMentionBase}`;
    if (!displayMention || displayMention.toLowerCase() === routeToken.toLowerCase()) continue;
    const re = new RegExp(`(^|\\s)${escapeRegExp(displayMention)}(?=\\s|$)`, 'gi');
    output = output.replace(re, `$1${routeToken}`);
  }
  return output;
}

function getSkillInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const [initial] = Array.from(trimmed);
  return /[a-z]/i.test(initial) ? initial.toUpperCase() : initial;
}

function SkillOptionIcon({ name, iconUrl }: { name: string; iconUrl?: string | null }) {
  if (iconUrl && iconUrl.trim()) {
    return <img src={iconUrl} alt="" aria-hidden="true" className="h-4 w-4 shrink-0 rounded-[4px] object-cover" />;
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[20px] bg-[var(--accent-soft)] text-[10px] font-semibold text-[var(--text-accent)]"
    >
      {getSkillInitial(name)}
    </span>
  );
}

export function ChatInput({
  threadId,
  onSend,
  onStop,
  disabled,
  hasActiveInvocation,
  uploadStatus = 'idle',
  uploadError = null,
  folderSelectionEnabled = false,
  selectedFolderName = null,
  selectedFolderTitle = null,
  onOpenFolderPicker,
}: ChatInputProps) {
  const { cats } = useCatData();
  const catOptions = useMemo(() => buildCatOptions(cats), [cats]);
  const replaceThreadTargetCats = useChatStore((s) => s.replaceThreadTargetCats);
  const whisperOptions = useMemo(() => buildWhisperOptions(cats), [cats]);

  // F122B AC-B10: track which cats are actively executing (for whisper disable)
  const activeInvocations = useChatStore((s) => s.activeInvocations);
  const storeTargetCats = useChatStore((s) => s.targetCats);
  const activeCatIds = useMemo(() => {
    const ids = new Set<string>();
    for (const inv of Object.values(activeInvocations ?? {})) {
      ids.add(inv.catId);
    }
    // Defensive fallback: legacy paths set hasActiveInvocation=true without
    // populating activeInvocations slots. Use targetCats as degraded source.
    if (ids.size === 0 && hasActiveInvocation && storeTargetCats?.length) {
      for (const catId of storeTargetCats) ids.add(catId);
    }
    return ids;
  }, [activeInvocations, hasActiveInvocation, storeTargetCats]);

  const [input, setInput] = useState(() => (threadId ? (threadDrafts.get(threadId) ?? '') : ''));
  const [showMentions, setShowMentions] = useState(false);
  const [showGameMenu, setShowGameMenu] = useState(false);
  const [showSkillMenu, setShowSkillMenu] = useState(false);
  const [gameStep, setGameStep] = useState<'list' | 'modes'>('list');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);
  const [mentionFilter, setMentionFilter] = useState('');
  const [skillFilter, setSkillFilter] = useState('');
  const [skillOptions, setSkillOptions] = useState<SkillOption[]>([]);
  const [skillOptionsLoading, setSkillOptionsLoading] = useState(false);
  const [images, setImages] = useState<File[]>([]);
  const [isPreparingImages, setIsPreparingImages] = useState(false);
  const [whisperMode, setWhisperMode] = useState(false);
  const [whisperTargets, setWhisperTargets] = useState<Set<string>>(new Set());
  const [mobileToolbar, setMobileToolbar] = useState(false);
  const [ghostSuggestion, setGhostSuggestion] = useState<string | null>(null);
  const [isFolderTooltipVisible, setIsFolderTooltipVisible] = useState(false);
  const ghostRef = useRef<string | null>(null);
  const [showHistorySearch, setShowHistorySearch] = useState(false);
  const [lobbyMode, setLobbyMode] = useState<'player' | 'god-view' | 'detective' | null>(null);
  const textareaRef = useRef<RichTextareaHandle>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const gameBtnRef = useRef<HTMLButtonElement>(null);
  const skillBtnRef = useRef<HTMLButtonElement>(null);
  const skillOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageLifecycleStatus = deriveImageLifecycleStatus(isPreparingImages, uploadStatus);
  const sendTemporarilyDisabled = isImageLifecycleBlockingSend(imageLifecycleStatus);
  const folderButtonLabel = selectedFolderName?.trim() || '选择工作空间';
  const isFolderButtonDisabled = disabled || !folderSelectionEnabled;
  const shouldShowFolderTooltip = Boolean(selectedFolderTitle?.trim());

  // F63-AC15: consume pendingChatInsert from workspace (thread-guarded)
  const pendingChatInsert = useChatStore((s) => s.pendingChatInsert);
  const setPendingChatInsert = useChatStore((s) => s.setPendingChatInsert);
  useEffect(() => {
    if (!pendingChatInsert) return;
    if (pendingChatInsert.threadId !== threadId) return;
    setInput((prev) => {
      const separator = prev && !prev.endsWith('\n') ? '\n' : '';
      return prev + separator + pendingChatInsert.text;
    });
    setPendingChatInsert(null);
    textareaRef.current?.focus();
  }, [pendingChatInsert, setPendingChatInsert, threadId]);

  const handleTranscript = useCallback((text: string) => {
    setInput((prev) => {
      const separator = prev && !prev.endsWith(' ') ? ' ' : '';
      return prev + separator + text;
    });
  }, []);

  const handleQuickAction = useCallback((text: (typeof QUICK_ACTIONS)[number]) => {
    setInput(text);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);


  const filteredCatOptions = useMemo(() => {
    if (!mentionFilter) return catOptions;
    const lower = mentionFilter.toLowerCase();
    return catOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(lower) ||
        opt.insert.toLowerCase().includes(lower) ||
        opt.id.toLowerCase().includes(lower),
    );
  }, [catOptions, mentionFilter]);

  const filteredSkillOptions = useMemo(() => {
    const lower = skillFilter.trim().toLowerCase();
    if (!lower) return skillOptions;
    return skillOptions.filter((item) => item.name.toLowerCase().includes(lower));
  }, [skillFilter, skillOptions]);

  useEffect(() => {
    let cancelled = false;
    setSkillOptionsLoading(true);
    fetchSkillOptionsWithCache()
      .then((options) => {
        if (cancelled) return;
        setSkillOptions(options);
        // Keep shared cache warm so message renderer can reuse immediately.
        seedSkillOptionsCache(options);
      })
      .finally(() => {
        if (!cancelled) setSkillOptionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeMenu = showMentions ? 'mention' : showGameMenu ? 'game' : showSkillMenu ? 'skill' : null;
  const gameMenuItems = gameStep === 'list' ? GAME_LIST : WEREWOLF_MODES;
  const activeOptionsCount =
    activeMenu === 'mention'
      ? filteredCatOptions.length
      : activeMenu === 'skill'
        ? filteredSkillOptions.length
        : gameMenuItems.length;

  const addHistoryEntry = useInputHistoryStore((s) => s.addEntry);
  const findHistoryMatch = useInputHistoryStore((s) => s.findMatch);

  // F080-P2: path completion
  const pathCompletion = usePathCompletion(input);

  const doSend = useCallback(
    (deliveryMode?: DeliveryMode) => {
      if (sendTemporarilyDisabled) return;
      if (whisperMode && whisperTargets.size === 0) return;
      const trimmed = input.trim();
      const payload = normalizeMentionsForSend(trimmed, catOptions);
      if (payload && !disabled) {
        addHistoryEntry(payload);
        const whisper =
          whisperMode && whisperTargets.size > 0
            ? { visibility: 'whisper' as const, whisperTo: [...whisperTargets] }
            : undefined;
        onSend(payload, images.length > 0 ? images : undefined, whisper, deliveryMode);
        setInput('');
        ghostRef.current = null;
        setGhostSuggestion(null);
        setImages([]);
        setShowMentions(false);
        setShowGameMenu(false);
        setShowSkillMenu(false);
      }
    },
    [
      input,
      disabled,
      onSend,
      images,
      sendTemporarilyDisabled,
      whisperMode,
      whisperTargets,
      addHistoryEntry,
    ],
  );

  const handleSend = useCallback(() => doSend(undefined), [doSend]);
  const handleQueueSend = useCallback(() => doSend('queue'), [doSend]);
  const handleForceSend = useCallback(() => doSend('force'), [doSend]);

  const closeMenus = useCallback(() => {
    setShowMentions(false);
    setShowGameMenu(false);
    setShowSkillMenu(false);
    setSkillFilter('');
  }, []);

  const router = useRouter();
  const [gameStarting, setGameStarting] = useState(false);

  const startGame = useCallback(
    async (payload: GameStartPayload) => {
      closeMenus();
      if (disabled || sendTemporarilyDisabled || gameStarting) return;
      setGameStarting(true);
      try {
        const res = await apiFetch('/api/game/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          useChatStore.getState().addMessage({
            id: `game-err-${Date.now()}`,
            type: 'system',
            variant: 'error',
            content: `开局失败: ${data.error ?? `HTTP ${res.status}`}`,
            timestamp: Date.now(),
          });
          // Restore lobby so user can retry without re-selecting
          setLobbyMode(payload.humanRole);
          return;
        }
        // Success — dismiss lobby and navigate
        setLobbyMode(null);
        router.push(`/thread/${data.gameThreadId}`);
        // Hydrate game state immediately (socket reconnect won't fire for same connection)
        reconnectGame(data.gameThreadId).catch(() => { });
      } catch (err) {
        useChatStore.getState().addMessage({
          id: `game-err-${Date.now()}`,
          type: 'system',
          variant: 'error',
          content: `开局失败: ${err instanceof Error ? err.message : '网络异常'}`,
          timestamp: Date.now(),
        });
        // Restore lobby so user can retry
        setLobbyMode(payload.humanRole);
      } finally {
        setGameStarting(false);
      }
    },
    [closeMenus, disabled, sendTemporarilyDisabled, gameStarting, router],
  );

  const insertMention = useCallback(
    (option: CatOption) => {
      const cursor = textareaRef.current?.getSelectionStart() ?? input.length;
      const start = mentionStart >= 0 ? mentionStart : cursor;
      const before = input.slice(0, start);
      const after = input.slice(cursor);
      const displayMention = option.label.replace(/\s*\([^)]*\)\s*$/, '').trim();
      const mentionText = displayMention.startsWith('@') ? displayMention : `@${displayMention}`;
      const leftJoiner = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
      const rightJoiner = ' ';
      const normalizedAfter = after.replace(/^\s+/, '');
      const nextValue = `${before}${leftJoiner}${mentionText}${rightJoiner}${normalizedAfter}`;
      setInput(nextValue);
      setShowMentions(false);
      setMentionStart(-1);
      setMentionFilter('');
      setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        const cursorPos = (before + leftJoiner + mentionText + rightJoiner).length;
        el.focus();
        el.setSelectionRange(cursorPos, cursorPos);
      }, 0);
    },
    [input, mentionStart],
  );

  const insertSkill = useCallback(
    (skillName: string) => {
      const ta = textareaRef.current;
      const start = ta?.getSelectionStart() ?? input.length;
      const end = ta?.getSelectionEnd() ?? input.length;
      const before = input.slice(0, start);
      const after = input.slice(end);
      const leftJoiner = before.endsWith(' ') ? '' : ' ';
      const rightJoiner = ' ';
      const normalizedAfter = after.replace(/^\s+/, '');
      const next = `${before}${leftJoiner}${skillName}${rightJoiner}${normalizedAfter}`;
      setInput(next);
      setShowSkillMenu(false);
      setSkillFilter('');
      setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        const cursorPos = (before + leftJoiner + skillName + rightJoiner).length;
        el.focus();
        el.setSelectionRange(cursorPos, cursorPos);
      }, 0);
    },
    [input],
  );

  const handleChange = useCallback(
    (val: string, selectionStart: number, _selectionEnd: number) => {
      setInput(val);
      const trigger = detectMenuTrigger(val, selectionStart);
      if (trigger?.type === 'game') {
        setShowGameMenu(true);
        setGameStep('list');
        setShowMentions(false);
        setShowSkillMenu(false);
        setSelectedIdx(0);
      } else if (trigger?.type === 'mention') {
        setShowMentions(true);
        setShowGameMenu(false);
        setShowSkillMenu(false);
        setMentionStart(trigger.start);
        setMentionFilter(trigger.filter);
        setSelectedIdx(0);
      } else {
        closeMenus();
        setMentionFilter('');
        setSkillFilter('');
      }
    },
    [closeMenus],
  );

  useEffect(() => {
    if (!threadId) return;
    const typedMentionIds = catOptions
      .filter((opt) => {
        const routeToken = opt.insert.trim();
        const displayTokenBase = opt.label.replace(/\s*\([^)]*\)\s*$/, '').trim();
        const displayToken = displayTokenBase.startsWith('@') ? displayTokenBase : `@${displayTokenBase}`;
        const candidates = [routeToken, displayToken].filter((t) => t.startsWith('@'));
        return candidates.some((token) => {
          const re = new RegExp(`(^|\\s)${escapeRegExp(token)}(?=\\s|$)`, 'i');
          return re.test(input);
        });
      })
      .map((opt) => opt.id);
    replaceThreadTargetCats(threadId, typedMentionIds);
  }, [catOptions, input, replaceThreadTargetCats, threadId]);

  const handleHistorySelect = useCallback(
    (text: string) => {
      setInput(text);
      setShowHistorySearch(false);
      ghostRef.current = null;
      setGhostSuggestion(null);
      closeMenus();
      setMentionFilter('');
      setTimeout(() => textareaRef.current?.focus(), 0);
    },
    [closeMenus],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing) return;

    // F080: Ctrl+R opens history search (clear any active menus first)
    if (e.ctrlKey && e.key === 'r') {
      e.preventDefault();
      closeMenus();
      setMentionFilter('');
      setSkillFilter('');
      setShowHistorySearch(true);
      return;
    }

    // Ctrl+Enter inserts newline instead of sending.
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      const ta = textareaRef.current;
      const start = ta?.getSelectionStart() ?? input.length;
      const end = ta?.getSelectionEnd() ?? input.length;
      const next = `${input.slice(0, start)}\n${input.slice(end)}`;
      setInput(next);
      closeMenus();
      pathCompletion.close();
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(start + 1, start + 1);
      }, 0);
      return;
    }

    if (activeMenu) {
      if (activeOptionsCount === 0) {
        if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab' || e.key === 'Escape') {
          e.preventDefault();
        }
        closeMenus();
        setMentionFilter('');
        setSkillFilter('');
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => (i + 1) % activeOptionsCount);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => (i - 1 + activeOptionsCount) % activeOptionsCount);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (activeMenu === 'mention') {
          const opt = filteredCatOptions[selectedIdx];
          if (!opt) {
            closeMenus();
            return;
          }
          insertMention(opt);
        } else if (activeMenu === 'skill') {
          const skill = filteredSkillOptions[selectedIdx];
          if (!skill) {
            closeMenus();
            return;
          }
          insertSkill(skill.name);
        } else if (gameStep === 'list') {
          // Layer 1: drill into mode selection
          setGameStep('modes');
          setSelectedIdx(0);
        } else {
          // Layer 2: open lobby for mode configuration
          const mode = WEREWOLF_MODES[selectedIdx];
          const role = mode.id === 'detective' ? 'detective' : mode.id.startsWith('god') ? 'god-view' : 'player';
          closeMenus();
          setLobbyMode(role as 'player' | 'god-view' | 'detective');
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenus();
        return;
      }
    }

    // F080-P2: path completion menu keyboard navigation
    if (pathCompletion.isOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        pathCompletion.setSelectedIdx((pathCompletion.selectedIdx + 1) % pathCompletion.entries.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        pathCompletion.setSelectedIdx(
          (pathCompletion.selectedIdx - 1 + pathCompletion.entries.length) % pathCompletion.entries.length,
        );
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        const entry = pathCompletion.entries[pathCompletion.selectedIdx];
        if (entry) {
          const newText = pathCompletion.selectEntry(entry);
          setInput(newText);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        pathCompletion.close();
        return;
      }
    }

    // F080: Tab or ArrowRight accepts ghost suggestion (only when no menu is active)
    // ArrowRight only accepts when cursor is at end of input (no selection)
    if (e.key === 'Tab' || e.key === 'ArrowRight') {
      const ta = textareaRef.current;
      const currentVal = input;
      const selectionStart = ta?.getSelectionStart() ?? currentVal.length;
      const selectionEnd = ta?.getSelectionEnd() ?? currentVal.length;
      const cursorAtEnd = selectionStart === selectionEnd && selectionStart === currentVal.length;
      if (e.key === 'ArrowRight' && !cursorAtEnd) {
        // Let ArrowRight move cursor normally when not at end
      } else {
        const match = useInputHistoryStore.getState().findMatch(currentVal);
        if (match) {
          e.preventDefault();
          setInput(match);
          ghostRef.current = null;
          setGhostSuggestion(null);
          return;
        }
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // F39: Enter while cat running → queue send; normal otherwise
      if (hasActiveInvocation) handleQueueSend();
      else handleSend();
    }
  };

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      setIsPreparingImages(true);
      try {
        const toAdd: File[] = [];
        for (let i = 0; i < files.length && images.length + toAdd.length < 5; i++) {
          toAdd.push(await compressImage(files[i]));
        }
        setImages((prev) => [...prev, ...toAdd].slice(0, 5));
      } finally {
        setIsPreparingImages(false);
      }
      e.target.value = '';
    },
    [images],
  );

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length === 0) return;
      e.preventDefault();
      setIsPreparingImages(true);
      try {
        const toAdd: File[] = [];
        for (const file of imageFiles) {
          if (images.length + toAdd.length >= 5) break;
          toAdd.push(await compressImage(file));
        }
        setImages((prev) => [...prev, ...toAdd].slice(0, 5));
      } finally {
        setIsPreparingImages(false);
      }
    },
    [images],
  );

  const handleTextareaScroll = useCallback((_e: React.UIEvent<HTMLDivElement>) => {}, []);

  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current?.getElement();
    if (!ta) return;
    ta.style.height = 'auto';
    const contentHeight = ta.scrollHeight;
    const nextHeight = Math.max(TEXTAREA_MIN_HEIGHT, Math.min(contentHeight, TEXTAREA_MAX_HEIGHT));
    const nextOverflowY = contentHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
    const nextHeightCss = `${nextHeight}px`;
    if (ta.style.height !== nextHeightCss) ta.style.height = nextHeightCss;
    if (ta.style.overflowY !== nextOverflowY) ta.style.overflowY = nextOverflowY;
  }, []);

  useLayoutEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  const handleRemoveImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const toggleWhisperTarget = useCallback((catId: string) => {
    setWhisperTargets((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  }, []);

  // Clamp selectedIdx when catOptions shrink — only when mention menu is active.
  // selectedIdx is shared by mention/game menus; clamping to catOptions.length
  // when game menu is open would corrupt game selection.
  useEffect(() => {
    if (!showMentions) return;
    setSelectedIdx((i) => Math.min(i, Math.max(0, filteredCatOptions.length - 1)));
  }, [filteredCatOptions, showMentions]);

  useEffect(() => {
    if (!showSkillMenu) return;
    setSelectedIdx((i) => Math.min(i, Math.max(0, filteredSkillOptions.length - 1)));
  }, [filteredSkillOptions, showSkillMenu]);

  useEffect(() => {
    if (!showSkillMenu) return;
    const el = skillOptionRefs.current[selectedIdx];
    if (!el) return;
    el.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx, showSkillMenu]);

  // Reconcile whisperTargets: remove invalid ids + remove newly-active cats (B10)
  useEffect(() => {
    if (!whisperMode) return;
    const validIds = new Set(whisperOptions.map((c) => c.id));
    setWhisperTargets((prev) => {
      const filtered = new Set([...prev].filter((id) => validIds.has(id) && !activeCatIds.has(id)));
      return filtered.size === prev.size ? prev : filtered;
    });
  }, [whisperOptions, whisperMode, activeCatIds]);

  const handleGameClick = useCallback(() => {
    setShowMentions(false);
    setShowSkillMenu(false);
    setMentionStart(-1);
    setShowGameMenu((prev) => !prev);
    setGameStep('list');
    setSelectedIdx(0);
  }, []);

  const handleSkillClick = useCallback(() => {
    setShowMentions(false);
    setShowGameMenu(false);
    setShowSkillMenu((prev) => !prev);
    setSelectedIdx(0);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  const handleWhisperToggle = useCallback(() => {
    setWhisperMode((prev) => {
      if (!prev) {
        // Entering whisper mode — auto-select idle cats only (B10: executing cats excluded)
        setWhisperTargets(new Set(whisperOptions.filter((c) => !activeCatIds.has(c.id)).map((c) => c.id)));
      }
      return !prev;
    });
  }, [whisperOptions, activeCatIds]);

  // Sync input text to module-level draft map (covers all sources: typing, voice, mentions)
  // useLayoutEffect runs synchronously before browser paint and before unmount,
  // ensuring the draft is written to the Map before the component is destroyed
  // on thread switch (key={threadId}). useEffect would lose the final keystroke.
  useLayoutEffect(() => {
    if (!threadId) return;
    if (input) threadDrafts.set(threadId, input);
    else threadDrafts.delete(threadId);
  }, [input, threadId]);

  // F080: recalculate ghost suggestion whenever input changes (covers all setInput paths)
  useEffect(() => {
    const match = input.trim() ? findHistoryMatch(input) : null;
    ghostRef.current = match;
    setGhostSuggestion(match);
  }, [input, findHistoryMatch]);

  useEffect(() => {
    if (!activeMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      // React 18 may flush state synchronously during event bubbling,
      // detaching the original target (e.g. layer 1 unmounts when drilling
      // into layer 2). A detached target is not a genuine outside click.
      if (!target.isConnected) return;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        !gameBtnRef.current?.contains(target) &&
        !skillBtnRef.current?.contains(target)
      ) {
        closeMenus();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [activeMenu, closeMenus]);

  return (
    <div className="relative safe-area-bottom bg-transparent">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-1/2 z-0 h-[100px] -translate-x-1/2 opacity-[0.2] blur-[80px]"
        style={{
          borderRadius: '490px',
          width: 'calc(80% - 80px)',
          background:
            'linear-gradient(90deg,rgba(255,246,190,1),rgba(253,159,112,1) 20%,rgba(239,131,250,1) 43%,rgba(128,134,254,1) 73%,rgba(160,244,255,1) 97%)',
        }}
      />
      {/* F39: Queue status bar — visible when cat is running */}
      {hasActiveInvocation && (
        <div className="px-4 pt-2 hidden items-center gap-2 mx-auto w-[80%]">
          <span className="inline-block w-2 h-2 rounded-full bg-[#9B7EBD] animate-pulse" />
          <span className="text-xs text-[#9B7EBD] font-medium">正在回复中...</span>
          <span className="text-xs text-gray-400">继续输入，消息会排队</span>
        </div>
      )}

      {pathCompletion.isOpen && !activeMenu && (
        <PathCompletionMenu
          entries={pathCompletion.entries}
          selectedIdx={pathCompletion.selectedIdx}
          onSelectIdx={pathCompletion.setSelectedIdx}
          onSelect={(entry) => {
            const newText = pathCompletion.selectEntry(entry);
            setInput(newText);
            setTimeout(() => textareaRef.current?.focus(), 0);
          }}
        />
      )}

      <ChatInputMenus
        catOptions={filteredCatOptions}
        showMentions={showMentions}
        mentionFilter={mentionFilter}
        onMentionFilterChange={(value) => {
          setMentionFilter(value);
          setSelectedIdx(0);
        }}
        showGameMenu={showGameMenu}
        gameStep={gameStep}
        onGameStepChange={setGameStep}
        selectedIdx={selectedIdx}
        onSelectIdx={setSelectedIdx}
        onInsertMention={insertMention}
        onSendCommand={(command) => {
          // Open lobby instead of sending directly
          const role = command.includes('detective')
            ? 'detective'
            : command.includes('god-view')
              ? 'god-view'
              : 'player';
          closeMenus();
          setLobbyMode(role as 'player' | 'god-view' | 'detective');
        }}
        menuRef={menuRef}
      />

      {imageLifecycleStatus === 'preparing' && (
        <div className="px-4 pt-2 text-xs text-gray-500 mx-auto w-[80%]" role="status">
          图片处理中，完成后可发送
        </div>
      )}
      {imageLifecycleStatus === 'uploading' && (
        <div className="px-4 pt-2 text-xs text-indigo-500 mx-auto w-[80%]" role="status">
          图片上传中，请稍候...
        </div>
      )}
      {imageLifecycleStatus === 'failed' && uploadError && (
        <div className="px-4 pt-2 text-xs text-red-500 mx-auto w-[80%]" role="alert">
          图片发送失败：{uploadError}
        </div>
      )}

      {whisperMode && (
        <div className="px-4 pt-2 flex items-center gap-2 flex-wrap mx-auto w-[80%]">
          <span className="text-xs text-amber-600 font-medium">悄悄话发给:</span>
          {whisperOptions.map((cat) => {
            const isActive = activeCatIds.has(cat.id);
            const isSelected = whisperTargets.has(cat.id);
            return (
              <button
                key={cat.id}
                onClick={() => !isActive && toggleWhisperTarget(cat.id)}
                disabled={isActive}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${isActive
                    ? 'text-gray-300 border-gray-200 bg-gray-50 cursor-not-allowed'
                    : isSelected
                      ? 'border-current bg-amber-50 font-medium'
                      : 'text-gray-400 border-gray-200 hover:border-gray-400'
                  }`}
                style={!isActive && isSelected ? { color: cat.color } : undefined}
                title={isActive ? `${cat.label.replace('@', '')} 执行中，不可选` : undefined}
              >
                {cat.label.replace('@', '')}
                {isActive && ' ⏳'}
              </button>
            );
          })}
          {whisperTargets.size === 0 && <span className="text-xs text-red-400">请至少选一只猫猫</span>}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Mobile expanded toolbar (above input row) */}
      {mobileToolbar && (
        <MobileInputToolbar
          onAttach={() => fileInputRef.current?.click()}
          onWhisperToggle={handleWhisperToggle}
          onGameClick={handleGameClick}
          onClose={() => setMobileToolbar(false)}
          disabled={disabled}
          sendDisabled={sendTemporarilyDisabled}
          maxImages={images.length >= 5}
          whisperMode={whisperMode}
        />
      )}

      <div className="relative z-10 px-4 pt-2 pb-[44px] mx-auto w-[80%]">
        <div className="flex gap-2 items-end">
          {/* Mobile: + toggle button */}
          <button
            onClick={() => setMobileToolbar((v) => !v)}
            className={`p-3 rounded-xl transition-all md:hidden ${mobileToolbar
                ? 'text-cocreator-primary bg-cocreator-light rotate-45'
                : 'text-gray-400 hover:text-cocreator-primary hover:bg-white'
              }`}
            aria-label="展开工具栏"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          <div className="flex-1">
            <div>
              <div className="mb-2 hidden flex-wrap gap-2">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => handleQuickAction(action)}
                    disabled={disabled}
                    className="rounded-[20px] border bg-white px-3 py-1.5 text-sm text-black transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ borderColor: 'rgba(219,219,219,0.8)' }}
                  >
                    {action}
                  </button>
                ))}
              </div>

              <div
                className={`relative min-h-[114px] overflow-visible rounded-[24px] border bg-white transition-colors ${
                  whisperMode
                    ? 'border-amber-300 bg-amber-50/50 focus-within:border-amber-400'
                    : 'border-[#dbdbdb] focus-within:border-[#dbdbdb]'
                }`}
              >
                <ImagePreview files={images} onRemove={handleRemoveImage} />
                <div className="relative overflow-hidden rounded-t-[24px]">
                  <RichTextarea
                    ref={textareaRef}
                    value={input}
                    onValueChange={handleChange}
                    onInput={resizeTextarea}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    onScroll={handleTextareaScroll}
                    placeholder={hasActiveInvocation ? '继续输入，消息进入排队中' : '描述你想研究的主题或@助手协助工作'}
                    className="block min-h-[70px] w-full bg-transparent p-4 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[16px] placeholder:text-gray-400 focus:outline-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar]:w-0"
                    disabled={disabled}
                    skillOptions={skillOptions}
                  />
                  {ghostSuggestion && !pathCompletion.isOpen && !showMentions && !/(^|\s)@/.test(input) && (
                    <div
                      data-testid="ghost-suggestion"
                      className="pointer-events-none absolute inset-0 w-full overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-t-[24px] p-4 text-[16px]"
                      aria-hidden="true"
                    >
                      <span className="invisible">{input}</span>
                      <span className="text-gray-400">{ghostSuggestion.slice(input.length)}</span>
                    </div>
                  )}
                </div>
                <div className="px-[10px] py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="relative">
                      <button
                        ref={skillBtnRef}
                        type="button"
                        onClick={handleSkillClick}
                        className="hidden inline-flex items-center gap-2 rounded-full border border-[rgba(219,219,219,0.8)] px-3 py-[5px] text-xs text-[#191919] transition-colors hover:bg-gray-50"
                      >
                        <img src="/icons/menu/skills.svg" alt="" aria-hidden="true" className="h-4 w-4 shrink-0" />
                        技能
                      </button>
                      {showSkillMenu && (
                        <div
                          ref={menuRef}
                          className="absolute bottom-full left-0 mb-2 z-[200] flex w-[200px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white p-2 shadow-lg"
                        >
                          <div className="px-1 pt-0 pb-2">
                            <div className="relative">
                              <svg
                                className="pointer-events-none absolute left-0 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <circle cx="11" cy="11" r="7" />
                                <path d="M20 20l-3.5-3.5" />
                              </svg>
                              <input
                                value={skillFilter}
                                onChange={(e) => {
                                  setSkillFilter(e.target.value);
                                  setSelectedIdx(0);
                                }}
                                onKeyDown={(e) => {
                                  if (filteredSkillOptions.length === 0) {
                                    if (e.key === 'Escape') {
                                      e.preventDefault();
                                      closeMenus();
                                    }
                                    return;
                                  }
                                  if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    setSelectedIdx((idx) => (idx + 1) % filteredSkillOptions.length);
                                    return;
                                  }
                                  if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    setSelectedIdx((idx) => (idx - 1 + filteredSkillOptions.length) % filteredSkillOptions.length);
                                    return;
                                  }
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const skill = filteredSkillOptions[selectedIdx];
                                    if (skill) insertSkill(skill.name);
                                    return;
                                  }
                                  if (e.key === 'Escape') {
                                    e.preventDefault();
                                    closeMenus();
                                  }
                                }}
                                placeholder="请输入关键字搜索"
                                className="ui-input ui-input-underline w-full py-1 pl-6 pr-0 text-sm"
                              />
                            </div>
                          </div>
                          <div className="max-h-[254px] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar]:w-0">
                            {skillOptionsLoading &&
                              Array.from({ length: 5 }).map((_, i) => (
                                <div
                                  key={`skill-loading-${i}`}
                                  className="flex h-[24px] w-full items-center gap-2 rounded-[6px] p-2"
                                  style={{ animationDelay: `${i * 70}ms` }}
                                >
                                  <div className="h-4 w-4 shrink-0 rounded-sm bg-gray-200/70 animate-pulse" />
                                  <div className="h-3 w-[120px] rounded bg-gray-200/70 animate-pulse" />
                                </div>
                              ))}
                            {!skillOptionsLoading &&
                              filteredSkillOptions.map((skill, i) => (
                                <button
                                  key={skill.name}
                                  type="button"
                                  ref={(node) => {
                                    skillOptionRefs.current[i] = node;
                                  }}
                                  className={`flex h-[34px] w-full items-center gap-2 rounded-[6px] p-2 text-left text-[12px] font-normal text-[#191919] transition-colors ${i === selectedIdx ? 'bg-[rgba(240,247,255,1)]' : 'hover:bg-[rgba(240,247,255,0.1)]'
                                    }`}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    insertSkill(skill.name);
                                  }}
                                >
                                  <SkillOptionIcon name={skill.name} iconUrl={skill.iconUrl} />
                                  <span className="truncate">{skill.name}</span>
                                </button>
                              ))}
                            {!skillOptionsLoading && filteredSkillOptions.length === 0 && (
                              <div className="px-2 py-2 text-xs text-gray-400">无匹配技能</div>
                            )}
                          </div>
                          <button
                            type="button"
                            className="mt-2 inline-flex h-[34px] items-center justify-center rounded-full border border-[rgba(219,219,219,0.8)] px-3 text-[12px] text-[#191919] transition-colors hover:bg-gray-50"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              closeMenus();
                              window.dispatchEvent(
                                new CustomEvent('cat-cafe:open-sidebar-menu', { detail: { menu: 'skills' } }),
                              );
                            }}
                          >
                            管理技能
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center">
                      <div
                        data-testid="folder-select-trigger"
                        className="relative flex items-center mr-2"
                        onMouseOver={() => shouldShowFolderTooltip && setIsFolderTooltipVisible(true)}
                        onMouseOut={() => setIsFolderTooltipVisible(false)}
                      >
                        {isFolderTooltipVisible && shouldShowFolderTooltip && (
                          <div
                            data-testid="folder-select-tooltip"
                            className="absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2"
                          >
                            <div className="relative w-max rounded-lg bg-white px-3 py-2 text-xs leading-5 text-[#222222] shadow-[0px_2px_12px_0px_rgba(0,0,0,0.16)] whitespace-nowrap">
                              <span>{selectedFolderTitle}</span>
                              <span
                                className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent border-t-white"
                                aria-hidden="true"
                              />
                            </div>
                          </div>
                        )}
                        <button
                          type="button"
                          data-testid="folder-select-button"
                          onClick={onOpenFolderPicker}
                          disabled={isFolderButtonDisabled}
                          className="ui-button-default inline-flex h-7 max-w-[160px] items-center gap-1 rounded-[16px] px-3 text-xs shadow-none disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400"
                        >
                          <FolderBadgeIcon className="h-6 w-6 shrink-0" />
                          <span className="truncate">{folderButtonLabel}</span>
                        </button>
                      </div>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={disabled || sendTemporarilyDisabled || images.length >= 5}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-white hover:text-cocreator-primary disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label="Attach images"
                      >
                        <AttachIcon className="h-5 w-5" />
                      </button>
                      <ChatInputActionButton
                        onTranscript={handleTranscript}
                        onSend={handleSend}
                        onStop={onStop}
                        onQueueSend={handleQueueSend}
                        onForceSend={handleForceSend}
                        disabled={disabled}
                        sendDisabled={sendTemporarilyDisabled}
                        hasActiveInvocation={hasActiveInvocation}
                        hasText={!!input.trim()}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showHistorySearch && (
        <HistorySearchModal onSelect={handleHistorySelect} onClose={() => setShowHistorySearch(false)} />
      )}

      {lobbyMode && (
        <GameLobby
          mode={lobbyMode}
          cats={cats}
          onConfirm={(payload) => {
            startGame(payload);
          }}
          onCancel={() => setLobbyMode(null)}
        />
      )}
    </div>
  );
}
