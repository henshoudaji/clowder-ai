'use client';

import { useState } from 'react';
import { AgentsPanel } from './AgentsPanelCopy';

type RootTabKey = 'agents' | 'experts';

const ROOT_TABS: Array<{ id: RootTabKey; label: string }> = [{ id: 'agents', label: '我的智能体' }];

export function AgentsRootPanel() {
  const [activeTab, setActiveTab] = useState<RootTabKey>('agents');

  return (
    <div className="ui-page-shell">
      <div className="flex shrink-0 items-center gap-6 px-1">
        {ROOT_TABS.map((tab) => {
          const isActive = tab.id === activeTab;

          return (
            <button
              key={tab.id}
              type="button"
              data-testid={`agents-root-tab-${tab.id}`}
              aria-pressed={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`relative pb-2 text-[14px] transition ${
                isActive ? 'font-semibold text-[#1F2329]' : 'font-medium text-[#8A94A6] hover:text-[#445066]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div data-testid="agents-root-divider" className="mb-6 h-px w-full shrink-0 bg-[#E6EAF0]" />

      <div className="min-h-0 flex-1">
        {activeTab === 'agents' ? (
          <AgentsPanel />
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-4">
            <div className="flex items-center justify-between">
              <h1 className="text-[16px] font-semibold text-[#1F2329]">专家中心</h1>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-[18px] border border-[#E6EAF0] bg-white px-6 py-10">
              <div className="max-w-[420px] text-center">
                <div className="text-[16px] font-semibold text-[#1F2329]">页面占位中</div>
                <p className="mt-2 text-[13px] leading-6 text-[#6F7785]">
                  本轮先接入一级页签结构，专家中心后续再补实际内容和交互。
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
