import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateAgentModal } from '@/components/CreateAgentModal';
import { useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(),
}));

const mockApiFetch = vi.mocked(apiFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('CreateAgentModal', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.clear();
    useChatStore.getState().setCurrentProject('/tmp/project');
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    mockApiFetch.mockReset();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('saves Huawei system models from /api/maas-models using accountRef + bare model name', async () => {
    const onSaved = vi.fn();
    mockApiFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/available-clients') {
        return Promise.resolve(
          jsonResponse({
            clients: [{ id: 'relayclaw', label: 'jiuwen', command: 'jiuwenclaw-app', available: true }],
          }),
        );
      }
      if (url === '/api/maas-models?projectPath=%2Ftmp%2Fproject') {
        return Promise.resolve(
          jsonResponse({
            list: [
              {
                id: 'model_config:huawei-maas:glm-5',
                name: 'GLM-5',
                provider: 'Huawei MaaS',
                accountRef: 'huawei-maas',
                protocol: 'huawei_maas',
                enabled: true,
              },
            ],
          }),
        );
      }
      if (url === '/api/cats' && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ cat: { id: 'huawei-bot' } }, 201));
      }
      throw new Error(`Unexpected apiFetch path: ${url}`);
    });

    await act(async () => {
      root.render(
        React.createElement(CreateAgentModal, {
          open: true,
          name: 'Huawei Bot',
          description: 'ACP header bridge',
          onClose: vi.fn(),
          onSaved,
        }),
      );
    });
    await flushEffects();
    await flushEffects();

    const createButton = container.querySelector('button[aria-label="Create"]') as HTMLButtonElement | null;
    expect(createButton).toBeTruthy();

    await act(async () => {
      createButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const postCall = mockApiFetch.mock.calls.find(([path, requestInit]) => path === '/api/cats' && requestInit?.method === 'POST');
    expect(postCall).toBeTruthy();
    const payload = JSON.parse(String(postCall?.[1]?.body));
    expect(payload.accountRef).toBe('huawei-maas');
    expect(payload.defaultModel).toBe('glm-5');
    expect(onSaved).toHaveBeenCalledWith('huawei-bot');
  });

  it('uses shared footer button classes', async () => {
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/available-clients') {
        return Promise.resolve(
          jsonResponse({
            clients: [{ id: 'relayclaw', label: 'jiuwen', command: 'jiuwenclaw-app', available: true }],
          }),
        );
      }
      if (url === '/api/maas-models?projectPath=%2Ftmp%2Fproject') {
        return Promise.resolve(jsonResponse({ list: [] }));
      }
      throw new Error(`Unexpected apiFetch path: ${url}`);
    });

    await act(async () => {
      root.render(
        React.createElement(CreateAgentModal, {
          open: true,
          name: 'Style Bot',
          description: '',
          onClose: vi.fn(),
          onSaved: vi.fn(),
        }),
      );
    });
    await flushEffects();
    await flushEffects();

    const cancelButton = container.querySelector('button[aria-label=\"Cancel\"]') as HTMLButtonElement | null;
    const confirmButton = container.querySelector('button[aria-label=\"Create\"]') as HTMLButtonElement | null;

    expect(cancelButton?.className).toContain('ui-button-default');
    expect(cancelButton?.className).not.toContain('ui-button-secondary');
    expect(cancelButton?.className).toContain('ui-modal-action-button');
    expect(confirmButton?.className).toContain('ui-button-primary');
    expect(confirmButton?.className).toContain('ui-modal-action-button');
  });
});
