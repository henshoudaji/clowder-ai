/**
 * F097: Integration — ChatMessage renders CliOutputBlock instead of ToolEventsPanel + 💭心里话
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chatStore';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/useTts', () => ({
  useTts: () => ({ state: 'idle', synthesize: vi.fn(), activeMessageId: null }),
}));
vi.mock('@/hooks/useCatData', () => ({
  useCatData: () => ({ cats: [], isLoading: false, getCatById: () => undefined, getCatsByBreed: () => new Map() }),
}));

const { ChatMessage } = await import('../ChatMessage');

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
  useChatStore.getState().setUiThinkingExpandedByDefault(false);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const getCatById = () => undefined;

describe('ChatMessage CLI Output integration', () => {
  it('renders "CLI Output" instead of "💭 心里话" for stream messages with tools', () => {
    const msg = {
      id: 'msg-1',
      type: 'assistant' as const,
      catId: 'opus',
      content: 'stream stdout',
      origin: 'stream' as const,
      toolEvents: [{ id: 't1', type: 'tool_use' as const, label: 'Read foo.ts', timestamp: 1000 }],
      timestamp: Date.now(),
      isStreaming: false,
    };
    act(() => {
      root.render(React.createElement(ChatMessage, { message: msg, getCatById }));
    });
    const text = container.textContent ?? '';
    expect(text).toContain('已执行1次工具调用');
    expect(text).not.toContain('💭 心里话');
  });

  it('keeps 🧠 Thinking independent from CLI block', () => {
    const msg = {
      id: 'msg-2',
      type: 'assistant' as const,
      catId: 'opus',
      content: 'final answer',
      thinking: 'reasoning here',
      origin: 'stream' as const,
      toolEvents: [{ id: 't1', type: 'tool_use' as const, label: 'Edit bar.ts', timestamp: 1000 }],
      timestamp: Date.now(),
      isStreaming: false,
    };
    act(() => {
      root.render(React.createElement(ChatMessage, { message: msg, getCatById }));
    });
    expect(container.querySelector('[data-testid="thinking-toggle"]')?.textContent).toContain('完成深度思考');
    // CLI block should also exist
    expect(container.textContent).toContain('已执行1次工具调用');
  });

  it('callback origin: content text shown ABOVE CLI block', () => {
    const msg = {
      id: 'msg-3',
      type: 'assistant' as const,
      catId: 'opus',
      content: 'Here is the answer',
      origin: 'callback' as const,
      toolEvents: [{ id: 't1', type: 'tool_use' as const, label: 'Read x.ts', timestamp: 1000 }],
      timestamp: Date.now(),
      isStreaming: false,
    };
    act(() => {
      root.render(React.createElement(ChatMessage, { message: msg, getCatById }));
    });
    const text = container.textContent ?? '';
    const answerIdx = text.indexOf('Here is the answer');
    const cliIdx = text.indexOf('已执行1次工具调用');
    expect(answerIdx).toBeGreaterThanOrEqual(0);
    expect(cliIdx).toBeGreaterThan(answerIdx);
  });

  it('stream origin with only content (no tools) keeps plain stream text without tool-call header', () => {
    const msg = {
      id: 'msg-4',
      type: 'assistant' as const,
      catId: 'opus',
      content: 'some CLI output',
      origin: 'stream' as const,
      timestamp: Date.now(),
      isStreaming: false,
    };
    act(() => {
      root.render(React.createElement(ChatMessage, { message: msg, getCatById }));
    });
    expect(container.textContent).toContain('some CLI output');
    expect(container.textContent).not.toContain('已执行0次工具调用');
  });
});
