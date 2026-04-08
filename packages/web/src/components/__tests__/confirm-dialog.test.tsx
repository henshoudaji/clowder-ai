import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '@/components/ConfirmDialog';

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

describe('ConfirmDialog', () => {
  it('calls onCancel when header close icon is clicked', () => {
    const onCancel = vi.fn();
    act(() => {
      root.render(
        React.createElement(ConfirmDialog, {
          open: true,
          title: '删除确认',
          message: '确认删除吗？',
          onConfirm: vi.fn(),
          onCancel,
        }),
      );
    });

    const closeButton = container.querySelector('button[aria-label="close"]') as HTMLButtonElement | null;
    expect(closeButton).toBeTruthy();

    act(() => {
      closeButton?.click();
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('applies shared footer button classes for default confirm flow', () => {
    act(() => {
      root.render(
        React.createElement(ConfirmDialog, {
          open: true,
          title: 'Confirm',
          message: 'Continue?',
          onConfirm: vi.fn(),
          onCancel: vi.fn(),
        }),
      );
    });

    const cancelButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '取消');
    const confirmButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '确认');

    expect(cancelButton?.className).toContain('ui-button-default');
    expect(cancelButton?.className).not.toContain('ui-button-secondary');
    expect(cancelButton?.className).toContain('ui-modal-action-button');
    expect(confirmButton?.className).toContain('ui-button-primary');
    expect(confirmButton?.className).toContain('ui-modal-action-button');
  });

  it('uses danger button styling for destructive confirm flow', () => {
    act(() => {
      root.render(
        React.createElement(ConfirmDialog, {
          open: true,
          title: 'Delete',
          message: 'Delete this model?',
          confirmLabel: '删除',
          variant: 'danger',
          onConfirm: vi.fn(),
          onCancel: vi.fn(),
        }),
      );
    });

    const confirmButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '删除');
    expect(confirmButton?.className).toContain('ui-button-danger');
    expect(confirmButton?.className).toContain('ui-modal-action-button');
  });
});
