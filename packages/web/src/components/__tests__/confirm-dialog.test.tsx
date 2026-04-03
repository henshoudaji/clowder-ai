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
});
