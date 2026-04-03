'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAgentMessages } from '@/hooks/useAgentMessages';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useCatData } from '@/hooks/useCatData';
import { useChatHistory } from '@/hooks/useChatHistory';
import { useChatSocketCallbacks } from '@/hooks/useChatSocketCallbacks';
import { abortGame, godAction, submitAction } from '@/hooks/useGameApi';
import { reconnectGame } from '@/hooks/useGameReconnect';
import { usePersistedState } from '@/hooks/usePersistedState';
import { usePreviewAutoOpen } from '@/hooks/usePreviewAutoOpen';
import { useSendMessage, type WhisperOptions } from '@/hooks/useSendMessage';
import { useSocket } from '@/hooks/useSocket';
import { useSplitPaneKeys } from '@/hooks/useSplitPaneKeys';
import { useVadInterrupt } from '@/hooks/useVadInterrupt';
import { useVoiceAutoPlay } from '@/hooks/useVoiceAutoPlay';
import { useVoiceStream } from '@/hooks/useVoiceStream';
import { useWorkspaceNavigate } from '@/hooks/useWorkspaceNavigate';
import { getMentionRe, getMentionToCat } from '@/lib/mention-highlight';
import type { DeliveryMode } from '@/stores/chat-types';
import { type ChatMessage as ChatMessageData, useChatStore } from '@/stores/chatStore';
import { useGameStore } from '@/stores/gameStore';
import { useTaskStore } from '@/stores/taskStore';
import { apiFetch } from '@/utils/api-client';
import { computeScrollRecomputeSignal } from '@/utils/scrollRecomputeSignal';
import { getUserId, setIsSkipAuth } from '@/utils/userId';
import { A2ACollapsible } from './A2ACollapsible';
import { AgentsPanelCopy } from './AgentsPanelCopy';
import { AuthorizationCard } from './AuthorizationCard';
import { BootcampListModal } from './BootcampListModal';
import { CatCafeHub } from './CatCafeHub';
import { ChannelsPanel } from './ChannelsPanel';
import { ChatContainerHeader } from './ChatContainerHeader';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatInput } from './ChatInput';
import { ChatMessage } from './ChatMessage';
import { GameOverlayConnector } from './game/GameOverlayConnector';
import { HubListModal } from './HubListModal';
import { MessageActions } from './MessageActions';
import { MobileStatusSheet } from './MobileStatusSheet';
import { ModelsPanel } from './ModelsPanel';
import { NewThreadContainer } from './NewThreadContainer';
import { ParallelStatusBar } from './ParallelStatusBar';
import { QueuePanel } from './QueuePanel';
import { ScrollToBottomButton } from './ScrollToBottomButton';
import { SkillsPanel } from './SkillsPanel';
import { SplitPaneView } from './SplitPaneView';
import { ThinkingIndicator } from './ThinkingIndicator';
import { ThreadExecutionBar } from './ThreadExecutionBar';
import { ThreadSidebar } from './ThreadSidebar';
import { VoteActiveBar } from './VoteActiveBar';
import { type VoteConfig, VoteConfigModal } from './VoteConfigModal';
import { ResizeHandle } from './workspace/ResizeHandle';

const SIDEBAR_DEFAULT = 240;
const MAIN_PANEL_MIN_WIDTH = 900;

function getFolderNameFromPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const normalized = path.replace(/[\\/]+$/, '');
  const segments = normalized.split(/[/\\]/).filter(Boolean);
  return segments[segments.length - 1] ?? normalized ?? null;
}

type ChatContainerProps =
  | {
      mode: 'new';
      requireLoginCheck?: boolean;
      threadId?: never;
      initialSidebarMenu?: never;
    }
  | {
      mode?: 'thread';
      threadId: string;
      requireLoginCheck?: boolean;
      initialSidebarMenu?: 'chat' | 'models' | 'agents' | 'channels' | 'skills';
    };

