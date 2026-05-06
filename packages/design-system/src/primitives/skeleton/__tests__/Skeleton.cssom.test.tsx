import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { Skeleton } from '../Skeleton';
import { expectToken, withTheme, getResolvedToken } from '../../../__tests__/cssom-harness';

/**
 * Skeleton — eleventh L4-foundation real-component CSSOM canary
 * (PR-16 wave 1).
 *
 * Skeleton is a placeholder primitive that signals "loading" via a
 * pulse animation on a `bg-surface-muted` block. The token it locks
 * is the muted surface — the same token used by Card filled variant
 * and Avatar fallback. If `--surface-muted` is renamed without
 * updating Skeleton's class, the loading state collapses to
 * transparent (effectively invisible to the user).
 *
 * Production source: `Skeleton.tsx:50` applies `animate-pulse
 * rounded-lg bg-surface-muted` (animated branch). data-component
 * attr from stateAttrs makes the root queryable without testid.
 */

describe('Skeleton CSSOM canary', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-mode');
  });

  const findSkeleton = (root: HTMLElement): HTMLElement => {
    const el = root.querySelector('[data-component="skeleton"]') as HTMLElement | null;
    if (!el) throw new Error('Skeleton root not found via [data-component="skeleton"]');
    return el;
  };

  it('renders --surface-muted background', async () => {
    const screen = await render(<Skeleton width={120} height={20} />);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const sk = findSkeleton(screen.container as HTMLElement);

    expectToken(sk, 'backgroundColor', 'surface-muted');
  });

  it('--surface-muted flips on theme switch (light → dark)', async () => {
    const screen = await render(<Skeleton width={120} height={20} />);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const sk = findSkeleton(screen.container as HTMLElement);

    const lightMuted = getResolvedToken('surface-muted');
    expect(lightMuted).not.toBe('');
    expectToken(sk, 'backgroundColor', 'surface-muted');

    await withTheme('dark', async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const darkMuted = getResolvedToken('surface-muted');
      expect(darkMuted).not.toBe('');
      expect(darkMuted).not.toBe(lightMuted);
      expectToken(sk, 'backgroundColor', 'surface-muted');
    });
  });
});
