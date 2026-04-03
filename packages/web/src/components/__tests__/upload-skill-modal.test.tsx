import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadSkillModal } from '@/components/UploadSkillModal';

beforeAll(() => {
  (globalThis as { React?: typeof React }).React = React;
});

afterAll(() => {
  delete (globalThis as { React?: typeof React }).React;
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderModal(props: Partial<React.ComponentProps<typeof UploadSkillModal>> = {}) {
  const defaults: React.ComponentProps<typeof UploadSkillModal> = {
    open: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  };
  const merged = { ...defaults, ...props };
  act(() => {
    root.render(React.createElement(UploadSkillModal, merged));
  });
  return merged;
}

describe('UploadSkillModal', () => {
  it('renders as a modal dialog', () => {
    renderModal();
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
  });

  it('does not close when clicking overlay', () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    const overlay = container.querySelector('[data-testid="upload-skill-overlay"]') as HTMLDivElement | null;
    expect(overlay).toBeTruthy();

    act(() => {
      overlay?.click();
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('still closes from cancel action', () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    const cancelButton = container.querySelector('button.ui-button-secondary') as HTMLButtonElement | null;
    expect(cancelButton).toBeTruthy();

    act(() => {
      cancelButton?.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from header close icon', () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    const closeButton = container.querySelector('button[aria-label="close"]') as HTMLButtonElement | null;
    expect(closeButton).toBeTruthy();

    act(() => {
      closeButton?.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

