import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type CapabilityBoardItem, CapabilitySection } from '@/components/capability-board-ui';

describe('CapabilitySection skill card layout', () => {
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
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('renders source and enable switch without expanded detail sections', () => {
    const description = '这是一个用于验证卡片布局的技能描述。';
    const item: CapabilityBoardItem = {
      id: 'cross-cat-handoff',
      type: 'skill',
      source: 'external',
      enabled: true,
      cats: { codex: true },
      description,
      triggers: ['交接'],
    };

    act(() => {
      root.render(
        React.createElement(CapabilitySection, {
          icon: null,
          title: '协作',
          subtitle: 'OfficeClaw Skills',
          items: [item],
          catFamilies: [],
          toggling: null,
          onToggle: () => {},
          onUninstall: () => {},
        }),
      );
    });

    expect(container.textContent).toContain('来源：三方');
    expect(container.textContent).toContain(description);
    expect(container.textContent).toContain('删除');
    expect(container.textContent).not.toContain('触发词');
    expect(container.textContent).not.toContain('挂载状态');
    expect(container.textContent).not.toContain('启用状态（按猫）');
  });
});
