'use client';

import { useEffect, useRef, useState } from 'react';
import { AgentManagementIcon } from './AgentManagementIcon';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** If set, shows a text input that must match this value to confirm */
  requireInput?: string;
  inputPlaceholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

function CloseIcon() {
  return <AgentManagementIcon name="close" className="h-4 w-4" />;
}

export function ConfirmDialog({
  open,
  title,
  message,
  requireInput,
  inputPlaceholder,
  confirmLabel = '确认',
  cancelLabel = '取消',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setInputValue('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  const canConfirm = requireInput ? inputValue === requireInput : true;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-[8px] shadow-xl p-6 max-w-sm w-full mx-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-base font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label="close"
            className="flex h-6 w-6 items-center justify-center rounded text-[#5F6775] transition-colors hover:bg-[#F7F8FA]"
          >
            <CloseIcon />
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-4 whitespace-pre-wrap">{message}</p>
        {requireInput && (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={inputPlaceholder}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="ui-button-secondary"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className="ui-button-primary"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
