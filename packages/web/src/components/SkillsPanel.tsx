'use client';

import { useState } from 'react';
import { HubCapabilityTab } from './HubCapabilityTab';
import { HubSkillsTab } from './HubSkillsTab';
import { UploadSkillModal } from './UploadSkillModal';

const INSTALLED = '我的技能';
const SKILL_PLAZA = '技能广场';
const UPLOAD_SUCCESS_LABEL = '技能上传成功';

export function SkillsPanel() {
  const [activeTab, setActiveTab] = useState<'installed' | 'plaza'>('installed');
  const [showUpload, setShowUpload] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [capabilityRefreshSignal, setCapabilityRefreshSignal] = useState(0);

  return (
    <div className="ui-page-shell gap-2">
      {toast && (
        <div
          aria-live="polite"
          className={`rounded-[var(--radius-md)] px-3 py-2 text-xs font-medium ${
            toast.type === 'success' ? 'ui-status-success' : 'ui-status-error'
          }`}
        >
          {toast.message}
        </div>
      )}

      <UploadSkillModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onSuccess={() => {
          setActiveTab('installed');
          setCapabilityRefreshSignal((value) => value + 1);
          setToast({ message: UPLOAD_SUCCESS_LABEL, type: 'success' });
          setTimeout(() => setToast(null), 4000);
        }}
      />

      <div className="ui-page-header-inline items-start border-b">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setActiveTab('installed')}
              className={`ui-tab-trigger ${activeTab === 'installed' ? 'ui-tab-trigger-active' : ''}`}
            >
              {INSTALLED}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('plaza')}
              className={`ui-tab-trigger ${activeTab === 'plaza' ? 'ui-tab-trigger-active' : ''}`}
            >
              {SKILL_PLAZA}
            </button>
          </div>
          <div
            className="ui-tab-indicator w-[56px]"
            style={{ transform: activeTab === 'plaza' ? 'translateX(78px)' : 'translateX(0)' }}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div>
          {activeTab === 'plaza' ? (
            <HubSkillsTab />
          ) : (
            <HubCapabilityTab onImport={() => setShowUpload(true)} refreshSignal={capabilityRefreshSignal} />
          )}
        </div>
      </div>
    </div>
  );
}
