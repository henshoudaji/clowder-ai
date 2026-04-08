'use client';

import { useEffect, useState } from 'react';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { LoadingIcon } from './icons/LoadingIcon';
import { MicIcon } from './icons/MicIcon';
import { RotatingBorderStopIcon } from './icons/RotatingBorderStopIcon';
import { SendIcon } from './icons/SendIcon';
import { StopRecordingIcon } from './icons/StopRecordingIcon';

interface ChatInputActionButtonProps {
  onTranscript: (text: string) => void;
  onSend: () => void;
  /** F39: Queue-mode send (content will be queued behind running invocation) */
  onQueueSend?: () => void;
  /** F39: Force-mode send (cancel running + execute immediately) */
  onForceSend?: () => void;
  onStop?: () => void;
  disabled?: boolean;
  sendDisabled?: boolean;
  hideIdleMic?: boolean;
  /** Whether the thread has an active invocation (broader than disabled/isLoading) */
  hasActiveInvocation?: boolean;
  hasText: boolean;
}

/** Queue send icon — arrow into a stack/list */
function QueueSendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h7a1 1 0 110 2H4a1 1 0 01-1-1z" />
      <path d="M15 11l3 3-3 3z" fillRule="evenodd" clipRule="evenodd" />
    </svg>
  );
}

/** Renders the action button states:
 *  1. Stop generation (disabled + active invocation)
 *  2. Stop recording
 *  3. Transcribing
 *  4. Queue send (F39: active invocation + has text)
 *  5. Normal send (has text)
 *  6. Mic (default)
 *
 *  Plus voice recording status overlays (REC badge, error).
 *  Keyboard shortcut: Option+V toggles recording. */
export function ChatInputActionButton({
  onTranscript,
  onSend,
  onQueueSend,
  onForceSend,
  onStop,
  disabled,
  sendDisabled,
  hideIdleMic,
  hasActiveInvocation,
  hasText,
}: ChatInputActionButtonProps) {
  const voice = useVoiceInput();
  const [visibleError, setVisibleError] = useState<string | null>(null);
  const isSendDisabled = Boolean(disabled || sendDisabled);

  useEffect(() => {
    if (voice.transcript) onTranscript(voice.transcript);
  }, [voice.transcript, onTranscript]);

  useEffect(() => {
    if (!voice.error) return;
    setVisibleError(voice.error);
    const timer = window.setTimeout(() => {
      setVisibleError(null);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [voice.error]);

  // Global keyboard shortcut: Option+V (Alt+V) toggles voice recording
  const { state: voiceState, startRecording, stopRecording } = voice;
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.altKey && e.code === 'KeyV') {
        e.preventDefault();
        if (voiceState === 'recording') {
          stopRecording();
        } else if (voiceState === 'idle' && !disabled) {
          startRecording();
        }
      }
    };
    const handleToggleVoice = () => {
      if (voiceState === 'recording') {
        stopRecording();
      } else if (voiceState === 'idle' && !disabled) {
        startRecording();
      }
    };
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('toggle-voice-recording', handleToggleVoice);
    return () => {
      document.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('toggle-voice-recording', handleToggleVoice);
    };
  }, [voiceState, startRecording, stopRecording, disabled]);

  // F39: Whether we're in queue mode (cat running + user has typed)
  const isQueueMode = Boolean(hasActiveInvocation && hasText && !disabled);
  const showIdleMic = !hideIdleMic && voice.state === 'idle';

  return (
    <div className="relative flex shrink-0 items-center justify-end ml-2">
      {/* Voice recording status */}
      {voice.state === 'recording' && (
        <div className="absolute top-0 right-4 -mt-6 flex items-center gap-2">
          {voice.partialTranscript && (
            <div className="px-2 py-0.5 bg-gray-800 text-white text-xs rounded-lg max-w-[240px] truncate opacity-80">
              {voice.partialTranscript}
            </div>
          )}
          <div className="px-2 py-0.5 bg-red-500 text-white text-xs rounded-full animate-pulse whitespace-nowrap">
            REC {Math.floor(voice.duration / 60)}:{String(voice.duration % 60).padStart(2, '0')}
          </div>
        </div>
      )}
      {visibleError && (
        <div className="absolute right-0 bottom-full mb-2 w-[240px] max-w-[70vw] rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-600 shadow-sm break-words">
          {visibleError}
        </div>
      )}

      {!hasText && showIdleMic && (
        <button
          onClick={voice.startRecording}
          disabled={disabled}
          className="inline-flex hidden h-8 w-8 shrink-0 items-center justify-center rounded-xl text-gray-400 hover:text-cocreator-primary hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Start voice input (⌥V)"
          title="语音输入 (⌥V)"
        >
          <MicIcon className="w-5 h-5" />
        </button>
      )}

      {/* Stop button: visible alongside queue send during active invocation (not when disabled — primary stop covers it) */}
      {hasActiveInvocation && !disabled && onStop && (
        <button
          onClick={() => onStop()}
          className="inline-flex shrink-0 items-center bg-[rgba(20,118,255,0.1)] gap-2 rounded-full px-3 py-1.5 text-[12px] font-medium text-[rgba(20,118,255,1)] transition-colors hover:bg-blue-50"
          title="停止回答"
          aria-label="Stop generation"
        >
          <RotatingBorderStopIcon className="h-5 w-5 shrink-0" />
          <span>停止回答</span>
        </button>
      )}

      {/* Primary action button priority chain */}
      {disabled && onStop && hasActiveInvocation ? (
        /* Backward compat: when explicitly disabled during active invocation, Stop is the only primary action */
        <button
          onClick={() => onStop()}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors"
          title="停止生成"
          aria-label="Stop generation"
        >
          <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
            <rect x="4" y="4" width="12" height="12" rx="2" />
          </svg>
        </button>
      ) : voice.state === 'recording' ? (
        <button
          onClick={voice.stopRecording}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors animate-pulse"
          title="停止录音"
          aria-label="Stop recording"
        >
          <StopRecordingIcon className="w-5 h-5" />
        </button>
      ) : voice.state === 'transcribing' ? (
        <button
          disabled
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gray-300 text-white cursor-wait"
          title="转写中"
          aria-label="Transcribing"
        >
          <LoadingIcon className="w-5 h-5" />
        </button>
      ) : isQueueMode && onQueueSend ? (
        /* F39: Queue send — cat is running, user typed, queue the message */
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onQueueSend}
            disabled={isSendDisabled}
            className="inline-flex hidden h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#9B7EBD] text-white hover:bg-[#8A6DAC] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="排队发送"
            title="排队发送 — 猫猫忙完后处理"
          >
            <QueueSendIcon className="w-5 h-5" />
          </button>
          {onForceSend && (
            <button
              onClick={onForceSend}
              disabled={isSendDisabled}
              className="inline-flex hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors"
              aria-label="强制发送"
              title="强制发送 — 中断当前猫猫"
            >
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.381z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
        </div>
      ) : hasText ? (
        <button
          onClick={onSend}
          disabled={isSendDisabled}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[20px] bg-[rgba(20,118,255,1)] text-white hover:bg-[rgba(20,118,255,0.9)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="发送消息"
          aria-label="Send message"
        >
          <SendIcon className="w-5 h-5" />
        </button>
      ) : null}
    </div>
  );
}
