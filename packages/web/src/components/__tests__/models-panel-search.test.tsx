import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelsPanel } from '@/components/ModelsPanel';
import { apiFetch } from '@/utils/api-client';

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(),
}));

const mockApiFetch = vi.mocked(apiFetch);
const SEARCH_INPUT_SELECTOR = 'input[type="search"]';

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

async function changeInputValue(input: HTMLInputElement, value: string) {
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
}

async function changeTextareaValue(input: HTMLTextAreaElement, value: string) {
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
}

async function clickButton(button: HTMLElement) {
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
}

describe('ModelsPanel search', () => {
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
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/maas-models') {
        return Promise.resolve(
          jsonResponse({
            list: [
              {
                id: 'gpt-5',
                object: 'model',
                name: 'gpt-5',
                description: 'flagship model',
                protocol: 'openai',
                labels: ['text-gen', 'Function Call'],
                developer: 'OpenAI',
                icon: '/avatars/assistant.svg',
              },
              {
                id: 'deepseek-r1',
                object: 'model',
                name: 'deepseek-r1',
                description: 'reasoning model',
                protocol: 'huawei_maas',
                labels: ['reasoning'],
                developer: 'DeepSeek',
                icon: '/images/deepseek.svg',
              },
              {
                id: 'alpha-custom',
                object: 'model',
                name: 'alpha-custom',
                description: 'custom model without icon',
                protocol: 'openai',
                labels: ['proxy'],
                developer: 'OpenAI',
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
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

  it('renders a search input below the page title', async () => {
    await act(async () => {
      root.render(React.createElement(ModelsPanel));
    });
    await flushEffects();

    expect(container.querySelector(SEARCH_INPUT_SELECTOR)).not.toBeNull();
  });

  it('renders grouped cards and model labels/developer', async () => {
    await act(async () => {
      root.render(React.createElement(ModelsPanel));
    });
    await flushEffects();

    expect(container.textContent).toContain('MaaS (1)');
    expect(container.textContent).not.toContain('MaaS (2)');
    expect(container.textContent).toContain('text-gen');
    expect(container.textContent).toContain('DeepSeek');
  });

  it('filters cards by model name', async () => {
    await act(async () => {
      root.render(React.createElement(ModelsPanel));
    });
    await flushEffects();

    const input = container.querySelector(SEARCH_INPUT_SELECTOR) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    await changeInputValue(input!, 'gpt');

    expect(container.textContent).toContain('gpt-5');
    expect(container.textContent).not.toContain('deepseek-r1');
  });

  it('filters cards by labels and developer field', async () => {
    await act(async () => {
      root.render(React.createElement(ModelsPanel));
    });
    await flushEffects();

    const input = container.querySelector(SEARCH_INPUT_SELECTOR) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    await changeInputValue(input!, 'reasoning');

    expect(container.textContent).toContain('deepseek-r1');
    expect(container.textContent).not.toContain('gpt-5');

    await changeInputValue(input!, 'openai');
    expect(container.textContent).toContain('gpt-5');
    expect(container.textContent).not.toContain('deepseek-r1');
  });

  it('shows a no-results state and restores the full list when cleared', async () => {
    await act(async () => {
      root.render(React.createElement(ModelsPanel));
    });
    await flushEffects();

    const input = container.querySelector(SEARCH_INPUT_SELECTOR) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    await changeInputValue(input!, 'no-match');

    expect(container.textContent).toContain('未找到匹配模型');
    expect(container.textContent).not.toContain('gpt-5');
    expect(container.textContent).not.toContain('deepseek-r1');

    await changeInputValue(input!, '');

    expect(container.textContent).toContain('gpt-5');
    expect(container.textContent).toContain('deepseek-r1');
  });

  it('filters locally without issuing a second request', async () => {
    await act(async () => {
      root.render(React.createElement(ModelsPanel));
    });
    await flushEffects();

    const input = container.querySelector(SEARCH_INPUT_SELECTOR) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/maas-models');

    await changeInputValue(input!, 'deepseek');

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('deepseek-r1');
    expect(container.textContent).not.toContain('gpt-5');
  });

  it('falls back to unified initial icon when model icon is missing', async () => {
    await act(async () => {
      root.render(React.createElement(ModelsPanel));
    });
    await flushEffects();

    const fallbackIcon = container.querySelector('[data-testid="model-card-icon-alpha-custom"]');
    expect(fallbackIcon).not.toBeNull();
    expect(fallbackIcon?.textContent).toContain('A');
  });

  it('shows a custom tooltip for model descriptions instead of the native title attribute', async () => {
    await act(async () => {
      root.render(React.createElement(ModelsPanel));
    });
    await flushEffects();

    const descriptionNode = Array.from(container.querySelectorAll('p')).find((node) =>
      node.textContent?.includes('flagship model'),
    );
    expect(descriptionNode).not.toBeNull();
    expect(descriptionNode?.getAttribute('title')).toBeNull();

    await act(async () => {
      descriptionNode?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toContain('flagship model');
  });

  it('submits create-model description without icon when icon is not provided', async () => {
    await act(async () => {
      root.render(React.createElement(ModelsPanel));
    });
    await flushEffects();

    const openModal = container.querySelector('[data-testid="models-open-create-model-modal"]') as HTMLButtonElement | null;
    expect(openModal).not.toBeNull();
    await clickButton(openModal!);

    const nameInput = container.querySelector('[data-testid="models-create-model-name-input"]') as HTMLInputElement | null;
    const descriptionInput = container.querySelector(
      '[data-testid="models-create-model-description-textarea"]',
    ) as HTMLTextAreaElement | null;
    const displayNameInput = container.querySelector(
      '[data-testid="models-create-model-display-name-input"]',
    ) as HTMLInputElement | null;
    const urlInput = container.querySelector('[data-testid="models-create-model-url-input"]') as HTMLInputElement | null;
    const apiKeyInput = container.querySelector('[data-testid="models-create-model-api-key-input"]') as HTMLInputElement | null;
    const submitButton = container.querySelector('[data-testid="models-create-model-confirm"]') as HTMLButtonElement | null;

    expect(nameInput).not.toBeNull();
    expect(descriptionInput).not.toBeNull();
    expect(displayNameInput).not.toBeNull();
    expect(urlInput).not.toBeNull();
    expect(apiKeyInput).not.toBeNull();
    expect(submitButton).not.toBeNull();
    expect(nameInput?.className).toContain('ui-input');
    expect(descriptionInput?.className).toContain('ui-textarea');

    await changeInputValue(nameInput!, 'gpt-custom');
    await changeTextareaValue(descriptionInput!, '  custom description for test  ');
    await changeInputValue(displayNameInput!, 'My Custom Proxy');
    await changeInputValue(urlInput!, 'https://proxy.example.com/v1');
    await changeInputValue(apiKeyInput!, 'sk-test');
    await clickButton(submitButton!);
    await flushEffects();

    const postCall = mockApiFetch.mock.calls.find(
      ([input, init]) =>
        String(input) === '/api/model-config-profiles' &&
        typeof init === 'object' &&
        init !== null &&
        (init as RequestInit).method === 'POST',
    );
    expect(postCall).toBeTruthy();
    const payload = JSON.parse(String(((postCall?.[1] as RequestInit).body ?? '')));
    expect(payload.description).toBe('custom description for test');
    expect(Object.prototype.hasOwnProperty.call(payload, 'icon')).toBe(false);
  });

  it('submits create-model icon when random icon is generated', async () => {
    await act(async () => {
      root.render(React.createElement(ModelsPanel));
    });
    await flushEffects();

    const openModal = container.querySelector('[data-testid="models-open-create-model-modal"]') as HTMLButtonElement | null;
    expect(openModal).not.toBeNull();
    await clickButton(openModal!);

    const nameInput = container.querySelector('[data-testid="models-create-model-name-input"]') as HTMLInputElement | null;
    const urlInput = container.querySelector('[data-testid="models-create-model-url-input"]') as HTMLInputElement | null;
    const apiKeyInput = container.querySelector('[data-testid="models-create-model-api-key-input"]') as HTMLInputElement | null;
    const randomIconButton = container.querySelector('[aria-label="Random model icon"]') as HTMLButtonElement | null;
    const submitButton = container.querySelector('[data-testid="models-create-model-confirm"]') as HTMLButtonElement | null;

    expect(nameInput).not.toBeNull();
    expect(urlInput).not.toBeNull();
    expect(apiKeyInput).not.toBeNull();
    expect(randomIconButton).not.toBeNull();
    expect(submitButton).not.toBeNull();

    await changeInputValue(nameInput!, 'gpt-custom-with-icon');
    await changeInputValue(urlInput!, 'https://proxy.example.com/v1');
    await changeInputValue(apiKeyInput!, 'sk-test');
    await clickButton(randomIconButton!);
    await clickButton(submitButton!);
    await flushEffects();

    const postCall = mockApiFetch.mock.calls.find(
      ([input, init]) =>
        String(input) === '/api/model-config-profiles' &&
        typeof init === 'object' &&
        init !== null &&
        (init as RequestInit).method === 'POST',
    );
    expect(postCall).toBeTruthy();
    const payload = JSON.parse(String(((postCall?.[1] as RequestInit).body ?? '')));
    expect(typeof payload.icon).toBe('string');
    expect(payload.icon.startsWith('data:image/svg+xml')).toBe(true);
  });
});
