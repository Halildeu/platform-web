import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { Avatar } from '../Avatar';
import { expectToken, withTheme, getResolvedToken } from '../../../__tests__/cssom-harness';

/**
 * Avatar — thirteenth L4-foundation real-component CSSOM canary
 * (PR-16 wave 1).
 *
 * Avatar's fallback (no image, only initials/icon/default) uses
 * `bg-surface-muted text-text-secondary` (production source line
 * 72). What this canary locks is that fallback cascade — if either
 * token is renamed without updating Avatar, the fallback collapses
 * (transparent bg or invisible text against the surface).
 *
 * Note: Avatar also renders an `<img>` element when `src` is set;
 * that path bypasses the bg/text tokens (image fills the container).
 * Tests use the no-src path to exercise the fallback.
 */

describe('Avatar CSSOM canary', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-mode');
  });

  const findAvatar = (root: HTMLElement): HTMLElement => {
    const el = root.querySelector('[data-component="avatar"]') as HTMLElement | null;
    if (!el) throw new Error('Avatar root not found via [data-component="avatar"]');
    return el;
  };

  it('fallback resolves --surface-muted bg + --text-secondary text', async () => {
    const screen = await render(<Avatar initials="AB" />);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const av = findAvatar(screen.container as HTMLElement);

    expectToken(av, 'backgroundColor', 'surface-muted');
    expectToken(av, 'color', 'text-secondary');
  });

  it('fallback --surface-muted flips on theme switch (light → dark)', async () => {
    const screen = await render(<Avatar initials="AB" />);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const av = findAvatar(screen.container as HTMLElement);

    const lightMuted = getResolvedToken('surface-muted');
    expect(lightMuted).not.toBe('');
    expectToken(av, 'backgroundColor', 'surface-muted');

    await withTheme('dark', async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const darkMuted = getResolvedToken('surface-muted');
      expect(darkMuted).not.toBe('');
      expect(darkMuted).not.toBe(lightMuted);
      expectToken(av, 'backgroundColor', 'surface-muted');
    });
  });
});
