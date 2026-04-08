'use client';

import { useEffect, useState } from 'react';
import { AgentManagementIcon } from './AgentManagementIcon';

interface ConnectThirdPartyAgentModalProps {
  open: boolean;
  onClose: () => void;
}

function CloseIcon() {
  return <AgentManagementIcon name="close" className="h-5 w-5" />;
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'password';
}) {
  return (
    <label className="block space-y-2.5">
      <span className="text-[14px] font-semibold text-[#2A303C]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="ui-input h-11 w-full rounded-[12px] px-4 text-[13px] transition"
      />
    </label>
  );
}

export function ConnectThirdPartyAgentModal({ open, onClose }: ConnectThirdPartyAgentModalProps) {
  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [objectModelName, setObjectModelName] = useState('');

  useEffect(() => {
    if (!open) return;

    setUrl('');
    setApiKey('');
    setObjectModelName('');

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.24)] px-6 py-8">
      <div
        className="flex h-[642px] w-[550px] flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
        data-testid="connect-third-party-agent-modal"
      >
        <div className="flex items-center justify-between border-b border-[#EEF2F6] px-6 py-5">
          <div>
            <h2 className="text-[24px] font-bold text-[#1F2329]">连接三方智能体</h2>
            <p className="mt-1 text-[12px] text-[#7A8495]">先完成界面接入，保存能力后续再接。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-[#F3F6FA]"
            aria-label="关闭连接三方智能体弹窗"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-6 py-6">
          <div className="space-y-5">
            <Field
              label="URL"
              placeholder="请输入服务地址，例如 https://example.com/v1"
              value={url}
              onChange={setUrl}
            />
            <Field
              label="API Key"
              placeholder="请输入 API Key"
              value={apiKey}
              onChange={setApiKey}
              type="password"
            />
            <Field
              label="对象模型名称"
              placeholder="请输入对象模型名称"
              value={objectModelName}
              onChange={setObjectModelName}
            />

            <div className="rounded-[16px] border border-[#E8EDF3] bg-[#F7F9FC] px-4 py-3 text-[12px] leading-6 text-[#667085]">
              当前只接入弹窗和表单展示，不会提交也不会保存配置。
            </div>
          </div>

          <div className="mt-auto flex justify-end gap-3 pt-6">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 min-w-[96px] items-center justify-center rounded-[10px] bg-[#F5F7FA] px-4 text-[13px] font-semibold text-[#445066] transition hover:bg-[#ECEFF4]"
            >
              取消
            </button>
            <button
              type="button"
              disabled
              className="inline-flex h-10 min-w-[96px] cursor-not-allowed items-center justify-center rounded-[10px] bg-[#D7DDE7] px-4 text-[13px] font-semibold text-white"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
