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
});
