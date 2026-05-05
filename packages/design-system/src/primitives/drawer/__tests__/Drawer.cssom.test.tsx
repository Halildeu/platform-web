import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { Drawer } from '../Drawer';
import { expectToken, withTheme, getResolvedToken } from '../../../__tests__/cssom-harness';

/**
 * Drawer — eighth L4-foundation real-component CSSOM canary.
 *
 * Drawer is a slide-in side panel with a separate backdrop overlay
 * div. The cascade we lock:
 *
 * - Panel: `bg-surface-default` (Tailwind utility)
 * - Backdrop: `bg-surface-overlay/40` (Tailwind opacity modifier
 *   resolves to `color-mix(in oklab, var(--surface-overlay-bg) 40%, transparent)`)
 *
 * Using the reference-element comparison pattern (PR-8 Codex
 * iter-2 strengthening) for the backdrop assertion, since opacity
 * modifiers create a `color-mix()` value that differs byte-for-byte
 * from the raw token.
 *
 * Focus-trap (K4 lessons from `useFocusTrap`) is NOT exercised here
 * — autoFocus settles in ~50ms but cssom tests don't dispatch
 * keyboard events, so the focus-trap race that bit drawer
 * interaction tests (Codex 019df8a4 iter-3 K4) doesn't apply to
 * static token reads.
 */

describe('Drawer CSSOM canary', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-mode');
  });

  // Drawer renders via React portal into document.body, NOT into the
  // vitest-browser-react container. Query from document directly.
  const findDrawer = () => {
    const container = document.querySelector('[data-component="drawer"]') as HTMLElement | null;
    if (!container) throw new Error('Drawer container not found');
    const panel = container.querySelector('[role="dialog"]') as HTMLElement | null;
    if (!panel) throw new Error('Drawer panel not found via role=dialog');
    const overlay = container.querySelector('[data-testid="drawer-overlay"]') as HTMLElement | null;
    return { container, panel, overlay };
  };

  it('open panel resolves --surface-default background', async () => {
    await render(
      <Drawer open onClose={() => {}} placement="right" title="Filter">
        <div>Body</div>
      </Drawer>,
    );
    // useFocusTrap autoFocus settles ~50ms; flush microtasks first.
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const { panel } = findDrawer();

    expectToken(panel, 'backgroundColor', 'surface-default');
  });

  it('backdrop overlay resolves --surface-overlay/40 (color-mix)', async () => {
    await render(
      <Drawer open onClose={() => {}} placement="right">
        <div>Body</div>
      </Drawer>,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const { overlay } = findDrawer();
    expect(overlay).not.toBeNull();

    // Tailwind's `bg-surface-overlay/40` resolves to:
    //   color-mix(in oklab, var(--surface-overlay-bg) 40%, transparent)
    // Stamp the same expression on a reference element and compare
    // Chromium's normalized output (PR-8 Codex iter-2 pattern). If
    // the variant accidentally drops to a different token, the
    // reference value differs and the test fails.
    const ref = document.createElement('div');
    ref.style.backgroundColor = 'color-mix(in oklab, var(--surface-overlay-bg) 40%, transparent)';
    document.body.appendChild(ref);

    try {
      const got = window
        .getComputedStyle(overlay as HTMLElement)
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

  it('container carries data-state="open" + data-component="drawer"', async () => {
    await render(
      <Drawer open onClose={() => {}} placement="right">
        <div>Body</div>
      </Drawer>,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const { container } = findDrawer();

    expect(container.getAttribute('data-state')).toBe('open');
    expect(container.getAttribute('data-component')).toBe('drawer');
  });

  it('panel --surface-default flips on theme switch (light → dark)', async () => {
    await render(
      <Drawer open onClose={() => {}} placement="right">
        <div>Body</div>
      </Drawer>,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const { panel } = findDrawer();

    const lightSurface = getResolvedToken('surface-default');
    expect(lightSurface).not.toBe('');
    expectToken(panel, 'backgroundColor', 'surface-default');

    await withTheme('dark', async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const darkSurface = getResolvedToken('surface-default');
      expect(darkSurface).not.toBe('');
      expect(darkSurface).not.toBe(lightSurface);
      expectToken(panel, 'backgroundColor', 'surface-default');
    });
  });
});