export function ChatContainer(props: ChatContainerProps) {
  const [authChecked, setAuthChecked] = useState(!props.requireLoginCheck);
  const [isLoggedIn, setIsLoggedIn] = useState(!props.requireLoginCheck);
  const router = useRouter();

  useEffect(() => {
    if (!props.requireLoginCheck) return;

    let cancelled = false;
    (async () => {
      try {
        const response = await apiFetch('/api/islogin');
        const data = await response.json();
        if (cancelled) return;
        setIsSkipAuth(Boolean(data?.isskip));
        if (data?.islogin) {
          setIsLoggedIn(true);
        } else {
          router.replace('/login');
        }
      } catch (err) {
        if (!cancelled) {
          console.error('检查登录状态失败:', err);
          router.replace('/login');
        }
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [props.requireLoginCheck, router]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return null;
  }

  if (props.mode === 'new') {
    return <NewThreadContainer />;
  }

  return <ThreadModeChatContainer threadId={props.threadId} initialSidebarMenu={props.initialSidebarMenu} />;
}

function ThreadModeChatContainer({
  threadId,
  initialSidebarMenu = 'chat',
}: {
  threadId: string;
  initialSidebarMenu?: 'chat' | 'models' | 'agents' | 'channels' | 'skills';
}) {
  const {
    messages,
    isLoading,
    hasActiveInvocation,
    intentMode,
    targetCats,
    catStatuses,
    catInvocations,
    setCurrentThread,
    viewMode,
    setViewMode,
    clearUnread,
    confirmUnreadAck,
    armUnreadSuppression,
    consumePendingNewThreadSend,
  } = useChatStore();
  const uiThinkingExpandedByDefault = useChatStore((s) => s.uiThinkingExpandedByDefault);

  // F101: Game state from Zustand store
  const gameView = useGameStore((s) => s.gameView);
  const isGameActive = useGameStore((s) => s.isGameActive);
  const isNight = useGameStore((s) => s.isNight);
  const selectedTarget = useGameStore((s) => s.selectedTarget);
  const godScopeFilter = useGameStore((s) => s.godScopeFilter);
  const myRole = useGameStore((s) => s.myRole);
  const myRoleIcon = useGameStore((s) => s.myRoleIcon);
  const myActionLabel = useGameStore((s) => s.myActionLabel);
  const myActionHint = useGameStore((s) => s.myActionHint);
  const isGodView = useGameStore((s) => s.isGodView);
  const isDetective = useGameStore((s) => s.isDetective);
  const detectiveBoundName = useGameStore((s) => s.detectiveBoundName);
  const godSeats = useGameStore((s) => s.godSeats);
  const godNightSteps = useGameStore((s) => s.godNightSteps);
  const hasTargetedAction = useGameStore((s) => s.hasTargetedAction);
  const altActionName = useGameStore((s) => s.altActionName);

  // Export mode: ?export=true triggers print-friendly layout (no scroll containers)
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isExport = searchParams?.get('export') === 'true';
  // AC-6: research=multi hint from the Signal study button
  const isResearchMode = searchParams?.get('research') === 'multi';
  const { clearTasks } = useTaskStore();
  const { getCatById } = useCatData();
  const workspaceWorktreeId = useChatStore((s) => s.workspaceWorktreeId);
  usePreviewAutoOpen(workspaceWorktreeId);
  useWorkspaceNavigate(workspaceWorktreeId, threadId);
  const sidebarOpen = true;
  const [mobileStatusOpen, setMobileStatusOpen] = useState(false);
  const [showBootcampList, setShowBootcampList] = useState(false);
  const [showHubList, setShowHubList] = useState(false);
  const [stoppedIntentRecognition, setStoppedIntentRecognition] = useState<{
    timestamp: number;
    catId: string;
  } | null>(null);
  const [sidebarMenu, setSidebarMenu] = useState<'chat' | 'models' | 'agents' | 'channels' | 'skills'>(
    initialSidebarMenu,
  );
  // F106: fetch bootcamp count independently of sidebar lifecycle
  // refreshKey increments only on modal close to avoid duplicate fetch on open
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_bootcampRefreshKey, setBootcampRefreshKey] = useState(0);
  const handleBootcampModalClose = useCallback(() => {
    setShowBootcampList(false);
    setBootcampRefreshKey((k) => k + 1);
  }, []);
  const [bootcampCount, setBootcampCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/bootcamp/threads')
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const data = await res.json();
        if (!cancelled) setBootcampCount(data.threads?.length ?? 0);
      })
      .catch(() => {
        if (!cancelled) setBootcampCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  // F063: resizable split pane, chatBasis as percentage (20-80), persisted
  // F063 Gap 6: sidebar width in px, persisted
  const [sidebarWidth, setSidebarWidth, resetSidebarWidth] = usePersistedState(
    'cat-cafe:sidebarWidth',
    SIDEBAR_DEFAULT,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const handleSidebarResize = useCallback(
    (delta: number) => {
      setSidebarWidth((prev) => Math.min(480, Math.max(180, prev + delta)));
    },
    [setSidebarWidth],
  );

  const { handleAgentMessage, handleStop: stopHandler, resetRefs, resetTimeout, clearDoneTimeout } = useAgentMessages();
  const { handleScroll, scrollContainerRef, messagesEndRef, isLoadingHistory, hasMore } = useChatHistory(threadId);
  const { handleSend, uploadStatus, uploadError } = useSendMessage(threadId);
  const consumedPendingRequestIdsRef = useRef(new Set<string>());
  const {
    pending: authPending,
    respond: authRespond,
    handleAuthRequest,
    handleAuthResponse,
  } = useAuthorization(threadId);

  useEffect(() => {
    const pending = consumePendingNewThreadSend(threadId);
    if (!pending) return;
    if (consumedPendingRequestIdsRef.current.has(pending.requestId)) return;

    consumedPendingRequestIdsRef.current.add(pending.requestId);
    handleSend(pending.content, pending.images, undefined, pending.whisper, pending.deliveryMode);
  }, [consumePendingNewThreadSend, handleSend, threadId]);

  useEffect(() => {
    const handler = (event: Event) => {
      const menu = (event as CustomEvent<{ menu?: 'skills' }>).detail?.menu;
      if (menu === 'skills') setSidebarMenu('skills');
    };
    window.addEventListener('cat-cafe:open-sidebar-menu', handler);
    return () => window.removeEventListener('cat-cafe:open-sidebar-menu', handler);
  }, []);

  // F096: Listen for interactive block send events
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent<{ text: string }>).detail.text;
      if (text) handleSend(text);
    };
    window.addEventListener('cat-cafe:interactive-send', handler);
    return () => window.removeEventListener('cat-cafe:interactive-send', handler);
  }, [handleSend]);

  // F079: Vote modal
  const showVoteModal = useChatStore((s) => s.showVoteModal);
  const setShowVoteModal = useChatStore((s) => s.setShowVoteModal);
  const { addMessage } = useChatStore();
  const handleVoteSubmit = useCallback(
    async (config: VoteConfig) => {
      setShowVoteModal(false);
      try {
        const res = await apiFetch(`/api/threads/${encodeURIComponent(threadId)}/vote/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        });
        if (res.status === 409) {
          addMessage({
            id: `vote-${Date.now()}`,
            type: 'system',
            variant: 'error',
            content: '已有活跃投票，请先 /vote end',
            timestamp: Date.now(),
          });
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Server error: ${res.status}`);
        }
        const responseData = await res.json();
        // Build @mention notification message and send as user message to trigger cats
        const mentions = config.voters.map((v) => `@${v}`).join(' ');
        const optionList = config.options.map((o) => `- ${o}`).join('\n');
        const questionText = String(responseData.question ?? '');
        const notifyMsg = `${mentions}\n投票请求：${questionText}\n\n选项：\n${optionList}\n\n请在回复中包含 [VOTE:你的选项]，例如 [VOTE:${config.options[0]}]`;
        handleSend(notifyMsg);
      } catch (err) {
        addMessage({
          id: `vote-${Date.now()}`,
          type: 'system',
          variant: 'error',
          content: `发起投票失败: ${err instanceof Error ? err.message : 'Unknown'}`,
          timestamp: Date.now(),
        });
      }
    },
    [threadId, handleSend, setShowVoteModal, addMessage],
  );

  const messageSummary = useMemo(() => {
    const c = { total: messages.length, assistant: 0, system: 0, evidence: 0, followup: 0 };
    for (const msg of messages) {
      const isAssistant = msg.type === 'assistant' || (msg.type === 'user' && !!msg.catId);
      if (isAssistant) c.assistant++;
      if (msg.type === 'system') {
        c.system++;
        if (msg.variant === 'evidence') c.evidence++;
        if (msg.variant === 'a2a_followup') c.followup++;
      }
    }
    return c;
  }, [messages]);

  // Sync URL-driven threadId to store (store is follower, URL is source of truth)
  // setCurrentThread saves old thread state to map, restores new thread state.
  const setCurrentProject = useChatStore((s) => s.setCurrentProject);
  const storeThreads = useChatStore((s) => s.threads);
  const prevThreadRef = useRef(threadId);
  const currentThreadProjectPath = useMemo(
    () => storeThreads?.find((thread) => thread.id === threadId)?.projectPath ?? null,
    [storeThreads, threadId],
  );
  const currentThreadProjectName = useMemo(
    () => getFolderNameFromPath(currentThreadProjectPath),
    [currentThreadProjectPath],
  );
  useEffect(() => {
    if (prevThreadRef.current !== threadId) {
      // Thread switch: store saves/restores per-thread state automatically
      setCurrentThread(threadId);
      // Clean up non-thread-scoped refs
      resetRefs();
      clearTasks();
      prevThreadRef.current = threadId;
    }
    // First mount: sync threadId to store without save/restore
    setCurrentThread(threadId);
    // F101: Recover game state for the new thread (or clear stale game from previous thread)
    reconnectGame(threadId).catch(() => {});
  }, [
    threadId,
    clearTasks, // Clean up non-thread-scoped refs
    resetRefs, // First mount: sync threadId to store without save/restore
    setCurrentThread,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  // B1.1: Restore projectPath when thread or storeThreads change.
  // storeThreads is populated by ThreadSidebar.loadThreads shortly after mount,
  // so this covers both page refresh (threads arrive async) and thread switch.
  useEffect(() => {
    const cached = storeThreads?.find((t) => t.id === threadId);
    if (cached) {
      setCurrentProject(cached.projectPath || 'default');
    }
  }, [threadId, storeThreads, setCurrentProject]);

  const socketCallbacks = useChatSocketCallbacks({
    threadId,
    userId: getUserId(),
    handleAgentMessage,
    resetTimeout,
    clearDoneTimeout,
    handleAuthRequest,
    handleAuthResponse,
    onNavigateToThread: (tid) => router.push(`/thread/${tid}`),
  });

  type RenderItem =
    | { kind: 'message'; msg: ChatMessageData }
    | { kind: 'a2a_group'; groupId: string; messages: ChatMessageData[] };

  const renderItems = useMemo<RenderItem[]>(() => {
    const items: RenderItem[] = [];
    let currentGroup: { groupId: string; messages: ChatMessageData[] } | null = null;

    for (const msg of messages) {
      if (msg.a2aGroupId) {
        if (currentGroup && currentGroup.groupId === msg.a2aGroupId) {
          currentGroup.messages.push(msg);
        } else {
          if (currentGroup) items.push({ kind: 'a2a_group', ...currentGroup });
          currentGroup = { groupId: msg.a2aGroupId, messages: [msg] };
        }
      } else {
        if (currentGroup) {
          items.push({ kind: 'a2a_group', ...currentGroup });
          currentGroup = null;
        }
        items.push({ kind: 'message', msg });
      }
    }
    if (currentGroup) items.push({ kind: 'a2a_group', ...currentGroup });
    return items;
  }, [messages]);

  const pendingIntentRecognitionTimestamp = useMemo(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.type !== 'user' || lastMessage.catId) return null;
    if (!isLoading || !hasActiveInvocation) return null;
    if (intentMode === null) return lastMessage.timestamp;

    const hasAssistantResponseStarted = messages.some(
      (message) =>
        message.type === 'assistant' &&
        message.timestamp >= lastMessage.timestamp &&
        (
          message.isStreaming ||
          message.content.trim().length > 0 ||
          Boolean(message.thinking) ||
          Boolean(message.toolEvents?.length) ||
          Boolean(message.contentBlocks?.length) ||
          Boolean(message.extra?.rich?.blocks?.length)
        ),
    );

    if (!hasAssistantResponseStarted) return lastMessage.timestamp;
    return null;
  }, [hasActiveInvocation, intentMode, isLoading, messages]);

  const pendingIntentRecognitionCatId = useMemo(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.type !== 'user' || lastMessage.catId) return 'jiuwenclaw';

    const mentionMatches = Array.from(lastMessage.content.matchAll(getMentionRe()))
      .map((match) => getMentionToCat()[match[1]?.toLowerCase() ?? ''])
      .filter((catId): catId is string => Boolean(catId) && catId !== '__co-creator__');

    if (mentionMatches.length > 0) return mentionMatches[0];
    if (targetCats.length > 0) return targetCats[0];
    return 'jiuwenclaw';
  }, [messages, targetCats]);

  useEffect(() => {
    if (!stoppedIntentRecognition) return;

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) {
      setStoppedIntentRecognition(null);
      return;
    }

    if (
      pendingIntentRecognitionTimestamp != null &&
      pendingIntentRecognitionTimestamp !== stoppedIntentRecognition.timestamp
    ) {
      setStoppedIntentRecognition(null);
      return;
    }

    if (pendingIntentRecognitionTimestamp == null && lastMessage.timestamp !== stoppedIntentRecognition.timestamp) {
      setStoppedIntentRecognition(null);
    }
  }, [messages, pendingIntentRecognitionTimestamp, stoppedIntentRecognition]);

  const showThinkingIndicator =
    sidebarMenu === 'chat' &&
    intentMode === 'execute' &&
    pendingIntentRecognitionTimestamp == null;

  const renderSingleMessage = useCallback(
    (msg: ChatMessageData) => (
      <MessageActions key={msg.id} message={msg} threadId={threadId}>
        <ChatMessage message={msg} getCatById={getCatById} />
      </MessageActions>
    ),
    [threadId, getCatById],
  );

  const { cancelInvocation, syncRooms } = useSocket(socketCallbacks, threadId);

  useVoiceAutoPlay();
  useVoiceStream();
  useVadInterrupt();

  useSplitPaneKeys();
  const splitPaneThreadIds = useChatStore((s) => s.splitPaneThreadIds);
  const setSplitPaneThreadIds = useChatStore((s) => s.setSplitPaneThreadIds);
  const setSplitPaneTarget = useChatStore((s) => s.setSplitPaneTarget);

  useEffect(() => {
    if (viewMode === 'split' && splitPaneThreadIds.length === 0 && threadId !== 'default') {
      setSplitPaneThreadIds([threadId]);
      setSplitPaneTarget(threadId);
    }
  }, [viewMode, splitPaneThreadIds.length, threadId, setSplitPaneThreadIds, setSplitPaneTarget]);

  useEffect(() => {
    if (viewMode === 'split' && splitPaneThreadIds.length > 0) {
      // Join rooms for all threads in panes + the current active thread
      const allIds = new Set([...splitPaneThreadIds, threadId]);
      syncRooms([...allIds]);
    }
  }, [viewMode, splitPaneThreadIds, threadId, syncRooms]);

  useEffect(() => {
    clearUnread(threadId);
  }, [threadId, clearUnread]);

  // F069-R5: Ack read cursor server-side. The backend finds the latest real message
  // and acks it atomically, with no frontend ID guessing and no timing races with fetchHistory.
  // Fires on thread entry AND when new messages arrive (messages.length changes),
  // so switching away after receiving new messages still acks to the latest.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _messageCount = messages.length;
  useEffect(() => {
    // Re-arm suppression before each ack. /read/latest is idempotent, so any
    // successful POST means server cursor is at latest, so any successful ack
    // can safely clear suppression (no generation tracking needed).
    armUnreadSuppression(threadId);
    apiFetch(`/api/threads/${encodeURIComponent(threadId)}/read/latest`, {
      method: 'POST',
    })
      .then((res) => {
        if (res.ok) {
          confirmUnreadAck(threadId);
        }
      })
      .catch((err) => {
        console.debug('[F069] read ack failed:', err);
      });
  }, [threadId, _messageCount, confirmUnreadAck, armUnreadSuppression]);

  const handleStop = useCallback(
    (overrideThreadId?: unknown) => {
      const targetThreadId = typeof overrideThreadId === 'string' ? overrideThreadId : threadId;
      if (targetThreadId === threadId && pendingIntentRecognitionTimestamp != null) {
        setStoppedIntentRecognition({
          timestamp: pendingIntentRecognitionTimestamp,
          catId: pendingIntentRecognitionCatId,
        });
      }
      stopHandler(cancelInvocation, targetThreadId);
    },
    [stopHandler, cancelInvocation, pendingIntentRecognitionCatId, pendingIntentRecognitionTimestamp, threadId],
  );

  const router = useRouter();

  const handleZoomToThread = useCallback(
    (tid: string) => {
      setViewMode('single');
      router.push(`/thread/${tid}`);
    },
    [setViewMode, router],
  );

  if (viewMode === 'split') {
    return (
      <>
        <SplitPaneView
          onSend={handleSend}
          onStop={handleStop}
          uploadStatus={uploadStatus}
          uploadError={uploadError}
          onZoomToThread={handleZoomToThread}
        />
        <CatCafeHub />
      </>
    );
  }

  // Export mode: print-friendly layout with no sidebars or scroll containers
  if (isExport) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-4xl mx-auto p-4">
          {renderItems.map((item) =>
            item.kind === 'a2a_group' ? (
              <A2ACollapsible
                key={item.groupId}
                group={{ groupId: item.groupId, messages: item.messages }}
                renderMessage={renderSingleMessage}
                getCatColor={(catId) => getCatById(catId)?.color.primary}
              />
            ) : (
              renderSingleMessage(item.msg)
            ),
          )}
        </div>
      </div>
    );
  }
  return (
    <div ref={containerRef} className="ui-shell-surface flex h-screen h-dvh overflow-hidden">
        <div className="z-30 h-full flex-shrink-0" style={{ width: sidebarWidth }}>
          <ThreadSidebar
            className="w-full"
            onBootcampClick={() => setShowBootcampList(true)}
            onHubClick={() => setShowHubList(true)}
            onThreadSelect={() => setSidebarMenu('chat')}
            onMenuClick={(menu) => setSidebarMenu(menu)}
            activeMenu={sidebarMenu === 'chat' ? undefined : sidebarMenu}
          />
        </div>
        <div className="hidden md:flex items-center">
          <ResizeHandle direction="horizontal" onResize={handleSidebarResize} onDoubleClick={resetSidebarWidth} />
        </div>
      <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex h-full min-h-0 flex-col" style={{ minWidth: MAIN_PANEL_MIN_WIDTH }}>
        {sidebarMenu === 'chat' && (
          <ChatContainerHeader
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => {}}
            threadId={threadId}
            authPendingCount={authPending.length}
            targetCats={targetCats}
            viewMode={viewMode}
            onToggleViewMode={() => setViewMode(viewMode === 'single' ? 'split' : 'single')}
            onOpenMobileStatus={() => setMobileStatusOpen(true)}
            defaultCatId={targetCats[0] || 'jiuwenclaw'}
          />
        )}

        {sidebarMenu === 'chat' && intentMode === 'ideate' && <ParallelStatusBar onStop={handleStop} />}
        {showThinkingIndicator && <ThinkingIndicator onCancel={cancelInvocation} />}

        <div className="relative flex-1 min-h-0 overflow-hidden">
          {sidebarMenu !== 'chat' && (
            <div className="ui-shell-surface h-full overflow-hidden px-12 pt-12 pb-5">
              {sidebarMenu === 'models' && <ModelsPanel />}
              {sidebarMenu === 'agents' && <AgentsPanelCopy />}
              {sidebarMenu === 'channels' && <ChannelsPanel />}
              {sidebarMenu === 'skills' && <SkillsPanel />}
            </div>
          )}
          {sidebarMenu === 'chat' && (
            <main
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="ui-shell-surface h-full min-h-0 overflow-y-auto p-4"
              data-chat-container
            >
              {isLoadingHistory && <div className="text-center py-3 text-sm text-gray-400">加载历史消息...</div>}
              {!hasMore && messages.length > 0 && (
                <div className="text-center py-3 text-xs text-gray-300 hidden">没有更多消息...</div>
              )}
              {messages.length === 0 && !isLoadingHistory ? (
                <ChatEmptyState
                  bootcampCount={bootcampCount}
                  isCurrentBootcampThread={!!storeThreads.find((t) => t.id === threadId)?.bootcampState}
                  onOpenBootcampList={() => setShowBootcampList(true)}
                />
              ) : (
                renderItems.map((item) =>
                  item.kind === 'a2a_group' ? (
                    <A2ACollapsible
                      key={item.groupId}
                      group={{ groupId: item.groupId, messages: item.messages }}
                      renderMessage={renderSingleMessage}
                      getCatColor={(catId) => getCatById(catId)?.color.primary}
                    />
                  ) : (
                    renderSingleMessage(item.msg)
                  ),
                )
              )}
              {pendingIntentRecognitionTimestamp != null &&
                renderSingleMessage({
                  id: `intent-recognition-${pendingIntentRecognitionTimestamp}`,
                  type: 'assistant',
                  catId: pendingIntentRecognitionCatId,
                  content: '',
                  timestamp: pendingIntentRecognitionTimestamp,
                  variant: 'intent_recognition',
                } as ChatMessageData)}
              {pendingIntentRecognitionTimestamp == null &&
                stoppedIntentRecognition != null &&
                renderSingleMessage({
                  id: `intent-recognition-stopped-${stoppedIntentRecognition.timestamp}`,
                  type: 'assistant',
                  catId: stoppedIntentRecognition.catId,
                  content: 'stopped',
                  timestamp: stoppedIntentRecognition.timestamp,
                  variant: 'intent_recognition',
                } as ChatMessageData)}
              <div ref={messagesEndRef} />
              {sidebarMenu === 'chat' && (
                <ScrollToBottomButton
                  scrollContainerRef={scrollContainerRef}
                  messagesEndRef={messagesEndRef}
                  recomputeSignal={computeScrollRecomputeSignal(
                    threadId,
                    messages,
                    uiThinkingExpandedByDefault ? 1 : 0,
                  )}
                  observerKey={threadId}
                />
              )}
            </main>
          )}
        </div>

        {sidebarMenu === 'chat' && authPending.length > 0 && (
          <div className="border-t border-amber-200 bg-amber-50/40 py-2">
            {authPending.map((req) => (
              <AuthorizationCard key={req.requestId} request={req} onRespond={authRespond} />
            ))}
          </div>
        )}

        {sidebarMenu === 'chat' && <ThreadExecutionBar />}
        {sidebarMenu === 'chat' && <QueuePanel threadId={threadId} />}
        {sidebarMenu === 'chat' && <VoteActiveBar threadId={threadId} onEnd={() => {}} />}

        {sidebarMenu === 'chat' && isResearchMode && (
          <div className="mx-4 mb-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            多智能体研究模式 - 文章上下文已注入。请输入研究问题，智能体会自动调用 multi_mention 邀请其他智能体参与分析。
          </div>
        )}
        {sidebarMenu === 'chat' && (
          <ChatInput
            key={threadId}
            threadId={threadId}
            onSend={(content, images, whisper, deliveryMode) =>
              handleSend(content, images, undefined, whisper, deliveryMode)
            }
            onStop={handleStop}
            disabled={false}
            folderSelectionEnabled={false}
            selectedFolderName={currentThreadProjectName}
            selectedFolderTitle={currentThreadProjectPath}
            hasActiveInvocation={hasActiveInvocation}
            uploadStatus={uploadStatus}
            uploadError={uploadError}
          />
        )}

        {/* F101: Game overlay, renders when a game is active */}
        <GameOverlayConnector
          gameView={gameView}
          isGameActive={isGameActive}
          currentThreadId={threadId}
          isNight={isNight}
          selectedTarget={selectedTarget}
          godScopeFilter={godScopeFilter}
          isGodView={isGodView}
          isDetective={isDetective}
          detectiveBoundName={detectiveBoundName ?? undefined}
          godSeats={godSeats}
          godNightSteps={godNightSteps}
          hasTargetedAction={hasTargetedAction}
          myRole={myRole ?? undefined}
          myRoleIcon={myRoleIcon ?? undefined}
          myActionLabel={myActionLabel ?? undefined}
          myActionHint={myActionHint ?? undefined}
          altActionName={altActionName ?? undefined}
          onClose={() => {
            abortGame(threadId);
            useGameStore.getState().clearGame();
          }}
          onSelectTarget={(seatId) => useGameStore.getState().setSelectedTarget(seatId)}
          onGodScopeChange={(scope) => useGameStore.getState().setGodScopeFilter(scope)}
          onGodAction={(action) => godAction(threadId, action)}
          onVote={() => {
            const state = useGameStore.getState();
            if (state.selectedTarget && state.mySeatId) {
              submitAction(threadId, state.mySeatId, 'vote', state.selectedTarget);
              state.setSelectedTarget(null);
            }
          }}
          onSpeak={(content) => {
            const state = useGameStore.getState();
            if (state.mySeatId) {
              submitAction(threadId, state.mySeatId, 'speak', undefined, { content });
            }
          }}
          onConfirmAction={() => {
            const state = useGameStore.getState();
            if (state.selectedTarget && state.mySeatId && state.currentActionName) {
              submitAction(threadId, state.mySeatId, state.currentActionName, state.selectedTarget);
              state.setSelectedTarget(null);
            }
          }}
          onConfirmAltAction={() => {
            const state = useGameStore.getState();
            if (state.selectedTarget && state.mySeatId && state.altActionName) {
              submitAction(threadId, state.mySeatId, state.altActionName, state.selectedTarget);
              state.setSelectedTarget(null);
            }
          }}
        />
        </div>
      </div>

      <MobileStatusSheet
        open={mobileStatusOpen}
        onClose={() => setMobileStatusOpen(false)}
        intentMode={intentMode}
        targetCats={targetCats}
        catStatuses={catStatuses}
        catInvocations={catInvocations}
        threadId={threadId}
        messageSummary={messageSummary}
      />
      <CatCafeHub />
      <BootcampListModal open={showBootcampList} onClose={handleBootcampModalClose} currentThreadId={threadId} />
      <HubListModal open={showHubList} onClose={() => setShowHubList(false)} currentThreadId={threadId} />
      {showVoteModal && <VoteConfigModal onSubmit={handleVoteSubmit} onCancel={() => setShowVoteModal(false)} />}
    </div>
  );
}
