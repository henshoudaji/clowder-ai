import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/utils/api-client';
import { FileBlock } from '../rich/FileBlock';

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(async () => ({ ok: true })),
}));

describe('FileBlock PPT open action', () => {
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
    vi.mocked(apiFetch).mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders 打开 for workspace pptx and calls workspace open API', async () => {
    act(() => {
      root.render(
        <FileBlock
          block={{
            id: 'file-1',
            kind: 'file',
            v: 1,
            url: '/api/workspace/download?worktreeId=wt-1&path=output%2Fdemo.pptx',
            fileName: 'demo.pptx',
            worktreeId: 'wt-1',
            workspacePath: 'output/demo.pptx',
          }}
        />,
      );
    });

    const button = container.querySelector('button');
    expect(button?.textContent).toContain('打开');

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(apiFetch).toHaveBeenCalledWith('/api/workspace/open', expect.objectContaining({ method: 'POST' }));
    const [, init] = vi.mocked(apiFetch).mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      worktreeId: 'wt-1',
      path: 'output/demo.pptx',
    });
  });
});
