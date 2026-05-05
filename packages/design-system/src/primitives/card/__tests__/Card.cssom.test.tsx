import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { Card } from '../Card';
import { expectToken, withTheme, getResolvedToken } from '../../../__tests__/cssom-harness';

/**
 * Card — sixth L4-foundation real-component CSSOM canary.
 *
 * Card is a plain non-interactive container — no proxy span, no
 * sr-only input, no focus ring (unless `as="button"`). What this
 * canary locks is the **variant ↔ token mapping**:
 *
 *   elevated → bg-surface-default + border-border-subtle
 *   outlined → bg-transparent + border-border-default
 *   filled   → bg-surface-muted + border-transparent
 *   ghost    → bg-transparent + border-transparent
 *
 * If a token rename lands (e.g. `--surface-default` → `--surface-base`)
 * without updating Card's variantStyles class chain, the elevated
 * variant collapses to transparent and the user gets an unstyled card.
 * jsdom would never catch that — only a real Chromium computed-style
 * read does.
 *
 * Plus the standard theme-switch lock (--surface-default flips on
 * `data-mode=dark`).
 */

describe('Card CSSOM canary', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-mode');
  });

  // Helper: Card root has `data-component="card"` from stateAttrs.
  // Use that as the deterministic query target — no role, no testid
  // pollution, no DOM walk-up.
  const findCard = (root: HTMLElement): HTMLElement => {
    const el = root.querySelector('[data-component="card"]') as HTMLElement | null;
    if (!el) throw new Error('Card root not found via [data-component="card"]');
    return el;
  };

  it('elevated variant resolves --surface-default bg + --border-subtle border', async () => {
    const screen = await render(<Card variant="elevated">content</Card>);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const card = findCard(screen.container as HTMLElement);

    expectToken(card, 'backgroundColor', 'surface-default');
    expectToken(card, 'borderTopColor', 'border-subtle');
  });

  it('outlined variant resolves --border-default border (transparent bg)', async () => {
    const screen = await render(<Card variant="outlined">content</Card>);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const card = findCard(screen.container as HTMLElement);

    expectToken(card, 'borderTopColor', 'border-default');

    // bg-transparent: computed background-color is rgba(0, 0, 0, 0).
    // We assert "is transparent" rather than chasing a token (since
    // there is no `--bg-transparent` token; transparent is the literal
    // CSS keyword).
    const bg = window.getComputedStyle(card).backgroundColor;
    expect(bg).toMatch(/rgba?\(0,\s*0,\s*0,\s*0\)|transparent/);
  });

  it('filled variant resolves --surface-muted bg', async () => {
    const screen = await render(<Card variant="filled">content</Card>);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const card = findCard(screen.container as HTMLElement);

    expectToken(card, 'backgroundColor', 'surface-muted');
  });

  it('elevated --surface-default flips on theme switch (light → dark)', async () => {
    const screen = await render(<Card variant="elevated">content</Card>);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const card = findCard(screen.container as HTMLElement);

    const lightSurface = getResolvedToken('surface-default');
    expect(lightSurface).not.toBe('');
    expectToken(card, 'backgroundColor', 'surface-default');

    await withTheme('dark', async () => {
      // Microtask flush for Tailwind 4 dark variant cascade.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const darkSurface = getResolvedToken('surface-default');
      expect(darkSurface).not.toBe('');
      expect(darkSurface).not.toBe(lightSurface);
      // Same DOM node resolves to the dark-mode token without re-render.
      expectToken(card, 'backgroundColor', 'surface-default');
    });
  });
});
