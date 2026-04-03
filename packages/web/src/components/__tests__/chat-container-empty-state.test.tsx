import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatContainer } from '@/components/ChatContainer';

type MockStoreState = {
  messages: unknown[];
  hasActiveInvocation: boolean;
  intentMode: null;
  targetCats: string[];
  catStatuses: Record<string, string>;
  catInvocations: Record<string, unknown>;
  setCurrentThread: ReturnType<typeof vi.fn>;
  viewMode: 'single';
  setViewMode: ReturnType<typeof vi.fn>;
  clearUnread: ReturnType<typeof vi.fn>;
  confirmUnreadAck: ReturnType<typeof vi.fn>;
  armUnreadSuppression: ReturnType<typeof vi.fn>;
  rightPanelMode: 'status' | 'workspace';
  uiThinkingExpandedByDefault: boolean;
  workspaceWorktreeId: string | null;
  splitPaneThreadIds: string[];
  setSplitPaneThreadIds: ReturnType<typeof vi.fn>;
  setSplitPaneTarget: ReturnType<typeof vi.fn>;
  threads: Array<{ id: string; title?: string; projectPath?: string; bootcampState?: boolean }>;
  setCurrentProject: ReturnType<typeof vi.fn>;
  showVoteModal: boolean;
  setShowVoteModal: ReturnType<typeof vi.fn>;
  addMessage: ReturnType<typeof vi.fn>;
  consumePendingNewThreadSend: ReturnType<typeof vi.fn>;
};

const createMockStoreState = (): MockStoreState => ({
  messages: [],
  hasActiveInvocation: false,
  intentMode: null,
  targetCats: [],
  catStatuses: {},
  catInvocations: {},
  setCurrentThread: vi.fn(),
  viewMode: 'single',
  setViewMode: vi.fn(),
  clearUnread: vi.fn(),
  confirmUnreadAck: vi.fn(),
  armUnreadSuppression: vi.fn(),
  rightPanelMode: 'status',
  uiThinkingExpandedByDefault: false,
  workspaceWorktreeId: null,
  splitPaneThreadIds: [],
  setSplitPaneThreadIds: vi.fn(),
  setSplitPaneTarget: vi.fn(),
  threads: [],
  setCurrentProject: vi.fn(),
  showVoteModal: false,
  setShowVoteModal: vi.fn(),
  addMessage: vi.fn(),
  consumePendingNewThreadSend: vi.fn(() => null),
});

let mockState = createMockStoreState();

vi.mock('@/stores/chatStore', () => ({
  useChatStore: (selector?: (state: MockStoreState) => unknown) => (selector ? selector(mockState) : mockState),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/stores/taskStore', () => ({
  useTaskStore: () => ({ clearTasks: vi.fn() }),
}));
vi.mock('@/stores/gameStore', () => ({
  useGameStore: () => ({
    gameView: null,
    isGameActive: false,
    isNight: false,
    selectedTarget: null,
    godScopeFilter: 'all',
    myRole: null,
    myRoleIcon: null,
    myActionLabel: null,
    myActionHint: null,
    isGodView: false,
    isDetective: false,
    detectiveBoundName: null,
    godSeats: [],
    godNightSteps: [],
    hasTargetedAction: false,
    altActionName: null,
    clearGame: vi.fn(),
    setSelectedTarget: vi.fn(),
    setGodScopeFilter: vi.fn(),
  }),
}));
vi.mock('@/hooks/useSocket', () => ({
  useSocket: () => ({ cancelInvocation: vi.fn(), syncRooms: vi.fn() }),
}));
vi.mock('@/hooks/useAgentMessages', () => ({
  useAgentMessages: () => ({
    handleAgentMessage: vi.fn(),
    handleStop: vi.fn(),
    resetRefs: vi.fn(),
    resetTimeout: vi.fn(),
    clearDoneTimeout: vi.fn(),
  }),
}));
vi.mock('@/hooks/useChatHistory', () => ({
  useChatHistory: () => ({
    handleScroll: vi.fn(),
    scrollContainerRef: { current: null },
    messagesEndRef: { current: null },
    isLoadingHistory: false,
    hasMore: false,
  }),
}));
vi.mock('@/hooks/useSendMessage', () => ({
  useSendMessage: () => ({ handleSend: vi.fn(), uploadStatus: null, uploadError: null }),
}));
vi.mock('@/hooks/useAuthorization', () => ({
  useAuthorization: () => ({ pending: [], respond: vi.fn(), handleAuthRequest: vi.fn(), handleAuthResponse: vi.fn() }),
}));
vi.mock('@/hooks/useSplitPaneKeys', () => ({ useSplitPaneKeys: vi.fn() }));
vi.mock('@/hooks/useChatSocketCallbacks', () => ({
  useChatSocketCallbacks: () => ({}),
}));
vi.mock('@/hooks/useCatData', () => ({
  useCatData: () => ({ getCatById: vi.fn() }),
}));
vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'warm',
    config: {
      sidebar: { bg: '#fff' },
      content: { bg: '#fff' },
    },
  }),
}));
vi.mock('@/hooks/usePreviewAutoOpen', () => ({ usePreviewAutoOpen: vi.fn() }));
vi.mock('@/hooks/useWorkspaceNavigate', () => ({ useWorkspaceNavigate: vi.fn() }));
vi.mock('@/hooks/useVoiceAutoPlay', () => ({ useVoiceAutoPlay: vi.fn() }));
vi.mock('@/hooks/useVoiceStream', () => ({ useVoiceStream: vi.fn() }));
vi.mock('@/hooks/useVadInterrupt', () => ({ useVadInterrupt: vi.fn() }));
vi.mock('@/hooks/usePersistedState', () => ({
  usePersistedState: (_key: string, initialValue: number) => [initialValue, vi.fn(), vi.fn()],
}));
vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(() => new Promise(() => {})),
}));
vi.mock('@/utils/userId', () => ({ getUserId: () => 'test-user' }));

