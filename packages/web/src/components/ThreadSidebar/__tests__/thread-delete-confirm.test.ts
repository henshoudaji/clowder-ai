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

  function openDeleteDialog() {
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

    const deleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('\u5220\u9664\u5bf9\u8bdd'),
    );
    expect(deleteBtn, 'delete menu item should exist for non-default thread').toBeTruthy();

    act(() => {
      (deleteBtn as HTMLButtonElement).click();
    });
  }

  it('shows confirmation dialog when clicking delete', async () => {
    act(() => {
      root.render(React.createElement(ThreadSidebar));
    });
    await flush();
    expect(container.textContent).toContain('\u5bf9\u8bdd');
    expect(container.textContent).toContain('\u6a21\u578b');
    expect(container.textContent).toContain('\u667a\u80fd\u4f53');
    expect(container.textContent).toContain('\u6e20\u9053');
    expect(container.textContent).toContain('\u6280\u80fd');
    openDeleteDialog();

    // Dialog should appear with thread title and warning
    expect(container.textContent).toContain('\u786e\u8ba4\u5220\u9664\u5bf9\u8bdd');
    expect(container.textContent).toContain('\u6d4b\u8bd5\u5bf9\u8bdd\u6807\u9898');
    expect(container.textContent).toContain('\u56de\u6536\u7ad9');

    const backdrop = container.querySelector('.fixed.inset-0');
    expect(backdrop?.className).toContain('bg-black/35');
    expect(backdrop?.className).toContain('p-4');

    const dialog = Array.from(container.querySelectorAll('div')).find((node) =>
      node.className.includes('shadow-2xl') && node.textContent?.includes('\u786e\u8ba4\u5220\u9664\u5bf9\u8bdd'),
    );
    expect(dialog?.className).toContain('w-[500px]');
    expect(dialog?.className).toContain('rounded-2xl');
    expect(dialog?.className).toContain('border');
    expect(dialog?.className).toContain('border-[#E5EAF0]');
    expect(dialog?.className).toContain('bg-white');
    expect(dialog?.className).toContain('p-6');

    const stack = Array.from(dialog?.children ?? []).find((node) =>
      (node as HTMLDivElement).className?.includes('flex flex-col gap-5'),
    ) as HTMLDivElement | undefined;
    expect(stack?.className).toContain('flex');
    expect(stack?.className).toContain('flex-col');
    expect(stack?.className).toContain('gap-5');

    const headerRow = Array.from(stack?.children ?? []).find((node) =>
      (node as HTMLDivElement).className?.includes('flex items-center justify-between'),
    ) as HTMLDivElement | undefined;
    expect(headerRow?.className).toContain('flex');
    expect(headerRow?.className).toContain('items-center');
    expect(headerRow?.className).toContain('justify-between');

    const closeBtn = Array.from(headerRow?.querySelectorAll('button') ?? []).find((button) =>
      button.getAttribute('aria-label') === 'close',
    ) as HTMLButtonElement | undefined;
    expect(closeBtn?.className).toContain('flex h-6 w-6 items-center justify-center');
    expect(closeBtn?.className).toContain('hover:bg-[#F7F8FA]');

    const contentBlock = Array.from(stack?.children ?? []).find((node) =>
      (node as HTMLDivElement).className?.includes('space-y-1'),
    ) as HTMLDivElement | undefined;
    expect(contentBlock?.className).toContain('space-y-1');

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
    openDeleteDialog();
    expect(container.textContent).toContain('\u786e\u8ba4\u5220\u9664\u5bf9\u8bdd');

    const cancelBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '\u53d6\u6d88')!;
    expect(cancelBtn.className).toContain('ui-button-secondary');

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
    openDeleteDialog();

    // Click confirm
    const confirmBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '\u79fb\u5165\u56de\u6536\u7ad9')!;
    expect(confirmBtn).toBeTruthy();
    expect(confirmBtn.className).toContain('ui-button-primary');

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
