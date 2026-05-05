import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { Dialog } from '../Dialog';
import { expectToken, withTheme, getResolvedToken } from '../../../__tests__/cssom-harness';

/**
 * Dialog — seventh L4-foundation real-component CSSOM canary.
 *
 * Dialog uses the native HTML `<dialog>` element (top-layer when
 * opened with `showModal()`). What this canary locks is the panel
 * token cascade — if a token rename lands on `--surface-default` or
 * `--border-subtle` without updating Dialog, the modal collapses to
 * an unstyled box. That regression is invisible to jsdom.
 *
 * Backdrop pseudo-element styling (`::backdrop`) is intentionally NOT
 * asserted: cross-browser pseudo-element computed-style read is
 * unreliable for canary-grade signal. The panel cascade alone is
 * sufficient for token-rename detection.
 */

describe('Dialog CSSOM canary', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-mode');
  });

  // Production attr: stateAttrs({ component: 'dialog' }) → data-component="dialog"
  const findDialog = (root: HTMLElement): HTMLElement => {
    const el = root.querySelector('[data-component="dialog"]') as HTMLElement | null;
    if (!el) throw new Error('Dialog root not found via [data-component="dialog"]');
    return el;
  };

  it('open dialog panel resolves --surface-default bg + --border-subtle border', async () => {
    const screen = await render(
      <Dialog open onClose={() => {}} title="Confirm">
        <div>Body</div>
      </Dialog>,
    );
    // showModal() runs in useEffect; let it settle.
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const dialog = findDialog(screen.container as HTMLElement);

    expectToken(dialog, 'backgroundColor', 'surface-default');
    expectToken(dialog, 'borderTopColor', 'border-subtle');
  });

  it('panel --surface-default flips on theme switch (light → dark)', async () => {
    const screen = await render(
      <Dialog open onClose={() => {}} title="Theme test">
        <div>Body</div>
      </Dialog>,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const dialog = findDialog(screen.container as HTMLElement);

    const lightSurface = getResolvedToken('surface-default');
    expect(lightSurface).not.toBe('');
    expectToken(dialog, 'backgroundColor', 'surface-default');

    await withTheme('dark', async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const darkSurface = getResolvedToken('surface-default');
      expect(darkSurface).not.toBe('');
      expect(darkSurface).not.toBe(lightSurface);
      expectToken(dialog, 'backgroundColor', 'surface-default');
    });
  });

  it('open state attribute is set when dialog is open', async () => {
    const screen = await render(
      <Dialog open onClose={() => {}}>
        <div>Body</div>
      </Dialog>,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const dialog = findDialog(screen.container as HTMLElement);

    // Production stateAttrs adds `data-state="open"` when open=true.
    // This is what consumers query for animations / external state
    // hooks; locking it at the canary keeps it stable.
    expect(dialog.getAttribute('data-state')).toBe('open');
  });

  it('::backdrop pseudo-element resolves --surface-overlay/50 (color-mix)', async () => {
    // PR-12 Codex thread 019dfa4b iter-1: this assertion locks the
    // production fix on Dialog (`backdrop:bg-surface-overlay/50`).
    // Without this canary, regressing Dialog's backdrop class to an
    // unregistered Tailwind color (the original bug — `surface-inverse`)
    // would slip through unnoticed. Drawer's backdrop test already
    // locks the same cascade for the overlay div pattern; this locks
    // the equivalent for the native <dialog> ::backdrop pseudo-element.
    const screen = await render(
      <Dialog open onClose={() => {}}>
        <div>Body</div>
      </Dialog>,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const dialog = findDialog(screen.container as HTMLElement);

    // Reference element with the production cascade target. Stamp it
    // on a sibling div and read computed values for byte-for-byte
    // comparison.
    const ref = document.createElement('div');
    ref.style.backgroundColor = 'color-mix(in oklab, var(--surface-overlay-bg) 50%, transparent)';
    document.body.appendChild(ref);

    try {
      // Chromium's window.getComputedStyle(el, '::backdrop') returns
      // a CSSStyleDeclaration scoped to that pseudo. If the compiled
      // CSS for the backdrop variant didn't emit, backgroundColor
      // falls back to the UA stylesheet (typically rgba(0,0,0,0.4)
      // or transparent), neither of which matches the reference.
      const got = window
        .getComputedStyle(dialog, '::backdrop')
        .backgroundColor.replace(/\s+/g, '')
        .toLowerCase();
      const want = window.getComputedStyle(ref).backgroundColor.replace(/\s+/g, '').toLowerCase();
      expect(want).not.toBe('');
      expect(got).toBe(want);
    } finally {
      ref.remove();
    }

    // Sanity floor: --surface-overlay-bg resolves at root.
    const overlayToken = getResolvedToken('surface-overlay-bg');
    expect(overlayToken).not.toBe('');
  });
});
