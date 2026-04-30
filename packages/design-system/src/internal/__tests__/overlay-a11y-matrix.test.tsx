// @vitest-environment jsdom
//
// Codex 019dde3d iter-46 — overlay a11y combination matrix.
//
// Locks the interaction between the four overlay-engine concerns that
// share the same lifecycle: focus-trap, scroll-lock, escape-key,
// outside-click. Each case proves a specific combination behavior so
// future hook changes can't silently regress one without breaking a
// case here. Per Codex review:
//   - Single dedicated file (clear naming, future-proof)
//   - 6 deterministic cases — nested overlay deferred to iter-47 as
//     stacking contract is not finalized
//   - FormDrawer is the canonical consumer (default-on focus trap +
//     scroll-lock + escape + backdrop-click); this matrix exercises
//     it end-to-end through the public API.

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FormDrawer } from '../../patterns/form-drawer/FormDrawer';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

describe('overlay a11y matrix — focus-trap + scroll-lock + escape + outside-click', () => {
  it('Escape closes the drawer and triggers focus restore to the trigger', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Trigger';
    document.body.appendChild(trigger);
    trigger.focus();

    const onClose = vi.fn();
    // Wrap in conditional so a state flip ACTUALLY unmounts the drawer
    // (the hook's restoreFocus runs on unmount cleanup; rerender with
    // `open={false}` keeps the FormDrawer mounted because it returns
    // `null` internally, which doesn't unwind the parent's hooks).
    function Host({ open }: { open: boolean }) {
      return open ? (
        <FormDrawer open onClose={onClose} title="Esc Test">
          <input placeholder="content" />
        </FormDrawer>
      ) : null;
    }
    const { rerender } = render(<Host open={true} />);
    await new Promise((r) => setTimeout(r, 80));

    // Escape fires onClose
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Unmount the drawer entirely — hook cleanup runs.
    rerender(<Host open={false} />);
    // Wait for hook restoreFocus setTimeout(0)
    await new Promise((r) => setTimeout(r, 30));

    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });

  it('Outside backdrop click closes the drawer (closeOnBackdrop=true default)', () => {
    const onClose = vi.fn();
    const { container } = render(
      <FormDrawer open onClose={onClose} title="Backdrop Test">
        <p>Content</p>
      </FormDrawer>,
    );

    const backdrop = container.querySelector('[aria-hidden]');
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Outside backdrop click does NOT close when closeOnBackdrop=false', () => {
    const onClose = vi.fn();
    const { container } = render(
      <FormDrawer open onClose={onClose} title="No Backdrop" closeOnBackdrop={false}>
        <p>Content</p>
      </FormDrawer>,
    );

    const backdrop = container.querySelector('[aria-hidden]');
    fireEvent.click(backdrop!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Scroll-lock: body.overflow="hidden" while open, cleared on unmount', () => {
    const { unmount } = render(
      <FormDrawer open onClose={vi.fn()} title="Scroll Lock">
        <p>Content</p>
      </FormDrawer>,
    );
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('Tab wrap-around AND scroll-lock are both active on the same render', async () => {
    render(
      <FormDrawer open onClose={vi.fn()} title="Combined">
        <button data-testid="b1">First inner</button>
        <button data-testid="b2">Last inner</button>
      </FormDrawer>,
    );
    await new Promise((r) => setTimeout(r, 80));

    // Scroll-lock active
    expect(document.body.style.overflow).toBe('hidden');

    // Tab wrap: from last inner → close button (first focusable in DOM order)
    const closeBtn = screen.getByLabelText('Close drawer');
    const lastInner = screen.getByTestId('b2');
    lastInner.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(closeBtn);
  });

  it('disableFocusTrap=true keeps scroll-lock + escape active (only the trap is disabled)', async () => {
    const onClose = vi.fn();
    render(
      <FormDrawer open onClose={onClose} title="Trap Off" disableFocusTrap>
        <button data-testid="b1">Inner</button>
      </FormDrawer>,
    );
    await new Promise((r) => setTimeout(r, 80));

    // Scroll-lock still active
    expect(document.body.style.overflow).toBe('hidden');

    // Escape still closes
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Trap is OFF: Tab from inner does NOT wrap (no preventDefault).
    // We assert focus is NOT moved by the hook to a different element.
    const inner = screen.getByTestId('b1');
    inner.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    // With trap disabled, focus stays where it was at keydown (browser
    // would move it natively, but jsdom doesn't simulate Tab order).
    expect(document.activeElement).toBe(inner);
  });
});