vi.mock('@/components/A2ACollapsible', () => ({ A2ACollapsible: () => null }));
vi.mock('@/components/AgentsPanel', () => ({ AgentsPanel: () => null }));
vi.mock('@/components/AuthorizationCard', () => ({ AuthorizationCard: () => null }));
vi.mock('@/components/BootcampListModal', () => ({ BootcampListModal: () => null }));
vi.mock('@/components/CatCafeHub', () => ({ CatCafeHub: () => null }));
vi.mock('@/components/ChannelsPanel', () => ({ ChannelsPanel: () => null }));
vi.mock('@/components/ChatContainerHeader', () => ({
  ChatContainerHeader: () => React.createElement('div', { 'data-testid': 'chat-header' }),
}));
vi.mock('@/components/ChatInput', () => ({ ChatInput: () => null }));
vi.mock('@/components/ChatMessage', () => ({ ChatMessage: () => null }));
vi.mock('@/components/game/GameOverlayConnector', () => ({ GameOverlayConnector: () => null }));
vi.mock('@/components/HubListModal', () => ({ HubListModal: () => null }));
vi.mock('@/components/MessageActions', () => ({
  MessageActions: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/MessageNavigator', () => ({ MessageNavigator: () => null }));
vi.mock('@/components/MobileStatusSheet', () => ({ MobileStatusSheet: () => null }));
vi.mock('@/components/ModelsPanel', () => ({ ModelsPanel: () => null }));
vi.mock('@/components/ParallelStatusBar', () => ({ ParallelStatusBar: () => null }));
vi.mock('@/components/QueuePanel', () => ({ QueuePanel: () => null }));
vi.mock('@/components/RightStatusPanel', () => ({ RightStatusPanel: () => null }));
vi.mock('@/components/ScrollToBottomButton', () => ({ ScrollToBottomButton: () => null }));
vi.mock('@/components/SkillsPanel', () => ({ SkillsPanel: () => null }));
vi.mock('@/components/SplitPaneView', () => ({ SplitPaneView: () => null }));
vi.mock('@/components/ThinkingIndicator', () => ({ ThinkingIndicator: () => null }));
vi.mock('@/components/ThreadExecutionBar', () => ({ ThreadExecutionBar: () => null }));
vi.mock('@/components/ThreadSidebar', () => ({ ThreadSidebar: () => null }));
vi.mock('@/components/VoteConfigModal', () => ({ VoteConfigModal: () => null }));
vi.mock('@/components/VoteActiveBar', () => ({ VoteActiveBar: () => null }));
vi.mock('@/components/WorkspacePanel', () => ({ WorkspacePanel: () => null }));
vi.mock('@/components/workspace/ResizeHandle', () => ({ ResizeHandle: () => null }));

describe('ChatContainer empty state', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('min-width: 768px'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    mockState = createMockStoreState();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('renders the hero empty state and keeps bootcamp entry hidden by default', () => {
    mockState = createMockStoreState();
    window.history.replaceState({}, '', '/thread/default?research=multi');

    act(() => {
      root.render(React.createElement(ChatContainer, { threadId: 'default' }));
    });

    expect(container.textContent).toContain('OfficeClaw');
    expect(container.textContent).toContain('\u5236\u5b9a\u76ee\u6807\u81ea\u52a8\u89c4\u5212\u6267\u884c');
    expect(container.textContent).toContain('\u667a\u80fd\u4f53\u914d\u7f6e');
    expect(container.textContent).toContain('\u4e00\u952e\u63a5\u5165 IM');
    expect(container.textContent).toContain('\u591a\u732b\u7814\u7a76\u6a21\u5f0f');
    expect(container.textContent).toContain('multi_mention');
    expect(container.querySelector('[data-testid="empty-state-bootcamp"]')).toBeNull();
    expect(container.querySelector('[data-testid="empty-state-bootcamp-list"]')).toBeNull();
  });
});
