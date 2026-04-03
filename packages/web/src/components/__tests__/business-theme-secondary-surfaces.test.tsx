import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatData } from '@/hooks/useCatData';
import { HubConnectorConfigTab } from '@/components/HubConnectorConfigTab';
import { HubCoCreatorOverviewCard, HubMemberOverviewCard, HubOverviewToolbar } from '@/components/HubMemberOverviewCard';
import { HubSkillsTab } from '@/components/HubSkillsTab';
import { apiFetch } from '@/utils/api-client';

vi.mock('@/utils/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/components/UploadSkillModal', () => ({ UploadSkillModal: () => null }));
vi.mock('@/components/WeixinQrPanel', () => ({ WeixinQrPanel: () => React.createElement('div', { 'data-testid': 'weixin-qr' }) }));

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

const sampleCat = {
  id: 'office',
  displayName: 'Office',
  breedDisplayName: 'Office',
  nickname: 'Ops',
  provider: 'openai',
  defaultModel: 'gpt-5',
  mentionPatterns: ['@office', '@ops'],
  source: 'config',
  roster: { available: true },
} as unknown as CatData;

describe('business theme secondary surfaces', () => {
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
      if (url === '/api/skills/trending') {
        return Promise.resolve(
          jsonResponse({
            skills: [
              {
                id: 'skill-1',
                slug: 'skill-1',
                name: 'skill-1',
                description: 'search helper',
                tags: [],
                repo: { githubOwner: 'openai', githubRepoName: 'skills' },
                isInstalled: false,
              },
              {
                id: 'alpha-helper',
                slug: 'alpha-helper',
                name: 'alpha-helper',
                description: 'alpha helper',
                tags: ['alpha'],
                repo: { githubOwner: 'openai', githubRepoName: 'skills' },
                isInstalled: false,
              },
            ],
            total: 2,
            page: 1,
            hasMore: false,
          }),
        );
      }
      if (url === '/api/connector/status') {
        return Promise.resolve(
          jsonResponse({
            platforms: [
              {
                id: 'slack',
                name: 'Slack',
                nameEn: 'Slack',
                configured: false,
                docsUrl: 'https://example.com/docs',
                steps: ['Open app settings', 'Save credentials'],
                fields: [{ envName: 'SLACK_TOKEN', label: 'Token', sensitive: false, currentValue: null }],
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

  it('renders member surfaces with shared card and button tokens', async () => {
    await act(async () => {
      root.render(
        React.createElement('div', null,
          React.createElement(HubOverviewToolbar, { onAddMember: vi.fn() }),
          React.createElement(HubCoCreatorOverviewCard, {
            coCreator: {
              name: 'ME',
              aliases: ['me'],
              mentionPatterns: ['@me'],
              color: { primary: '#D4A76A', secondary: '#FFF8F0' },
              avatar: undefined,
            },
            onEdit: vi.fn(),
          }),
          React.createElement(HubMemberOverviewCard, {
            cat: sampleCat,
            onEdit: vi.fn(),
            onToggleAvailability: vi.fn(),
          }),
        ),
      );
    });

    const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes('添加成员'));
    expect(button?.className).toContain('ui-button-primary');
    const sections = Array.from(container.querySelectorAll('section'));
    expect(sections.some((section) => section.className.includes('ui-card-muted'))).toBe(true);
    expect(sections.some((section) => section.className.includes('ui-card'))).toBe(true);
  });

  it('renders HubSkillsTab with tokenized cards, fields, and actions', async () => {
    await act(async () => {
      root.render(React.createElement(HubSkillsTab));
    });
    await flushEffects();

    expect(container.querySelector('input')?.className).toContain('ui-field');
    const plazaHeading = Array.from(container.querySelectorAll('p')).find((candidate) =>
      candidate.textContent?.includes('技能广场'),
    );
    const searchInput = container.querySelector('input[aria-label="搜索 SkillHub 技能"]');
    const firstSkillCard = container.querySelector('article');
    expect(
      Boolean(
        plazaHeading &&
          searchInput &&
          firstSkillCard &&
          (plazaHeading.compareDocumentPosition(searchInput) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
          (searchInput.compareDocumentPosition(firstSkillCard) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      ),
    ).toBe(true);
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.some((button) => button.textContent?.includes('安装'))).toBe(true);
    expect(buttons.some((button) => button.textContent?.includes('导入'))).toBe(false);
  });

  it('filters in-memory skill list and does not call search endpoint', async () => {
    await act(async () => {
      root.render(React.createElement(HubSkillsTab));
    });
    await flushEffects();

    const searchInput = container.querySelector('input[aria-label="搜索 SkillHub 技能"]') as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();

    await changeInputValue(searchInput!, 'alpha');
    await flushEffects();

    expect(container.textContent).toContain('alpha-helper');
    expect(container.textContent).not.toContain('skill-1');

    const calledSearchEndpoint = mockApiFetch.mock.calls.some(([input]) => String(input).startsWith('/api/skills/search'));
    expect(calledSearchEndpoint).toBe(false);
  });

  it('renders HubConnectorConfigTab with tokenized cards and form controls', async () => {
    await act(async () => {
      root.render(React.createElement(HubConnectorConfigTab));
    });
    await flushEffects();

    const leftPane = container.querySelector('[data-testid="connector-left-pane"]');
    const rightPane = container.querySelector('[data-testid="connector-right-pane"]');
    expect(leftPane).not.toBeNull();
    expect(rightPane).not.toBeNull();

    const slackItem = container.querySelector('[data-testid="platform-item-slack"]');
    expect(slackItem?.className).toContain('[border-radius:var(--connector-tab-radius)]');
    await act(async () => {
      slackItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('input')?.className).toContain('ui-field');
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.some((button) => button.className.includes('ui-button-primary'))).toBe(true);
    expect(buttons.some((button) => button.className.includes('ui-button-secondary'))).toBe(true);
  });
});
