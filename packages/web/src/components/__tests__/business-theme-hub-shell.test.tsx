import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HubCapabilityTab } from '@/components/HubCapabilityTab';
import { apiFetch } from '@/utils/api-client';

vi.mock('@/utils/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/components/useConfirm', () => ({
  useConfirm: () => vi.fn(() => Promise.resolve(true)),
}));
vi.mock('@/components/useProviderProfilesState', () => ({
  useProviderProfilesState: () => ({ providerCreateSectionProps: {} }),
}));
vi.mock('@/components/hub-provider-profiles.sections', () => ({
  CreateApiKeyProfileSection: () => React.createElement('div', { 'data-testid': 'provider-create-section' }),
}));
vi.mock('@/stores/chatStore', () => ({
  useChatStore: (selector?: (state: { threads: Array<{ projectPath?: string }> }) => unknown) => {
    const state = { threads: [{ projectPath: 'project-a' }, { projectPath: 'project-b' }] };
    return selector ? selector(state) : state;
  },
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

async function changeInputValue(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
}

describe('business theme hub shell', () => {
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
      if (url.startsWith('/api/capabilities?')) {
        return Promise.resolve(
          jsonResponse({
            projectPath: 'project-a',
            catFamilies: [{ id: 'ops', name: 'Ops', catIds: ['office'] }],
            items: [
              {
                id: 'ops-skill',
                type: 'skill',
                source: 'cat-cafe',
                enabled: true,
                cats: { office: true },
                description: 'automation helper',
                triggers: ['ops'],
                category: 'Automation',
                mounts: { codex: true },
                connectionStatus: 'connected',
              },
              {
                id: 'doc-skill',
                type: 'skill',
                source: 'external',
                enabled: true,
                cats: { office: true },
                description: 'document helper',
                triggers: ['doc'],
                category: 'Knowledge',
                mounts: { codex: true },
                connectionStatus: 'connected',
              },
            ],
            skillHealth: {
              allMounted: true,
              registrationConsistent: true,
              unregistered: [],
              phantom: [],
            },
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

  it('renders HubCapabilityTab capability cards without project selector', async () => {
    await act(async () => {
      root.render(React.createElement(HubCapabilityTab));
    });
    await flushEffects();

    expect(container.querySelector('select[aria-label="项目"]')).toBeNull();
    expect(container.querySelector('select[aria-label="筛选来源"]')).not.toBeNull();
    expect(container.textContent).not.toContain('项目:');
    expect(container.querySelector('[data-testid="capability-card-skill-ops-skill"]')?.className).toContain('ui-card');
    expect(container.querySelector('[data-testid="capability-card-skill-ops-skill"]')?.className).toContain('ui-card-hover');
    expect(container.textContent).toContain('来源：官方');
  });

  it('renders search input under title and filters installed skills', async () => {
    await act(async () => {
      root.render(React.createElement(HubCapabilityTab));
    });
    await flushEffects();

    const searchInput = container.querySelector('input[aria-label="搜索我的技能"]') as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();
    expect(container.textContent).toContain('ops-skill');
    expect(container.textContent).toContain('doc-skill');

    await changeInputValue(searchInput!, 'doc');

    expect(container.textContent).toContain('doc-skill');
    expect(container.textContent).not.toContain('ops-skill');
  });

  it('updates installed skills title count to match visible search results', async () => {
    await act(async () => {
      root.render(React.createElement(HubCapabilityTab));
    });
    await flushEffects();

    const searchInput = container.querySelector('input[aria-label="搜索我的技能"]') as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();
    expect(container.textContent).toContain('全部 (2)');

    await changeInputValue(searchInput!, 'doc');

    expect(container.textContent).toContain('全部 (1)');
    expect(container.textContent).not.toContain('全部 (2)');
  });

  it('renders optional import action beside installed skills search', async () => {
    const onImport = vi.fn();
    await act(async () => {
      root.render(React.createElement(HubCapabilityTab, { onImport }));
    });
    await flushEffects();

    const searchInput = container.querySelector('input[aria-label="搜索我的技能"]');
    const importButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('导入'));
    expect(searchInput).not.toBeNull();
    expect(importButton?.className).toContain('ui-button-default');
    await act(async () => {
      importButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it('keeps filter controls visible and shows empty state when search has no matches', async () => {
    await act(async () => {
      root.render(React.createElement(HubCapabilityTab));
    });
    await flushEffects();

    const searchInput = container.querySelector('input[aria-label="搜索我的技能"]') as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();

    await changeInputValue(searchInput!, 'no-such-skill');

    expect(container.querySelector('select[aria-label="筛选来源"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label="搜索我的技能"]')).not.toBeNull();
    expect(container.textContent).toContain('未找到匹配技能');
    expect(container.textContent).not.toContain('ops-skill');
    expect(container.textContent).not.toContain('doc-skill');
  });

  it('keeps search controls outside the scrolling card region', async () => {
    await act(async () => {
      root.render(React.createElement(HubCapabilityTab));
    });
    await flushEffects();

    const fixedHeader = container.querySelector('[data-testid="hub-capability-fixed-header"]') as HTMLDivElement | null;
    const scrollRegion = container.querySelector('[data-testid="hub-capability-scroll-region"]') as HTMLDivElement | null;
    const searchInput = container.querySelector('input[aria-label="搜索我的技能"]') as HTMLInputElement | null;

    expect(fixedHeader).not.toBeNull();
    expect(scrollRegion).not.toBeNull();
    expect(scrollRegion?.className).toContain('overflow-y-auto');
    expect(scrollRegion?.contains(searchInput)).toBe(false);
    expect(scrollRegion?.querySelector('[data-testid="capability-card-skill-ops-skill"]')).not.toBeNull();
  });
});
