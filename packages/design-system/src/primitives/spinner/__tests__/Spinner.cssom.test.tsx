import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { Spinner } from '../Spinner';
import { expectToken, withTheme, getResolvedToken } from '../../../__tests__/cssom-harness';

/**
 * Spinner — twelfth L4-foundation real-component CSSOM canary
 * (PR-16 wave 1).
 *
 * Spinner uses `currentColor` for its SVG strokes/fills, so the
 * actual cascade target depends on the wrapper. In `block` mode
 * (production source line 82), Spinner wraps the SVG in a flex
 * container with `text-text-secondary` — that's the cascade
 * target. Inline mode inherits whatever color the parent provides.
 *
 * Two queryable elements:
 * - The wrapper `<div>` (block mode only) carries
 *   `text-text-secondary` — color cascade target.
 * - The inner `<svg>` carries `data-component="spinner"` from
 *   stateAttrs (also has `role="status"`).
 *
 * What this canary locks: the block-mode wrapper text color must
 * resolve to --text-secondary. If a token rename lands without
 * updating Spinner.block-mode wrapper, the spinner becomes
 * unreadable.
 */

describe('Spinner CSSOM canary', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-mode');
  });

  // The text-secondary class is on the wrapper div (block mode), NOT
  // on the SVG. The SVG carries data-component=spinner; the wrapper
  // is its parent. Walk up from the SVG.
  const findBlockWrapper = (root: HTMLElement): HTMLElement => {
    const svg = root.querySelector('[data-component="spinner"]') as HTMLElement | null;
    if (!svg) throw new Error('Spinner SVG not found via [data-component="spinner"]');
    const wrapper = svg.parentElement as HTMLElement | null;
    if (!wrapper) throw new Error('Spinner wrapper (parent of SVG) not found');
    return wrapper;
  };

  it('block mode wrapper resolves --text-secondary', async () => {
    const screen = await render(<Spinner mode="block" label="Loading…" />);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const wrapper = findBlockWrapper(screen.container as HTMLElement);

    expectToken(wrapper, 'color', 'text-secondary');
  });

  it('block mode --text-secondary flips on theme switch (light → dark)', async () => {
    const screen = await render(<Spinner mode="block" label="Loading…" />);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const wrapper = findBlockWrapper(screen.container as HTMLElement);

    const lightSecondary = getResolvedToken('text-secondary');
    expect(lightSecondary).not.toBe('');
    expectToken(wrapper, 'color', 'text-secondary');

    await withTheme('dark', async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const darkSecondary = getResolvedToken('text-secondary');
      expect(darkSecondary).not.toBe('');
      expect(darkSecondary).not.toBe(lightSecondary);
      expectToken(wrapper, 'color', 'text-secondary');
    });
  });
});
