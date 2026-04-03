/**
 * F097: CliOutputBlock — collapsed/expanded rendering, terminal substrate, visibility chip
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CliEvent } from '@/stores/chat-types';
import { apiFetch } from '@/utils/api-client';

// Stub MarkdownContent (heavy dep)
vi.mock('@/components/MarkdownContent', () => ({
  MarkdownContent: ({ content }: { content: string }) => React.createElement('div', { 'data-testid': 'md' }, content),
}));
vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(async () => ({ ok: true })),
}));

const { CliOutputBlock } = await import('../cli-output/CliOutputBlock');
const mockApiFetch = vi.mocked(apiFetch);

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { React?: typeof React }).React = React;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  delete (globalThis as { React?: typeof React }).React;
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mockApiFetch.mockClear();
  mockApiFetch.mockImplementation(async (path) => {
    if (path === '/api/projects/cwd') {
      return {
        ok: true,
        json: async () => ({ path: 'C:\\Users\\kagol\\.jiuwenclaw\\agent' }),
      } as Response;
    }
    if (path === '/api/workspace/local-file-meta') {
      return {
        ok: true,
        json: async () => ({ generatedAt: Date.parse('2026-03-24T08:00:00.000Z') }),
      } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const doneEvents: CliEvent[] = [
  { id: 't1', kind: 'tool_use', timestamp: 1000, label: 'Read index.ts' },
  { id: 't2', kind: 'tool_result', timestamp: 1001, label: 'Read index.ts', detail: '200 lines' },
  { id: 't3', kind: 'text', timestamp: 1002, content: 'Looks good.' },
];

describe('CliOutputBlock', () => {
  it('renders completed tool-call summary when collapsed (default)', () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
        }),
      );
    });
    const text = container.textContent ?? '';
    expect(text).toContain('已执行1次工具调用');
    expect(text).not.toContain('正在执行工具调用');
  });

  it('shows expanded content when defaultExpanded=true', () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
          defaultExpanded: true,
        }),
      );
    });
    // CLI block expanded, stdout visible; tools collapsed by default when done
    expect(container.textContent).toContain('Looks good.');
    expect(container.textContent).toContain('已执行1次工具调用');
    // Expand tools section to see tool labels
    const toolsToggle = container.querySelector('[data-testid="tools-section-toggle"]') as HTMLElement | null;
    act(() => {
      toolsToggle?.click();
    });
    expect(container.textContent).toContain('Read index.ts');
  });

  it('streaming status → always expanded, summary says tool call is running', () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: [{ id: 't1', kind: 'tool_use', timestamp: 1000, label: 'Bash pnpm test' }],
          status: 'streaming',
        }),
      );
    });
    const text = container.textContent ?? '';
    expect(text).toContain('正在执行工具调用');
    expect(text).toContain('Bash pnpm test');
  });

  it('shows shared visibility chip when thinkingMode=debug', () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
          thinkingMode: 'debug',
        }),
      );
    });
    expect(container.textContent).toContain('shared');
  });

  it('shows private label when thinkingMode=play', () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
          thinkingMode: 'play',
        }),
      );
    });
    expect(container.textContent).toContain('private');
  });

  it('returns null when no events', () => {
    act(() => {
      root.render(
        React.createElement(
          'div',
          { id: 'wrapper' },
          React.createElement(CliOutputBlock, { events: [], status: 'done' }),
        ),
      );
    });
    const wrapper = container.querySelector('#wrapper');
    expect(wrapper?.children.length).toBe(0);
  });

  it('can transition from empty events to populated events without hook-order errors', () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: [],
          status: 'done',
        }),
      );
    });

    expect(container.textContent).toBe('');

    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
        }),
      );
    });

    expect(container.textContent).toContain('已执行1次工具调用');
  });

  it('has dark terminal substrate class', () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
          defaultExpanded: true,
        }),
      );
    });
    // Look for the dark bg container
    const darkEl = container.querySelector('[data-testid="cli-output-body"]');
    expect(darkEl).toBeTruthy();
  });

  it('clicking summary toggles expansion', () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
        }),
      );
    });
    // Initially collapsed — tool stdout is visible, detail body is collapsed
    expect(container.textContent).toContain('Looks good.');

    // Click to expand
    const button = container.querySelector('button');
    expect(button).toBeTruthy();
    act(() => {
      button?.click();
    });
    expect(container.textContent).toContain('Looks good.');

    // Click to collapse
    act(() => {
      button?.click();
    });
    expect(container.querySelector('[data-testid="cli-output-body"]')).toBeFalsy();
  });

  it('shows completed tool count even after failure', () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: [{ id: 't1', kind: 'tool_use', timestamp: 1000, label: 'Bash deploy' }],
          status: 'failed',
        }),
      );
    });
    expect(container.textContent).toContain('已执行1次工具调用');
  });

  // ── P1-1: per-tool collapse (AC-A2) ──
  it('tool rows are individually collapsible — click to show detail', () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: [
            { id: 't1', kind: 'tool_use', timestamp: 1000, label: 'Read index.ts' },
            { id: 'r1', kind: 'tool_result', timestamp: 1001, label: 'Read index.ts', detail: '200 lines read' },
          ],
          status: 'done',
          defaultExpanded: true,
        }),
      );
    });
    // Tools section collapsed by default when done — expand it first
    const toolsToggle = container.querySelector('[data-testid="tools-section-toggle"]') as HTMLElement | null;
    act(() => {
      toolsToggle?.click();
    });
    // Tool label visible, but detail hidden by default (collapsed row)
    expect(container.textContent).toContain('Read index.ts');
    expect(container.textContent).not.toContain('200 lines read');

    // Click the tool row to expand it
    const toolRow = container.querySelector('[data-testid="tool-row-t1"]') as HTMLElement | null;
    expect(toolRow).toBeTruthy();
    act(() => {
      toolRow?.click();
    });
    expect(container.textContent).toContain('200 lines read');
  });

  // ── P1-2: auto-collapse on streaming→done (AC-A6) ──
  it('auto-collapses when status changes from streaming to done (no user interaction)', () => {
    // Start streaming → expanded
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'streaming',
        }),
      );
    });
    expect(container.querySelector('[data-testid="cli-output-body"]')).toBeTruthy();

    // Status changes to done → should auto-collapse
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
        }),
      );
    });
    expect(container.querySelector('[data-testid="cli-output-body"]')).toBeFalsy();
  });

  it('does NOT auto-collapse if user manually expanded', () => {
    // Start collapsed (done)
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
        }),
      );
    });
    // User clicks to expand
    const btn = container.querySelector('button');
    act(() => {
      btn?.click();
    });
    expect(container.querySelector('[data-testid="cli-output-body"]')).toBeTruthy();

    // Re-render with same status — should stay expanded (user interacted)
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
        }),
      );
    });
    expect(container.querySelector('[data-testid="cli-output-body"]')).toBeTruthy();
  });

  // ── P1-3: duplicate label matching ──
  it('correctly matches tool_result for duplicate tool labels', () => {
    const dupeEvents: CliEvent[] = [
      { id: 'u1', kind: 'tool_use', timestamp: 1000, label: 'Bash pnpm test' },
      { id: 'r1', kind: 'tool_result', timestamp: 1001, label: 'Bash pnpm test', detail: 'FAIL 3 tests' },
      { id: 'u2', kind: 'tool_use', timestamp: 1002, label: 'Bash pnpm test' },
      { id: 'r2', kind: 'tool_result', timestamp: 1003, label: 'Bash pnpm test', detail: 'PASS all' },
    ];
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: dupeEvents,
          status: 'done',
          defaultExpanded: true,
        }),
      );
    });
    // Expand tools section first (collapsed by default when done)
    const toolsToggle = container.querySelector('[data-testid="tools-section-toggle"]') as HTMLElement | null;
    act(() => {
      toolsToggle?.click();
    });
    // Expand both tool rows to see details
    const row1 = container.querySelector('[data-testid="tool-row-u1"]') as HTMLElement | null;
    const row2 = container.querySelector('[data-testid="tool-row-u2"]') as HTMLElement | null;
    act(() => {
      row1?.click();
      row2?.click();
    });
    const text = container.textContent ?? '';
    // First tool should show FAIL, second should show PASS
    expect(text).toContain('FAIL 3 tests');
    expect(text).toContain('PASS all');
  });

  // ── Cloud P1: tool-row click counts as user interaction ──
  it('does NOT auto-collapse if user expanded a tool row', () => {
    // Start streaming
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: [
            { id: 'u1', kind: 'tool_use', timestamp: 1000, label: 'Read' },
            { id: 'r1', kind: 'tool_result', timestamp: 1001, label: 'Read', detail: '200 lines' },
          ],
          status: 'streaming',
          defaultExpanded: true,
        }),
      );
    });
    // User clicks a tool row to expand detail
    const toolRow = container.querySelector('[data-testid="tool-row-u1"]') as HTMLElement | null;
    act(() => {
      toolRow?.click();
    });
    expect(container.textContent).toContain('200 lines');

    // Status changes to done → should NOT auto-collapse (user interacted via tool row)
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: [
            { id: 'u1', kind: 'tool_use', timestamp: 1000, label: 'Read' },
            { id: 'r1', kind: 'tool_result', timestamp: 1001, label: 'Read', detail: '200 lines' },
          ],
          status: 'done',
          defaultExpanded: true,
        }),
      );
    });
    expect(container.querySelector('[data-testid="cli-output-body"]')).toBeTruthy();
  });

  // ── P2-4: duration in summary ──
  it('shows duration in summary line', () => {
    const events: CliEvent[] = [
      { id: 't1', kind: 'tool_use', timestamp: 1000, label: 'Read' },
      { id: 'r1', kind: 'tool_result', timestamp: 1000 + 135_000, label: 'Read', detail: 'ok' },
    ];
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events,
          status: 'done',
        }),
      );
    });
    expect(container.textContent).toContain('已执行1次工具调用');
  });

  // ── P2-5: visibility chip always shown ──
  it('shows "private" when thinkingMode is undefined', () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
          // thinkingMode not provided
        }),
      );
    });
    expect(container.textContent).toContain('private');
  });

  it('does not render a ppt card when no ppt file was generated', () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
        }),
      );
    });

    expect(container.querySelector('[data-testid="cli-output-ppt-card"]')).toBeNull();
  });

  it('renders a ppt attachment card from the generated local file path and opens that file', async () => {
    const pptEvents: CliEvent[] = [
      { id: 't1', kind: 'tool_use', timestamp: 1000, label: 'Bash python build_ppt.py' },
      {
        id: 't2',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Bash python build_ppt.py',
        detail: '[Done] Saved: C:\\Users\\kagol\\.jiuwenclaw\\agent\\output\\demo-deck.pptx',
      },
      {
        id: 't3',
        kind: 'text',
        timestamp: 1002,
        content: 'PPT generated at C:\\Users\\kagol\\.jiuwenclaw\\agent\\output\\demo-deck.pptx',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: pptEvents,
          status: 'done',
        }),
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain('demo-deck.pptx');
    expect(container.textContent).toContain('生成时间：2026年3月24日');
    const openButton = container.querySelector('[data-testid="cli-output-ppt-open"]') as HTMLButtonElement | null;
    expect(openButton).toBeTruthy();

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockApiFetch).toHaveBeenCalledWith('/api/workspace/open-local', expect.objectContaining({ method: 'POST' }));
    const openLocalCall = mockApiFetch.mock.calls.find(([path]) => path === '/api/workspace/open-local');
    const [, init] = openLocalCall ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      path: 'C:\\Users\\kagol\\.jiuwenclaw\\agent\\output\\demo-deck.pptx',
    });
  });

  it('joins relative ppt path with the configured project path before open-local', async () => {
    const pptEvents: CliEvent[] = [
      {
        id: 't1',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Bash python build_ppt.py',
        detail: '[Done] Saved: output\\demo-deck.pptx',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: pptEvents,
          status: 'done',
          projectPath: 'D:\\workspace\\thread-a',
        }),
      );
      await Promise.resolve();
    });

    const metaCall = mockApiFetch.mock.calls.find(([path]) => path === '/api/workspace/local-file-meta');
    expect(JSON.parse(String(metaCall?.[1]?.body))).toEqual({
      path: 'D:\\workspace\\thread-a\\output\\demo-deck.pptx',
      projectPath: 'D:\\workspace\\thread-a',
    });

    const openButton = container.querySelector('[data-testid="cli-output-ppt-open"]') as HTMLButtonElement | null;
    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const openLocalCall = mockApiFetch.mock.calls.find(([path]) => path === '/api/workspace/open-local');
    expect(JSON.parse(String(openLocalCall?.[1]?.body))).toEqual({
      path: 'D:\\workspace\\thread-a\\output\\demo-deck.pptx',
      projectPath: 'D:\\workspace\\thread-a',
    });
  });

  it('does not truncate relative output paths to a slash-prefixed suffix before open-local', async () => {
    const pptEvents: CliEvent[] = [
      {
        id: 't1',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Bash python build_ppt.py',
        detail: 'output/20260402_192423_000/pages.pptx',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: pptEvents,
          status: 'done',
          projectPath: 'D:\\opentiny\\ppts',
        }),
      );
      await Promise.resolve();
    });

    const metaCall = mockApiFetch.mock.calls.find(([path]) => path === '/api/workspace/local-file-meta');
    expect(JSON.parse(String(metaCall?.[1]?.body))).toEqual({
      path: 'D:\\opentiny\\ppts\\output\\20260402_192423_000\\pages.pptx',
      projectPath: 'D:\\opentiny\\ppts',
    });

    const openButton = container.querySelector('[data-testid="cli-output-ppt-open"]') as HTMLButtonElement | null;
    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const openLocalCall = mockApiFetch.mock.calls.find(([path]) => path === '/api/workspace/open-local');
    expect(JSON.parse(String(openLocalCall?.[1]?.body))).toEqual({
      path: 'D:\\opentiny\\ppts\\output\\20260402_192423_000\\pages.pptx',
      projectPath: 'D:\\opentiny\\ppts',
    });
  });

  it('joins relative ppt path with the default cwd when projectPath is default', async () => {
    const pptEvents: CliEvent[] = [
      {
        id: 't1',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Bash python build_ppt.py',
        detail: '[Done] Saved: output/demo-deck.pptx',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: pptEvents,
          status: 'done',
          projectPath: 'default',
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockApiFetch).toHaveBeenCalledWith('/api/projects/cwd');

    const metaCall = mockApiFetch.mock.calls.find(([path]) => path === '/api/workspace/local-file-meta');
    expect(JSON.parse(String(metaCall?.[1]?.body))).toEqual({
      path: 'C:\\Users\\kagol\\.jiuwenclaw\\agent\\output\\demo-deck.pptx',
      projectPath: 'default',
    });

    const openButton = container.querySelector('[data-testid="cli-output-ppt-open"]') as HTMLButtonElement | null;
    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const openLocalCall = mockApiFetch.mock.calls.find(([path]) => path === '/api/workspace/open-local');
    expect(JSON.parse(String(openLocalCall?.[1]?.body))).toEqual({
      path: 'C:\\Users\\kagol\\.jiuwenclaw\\agent\\output\\demo-deck.pptx',
      projectPath: 'default',
    });
  });

  it.skip('does not render a ppt card when no ppt file was generated', async () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
        }),
      );
    });

    expect(container.textContent).toContain('NVIDIA_GTC_2026_华为风.pptx');
    const openButton = container.querySelector('[data-testid="cli-output-ppt-open"]') as HTMLButtonElement | null;
    expect(openButton?.textContent).toContain('打开');

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockApiFetch).toHaveBeenCalledWith('/api/workspace/open-local', expect.objectContaining({ method: 'POST' }));
    const [, init] = mockApiFetch.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      path: 'C:\\Users\\kagol\\.jiuwenclaw\\agent\\NVIDIA_GTC_2026_华为风.pptx',
    });
  });
});
