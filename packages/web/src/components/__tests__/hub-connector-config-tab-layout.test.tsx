import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HubConnectorConfigTab } from '@/components/HubConnectorConfigTab';
import { apiFetch } from '@/utils/api-client';

vi.mock('@/utils/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/components/WeixinQrPanel', () => ({
  WeixinQrPanel: ({
    configured,
    onConfigured,
  }: {
    configured: boolean;
    onConfigured?: () => void | Promise<void>;
  }) => React.createElement(
    'button',
    {
      'data-testid': 'weixin-qr',
      'data-configured': configured ? 'true' : 'false',
      onClick: () => void onConfigured?.(),
    },
    configured ? 'connected' : 'idle',
  ),
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

describe('HubConnectorConfigTab layout', () => {
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
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
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
              {
                id: 'weixin',
                name: '微信',
                nameEn: 'WeChat',
                configured: false,
                docsUrl: '',
                steps: ['扫码绑定', '完成确认'],
                fields: [],
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
    vi.clearAllMocks();
  });

  it('renders platform list in left pane and selected details in right pane', async () => {
    await act(async () => {
      root.render(React.createElement(HubConnectorConfigTab));
    });
    await flushEffects();

    const leftPane = container.querySelector('[data-testid="connector-left-pane"]');
    const rightPane = container.querySelector('[data-testid="connector-right-pane"]');
    expect(leftPane).not.toBeNull();
    expect(rightPane).not.toBeNull();

    const slackItem = container.querySelector('[data-testid="platform-item-slack"]');
    const weixinItem = container.querySelector('[data-testid="platform-item-weixin"]');
    expect(slackItem).not.toBeNull();
    expect(weixinItem).not.toBeNull();

    // default selected should render non-weixin form details
    expect(container.querySelector('input[data-testid="field-SLACK_TOKEN"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="weixin-qr"]')).toBeNull();

    await act(async () => {
      weixinItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(container.querySelector('[data-testid="weixin-qr"]')).not.toBeNull();
    expect(container.querySelector('input[data-testid="field-SLACK_TOKEN"]')).toBeNull();
  });

  it('refreshes platform status after Weixin QR panel reports configuration success', async () => {
    let statusCallCount = 0;
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/connector/status') {
        statusCallCount += 1;
        return Promise.resolve(
          jsonResponse({
            platforms: [
              {
                id: 'weixin',
                name: '微信',
                nameEn: 'WeChat',
                configured: statusCallCount > 1,
                docsUrl: '',
                steps: ['扫码绑定', '完成确认'],
                fields: [],
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    await act(async () => {
      root.render(React.createElement(HubConnectorConfigTab));
    });
    await flushEffects();

    const weixinItem = container.querySelector('[data-testid="platform-item-weixin"]');
    expect(weixinItem?.textContent).toContain('未配置');

    await act(async () => {
      (container.querySelector('[data-testid="weixin-qr"]') as HTMLButtonElement | null)?.click();
    });
    await flushEffects();

    expect(statusCallCount).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('[data-testid="platform-item-weixin"]')?.textContent).toContain('已配置');
  });
});
