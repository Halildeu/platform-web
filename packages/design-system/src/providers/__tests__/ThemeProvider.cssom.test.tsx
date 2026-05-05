import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { ThemeProvider, useTheme } from '../ThemeProvider';
import type { ThemeContextValue } from '../ThemeProvider';
import { getResolvedToken, expectToken } from '../../__tests__/cssom-harness';

/**
 * ThemeProvider CSSOM canary.
 *
 * Verifies that the production ThemeProvider, mounted in real Chromium,
 * drives `data-mode` on `documentElement` such that resolved CSS variable
 * values change between light and dark.
 *
 * If this fails, every theme-aware primitive built on top of these
 * tokens is silently broken in dark mode — the previous mocked
 * `useAutoThemeAdapter` test could not detect this because jsdom
 * returns empty strings for `getComputedStyle` on `:root`.
 */
describe('ThemeProvider CSSOM canary', () => {
  beforeEach(() => {
    try {
      window.localStorage.removeItem('themeAxes');
    } catch {
      /* ignore */
    }
    document.documentElement.removeAttribute('data-mode');
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    try {
      window.localStorage.removeItem('themeAxes');
    } catch {
      /* ignore */
    }
  });

  it('mounts with light appearance and writes data-mode=light to :root', async () => {
    await render(
      <ThemeProvider defaultAxes={{ appearance: 'light' }}>
        <div data-testid="canary" />
      </ThemeProvider>,
    );
    // Allow ThemeProvider's mount-only useEffect to commit before reading.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(document.documentElement.getAttribute('data-mode')).toBe('light');
    const value = getResolvedToken('surface-default-bg');
    expect(value).not.toBe('');
  });

  it('switches resolved --surface-default-bg between light and dark via setAppearance', async () => {
    let api: ThemeContextValue | null = null;
    function Capture() {
      api = useTheme();
      return null;
    }

    await render(
      <ThemeProvider defaultAxes={{ appearance: 'light' }}>
        <Capture />
      </ThemeProvider>,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    const lightValue = getResolvedToken('surface-default-bg');
    expect(lightValue).not.toBe('');

    expect(api).not.toBeNull();
    api!.setAppearance('dark');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(document.documentElement.getAttribute('data-mode')).toBe('dark');
    const darkValue = getResolvedToken('surface-default-bg');
    expect(darkValue).not.toBe('');
    expect(darkValue).not.toBe(lightValue);
  });

  it('expectToken matches a primitive surface against the resolved theme token', async () => {
    const screen = await render(
      <ThemeProvider defaultAxes={{ appearance: 'light' }}>
        <div
          data-testid="surface"
          className="bg-surface-default"
          style={{ width: 16, height: 16 }}
        />
      </ThemeProvider>,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    const surface = screen.getByTestId('surface').element() as HTMLElement;
    expect(surface).toBeTruthy();
    // The Tailwind utility `bg-surface-default` resolves through the
    // `@theme inline` mapping (`--color-surface-default` → `var(--surface-default-bg)`).
    // We assert against the raw `:root`-level token because Tailwind 4
    // `@theme inline` declarations are not exposed on documentElement —
    // they feed the utility class generator only. Asserting against the
    // raw token is the runtime-stable contract.
    expectToken(surface, 'backgroundColor', 'surface-default-bg');
  });
});
