import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentsPanelCopy as AgentsPanel } from '@/components/AgentsPanelCopy';
import { ChannelsPanel } from '@/components/ChannelsPanel';
import { ModelsPanel } from '@/components/ModelsPanel';
import { SkillsPanel } from '@/components/SkillsPanel';
import { apiFetch } from '@/utils/api-client';

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => React.createElement('img', props),
}));

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/hooks/useCatData', () => ({
  useCatData: () => ({
    cats: [
      {
        id: 'office',
        displayName: 'Office',
        breedDisplayName: 'Office',
        nickname: 'Ops',
        provider: 'openai',
        defaultModel: 'gpt-5',
        mentionPatterns: ['@office'],
        source: 'config',
        roster: { available: true },
      },
    ],
    refresh: vi.fn(),
  }),
}));

vi.mock('@/components/HubCatEditor', () => ({ HubCatEditor: () => null }));
vi.mock('@/components/HubConnectorConfigTab', () => ({
  HubConnectorConfigTab: () => React.createElement('div', { 'data-testid': 'connector-panel', className: 'ui-panel' }),
}));
vi.mock('@/components/HubCapabilityTab', () => ({
  HubCapabilityTab: (props: { onImport?: () => void }) =>
    React.createElement(
      'div',
      { 'data-testid': 'capability-panel', className: 'ui-panel' },
      props.onImport
        ? React.createElement(
            'button',
            { type: 'button', className: 'ui-button-default', onClick: props.onImport },
            '导入',
          )
        : null,
    ),
}));
vi.mock('@/components/HubSkillsTab', () => ({
  HubSkillsTab: () => React.createElement('div', { 'data-testid': 'skills-market-panel', className: 'ui-panel' }),
}));
vi.mock('@/components/HubMemberOverviewCard', () => ({
  HubCoCreatorOverviewCard: () => React.createElement('div', { 'data-testid': 'co-creator-card', className: 'ui-card' }),
  HubMemberOverviewCard: () => React.createElement('div', { 'data-testid': 'member-card', className: 'ui-card' }),
  HubOverviewToolbar: () => React.createElement('button', { 'data-testid': 'add-member-button', className: 'ui-button-primary' }),
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

describe('business theme panels', () => {
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
                labels: ['文本生成'],
                developer: 'OpenAI',
                icon: '/avatars/assistant.svg',
              },
            ],
          }),
        );
      }
      if (url === '/api/config') {
        return Promise.resolve(
          jsonResponse({
            config: {
              cats: {
                office: {
                  model: 'gpt-5',
                },
              },
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

  it('renders ModelsPanel with shared page and card tokens', async () => {
    await act(async () => {
      root.render(React.createElement(ModelsPanel));
    });
    await flushEffects();

    const shell = container.firstElementChild as HTMLElement | null;
    expect(shell?.className).toContain('ui-page-shell');
    expect(container.querySelector('h1')?.className).toContain('ui-page-title');
    expect(container.querySelector('article')?.className).toContain('ui-card');
    expect(container.querySelector('article')?.className).toContain('ui-card-hover');
  });

  it('renders AgentsPanel with shared page shell and tokenized member surfaces', async () => {
    await act(async () => {
      root.render(React.createElement(AgentsPanel));
    });
    await flushEffects();

    const shell = container.firstElementChild as HTMLElement | null;
    expect(shell?.className).toContain('ui-page-shell');
    expect(container.querySelector('h1')?.className).toContain('ui-page-title');
  });

  it('renders ChannelsPanel with shared page shell and tokenized content surface', async () => {
    await act(async () => {
      root.render(React.createElement(ChannelsPanel));
    });

    const shell = container.firstElementChild as HTMLElement | null;
    expect(shell?.className).toContain('ui-page-shell');
    expect(container.querySelector('h1')?.className).toContain('ui-page-title');
    expect(container.querySelector('[data-testid="connector-panel"]')?.className).toContain('ui-panel');
  });

  it('renders SkillsPanel with shared page shell and tokenized action surfaces', async () => {
    await act(async () => {
      root.render(React.createElement(SkillsPanel));
    });

    const shell = container.firstElementChild as HTMLElement | null;
    expect(shell?.className).toContain('ui-page-shell');
    const contentRegion = shell?.querySelector('.min-h-0.flex-1') as HTMLElement | null;
    expect(contentRegion?.className).toContain('overflow-hidden');
    expect(contentRegion?.className).not.toContain('overflow-y-auto');
    const importButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('导入'));
    expect(importButton?.className).toContain('ui-button-default');
    expect(container.querySelector('[data-testid="capability-panel"]')?.className).toContain('ui-panel');
  });
});
