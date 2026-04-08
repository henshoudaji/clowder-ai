/**
 * I-1: Thread deletion must show a confirmation dialog before proceeding.
 * Verifies that clicking delete shows a dialog, cancel dismisses it,
 * and confirm actually triggers the DELETE API call.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreadSidebar } from '../ThreadSidebar';

// ── Mocks ─────────────────────────────────────────────────────
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

const mockApiFetch = vi.fn();
vi.mock('@/utils/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  API_URL: 'http://localhost:3102',
}));

const TEST_THREAD = {
  id: 'thread_abc123',
  title: '\u6d4b\u8bd5\u5bf9\u8bdd\u6807\u9898',
  projectPath: '/projects/cat-cafe',
  createdBy: 'user1',
  participants: ['user1'],
  lastActiveAt: Date.now(),
  createdAt: Date.now() - 100000,
  pinned: false,
  favorited: false,
  preferredCats: [] as string[],
};

let storeThreads = [TEST_THREAD];
const mockStore: Record<string, unknown> = {
  get threads() {
    return storeThreads;
  },
  currentThreadId: 'default',
  setThreads: vi.fn((t: typeof storeThreads) => {
    storeThreads = t;
  }),
  setCurrentProject: vi.fn(),
  isLoadingThreads: false,
  setLoadingThreads: vi.fn(),
  updateThreadTitle: vi.fn(),
  getThreadState: () => ({ catStatuses: {}, unreadCount: 0 }),
  updateThreadPin: vi.fn(),
  updateThreadFavorite: vi.fn(),
  updateThreadPreferredCats: vi.fn(),
  threadStates: {},
  clearAllUnread: vi.fn(),
  initThreadUnread: vi.fn(),
};
vi.mock('@/stores/chatStore', () => {
  const hook = Object.assign(
    (selector?: (s: typeof mockStore) => unknown) => (selector ? selector(mockStore) : mockStore),
    { getState: () => mockStore },
  );
  return { useChatStore: hook };
});
vi.mock('../TaskPanel', () => ({ TaskPanel: () => null }));
vi.mock('@/hooks/useCatData', () => ({
  useCatData: () => ({ getCatById: () => null, cats: [] }),
}));

function jsonOk(data: unknown) {
  return Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve(data) });
}

describe('Thread delete confirmation (I-1)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    storeThreads = [TEST_THREAD];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockApiFetch.mockReset();
    mockPush.mockReset();
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/api/threads') return jsonOk({ threads: [TEST_THREAD] });
      return jsonOk({});
    });
    // Provide localStorage stub for collapse-state persistence
    const store: Record<string, string> = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function flush() {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }

  async function openDeleteDialog() {
    const threadTitle = Array.from(container.querySelectorAll('.ui-thread-title')).find((node) =>
      node.textContent?.includes('\u6d4b\u8bd5\u5bf9\u8bdd\u6807\u9898'),
    );
    expect(threadTitle, 'thread row should exist').toBeTruthy();

    const threadItem = threadTitle?.closest('.ui-thread-item') as HTMLDivElement | null;
    expect(threadItem, 'thread item should exist').toBeTruthy();

    act(() => {
      threadItem?.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 120,
          clientY: 120,
        }),
      );
    });

    await flush();

    const menu = container.querySelector('.fixed.z-50.inline-block') as HTMLDivElement | null;
    expect(menu, 'context menu should open').toBeTruthy();

    const menuButtons = Array.from(menu?.querySelectorAll('button') ?? []);
    const deleteBtn = menuButtons.at(-1) as HTMLButtonElement | undefined;
    expect(deleteBtn, 'delete menu item should exist for non-default thread').toBeTruthy();

    act(() => {
      (deleteBtn as HTMLButtonElement).click();
    });

    await flush();
  }

  it('shows confirmation dialog when clicking delete', async () => {
    act(() => {
      root.render(React.createElement(ThreadSidebar));
    });
    await flush();
    await openDeleteDialog();

    // Dialog should appear with thread title and warning
    expect(container.textContent).toContain('\u786e\u8ba4\u5220\u9664\u5bf9\u8bdd');
    expect(container.textContent).toContain('\u6d4b\u8bd5\u5bf9\u8bdd\u6807\u9898');
    expect(container.textContent).toContain('\u56de\u6536\u7ad9');

    const backdrop = container.querySelector('[data-testid=\"thread-delete-modal\"]') as HTMLDivElement | null;
    expect(backdrop?.className).toContain('ui-modal-backdrop');

    const dialog = container.querySelector('[data-testid=\"thread-delete-modal-panel\"]') as HTMLDivElement | null;
    expect(dialog?.className).toContain('ui-modal-panel');
    expect(dialog?.className).toContain('w-[500px]');

    const stack = container.querySelector('[data-testid=\"thread-delete-modal-content\"]') as HTMLDivElement | null;
    expect(stack?.className).toContain('flex');
    expect(stack?.className).toContain('flex-col');
    expect(stack?.className).toContain('gap-5');

    const closeBtn = dialog?.querySelector('button[aria-label=\"close\"]') as HTMLButtonElement | null;
    expect(closeBtn?.className).toContain('ui-modal-close-button');

    // No DELETE API call yet
    const deleteCalls = mockApiFetch.mock.calls.filter(
      (call: unknown[]) => (call[1] as { method?: string } | undefined)?.method === 'DELETE',
    );
    expect(deleteCalls).toHaveLength(0);
  });

  it('dismisses dialog when clicking cancel', async () => {
    act(() => {
      root.render(React.createElement(ThreadSidebar));
    });
    await flush();
    await openDeleteDialog();
    expect(container.textContent).toContain('\u786e\u8ba4\u5220\u9664\u5bf9\u8bdd');

    const cancelBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '\u53d6\u6d88')!;
    expect(cancelBtn.className).toContain('ui-button-default');
    expect(cancelBtn.className).not.toContain('ui-button-secondary');
    expect(cancelBtn.className).toContain('ui-modal-action-button');

    // Click cancel
    act(() => {
      cancelBtn.click();
    });

    // Dialog should be gone
    expect(container.textContent).not.toContain('\u786e\u8ba4\u5220\u9664\u5bf9\u8bdd');
  });

  it('calls DELETE API only after clicking confirm', async () => {
    act(() => {
      root.render(React.createElement(ThreadSidebar));
    });
    await flush();
    await openDeleteDialog();

    // Click confirm
    const confirmBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '\u79fb\u5165\u56de\u6536\u7ad9')!;
    expect(confirmBtn).toBeTruthy();
    expect(confirmBtn.className).toContain('ui-button-danger');
    expect(confirmBtn.className).toContain('ui-modal-action-button');

    await act(async () => {
      confirmBtn.click();
    });
    await flush();

    // Now DELETE should have been called
    const deleteCalls = mockApiFetch.mock.calls.filter(
      (call: unknown[]) =>
        call[0] === `/api/threads/${TEST_THREAD.id}` &&
        (call[1] as { method?: string } | undefined)?.method === 'DELETE',
    );
    expect(deleteCalls).toHaveLength(1);
  });
});
