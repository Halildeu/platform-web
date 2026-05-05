import { describe, it, expect } from 'vitest';
import { withTheme, getResolvedToken, expectToken } from './cssom-harness';

/**
 * Tailwind 4 layer build sentinel.
 *
 * If any of these assertions fails, the Vitest browser provider's Vite
 * plugin chain is not loading the Tailwind 4 entry. Every other CSSOM
 * test in the suite is meaningless until this passes — the harness has
 * no way to read resolved tokens otherwise.
 *
 * The sentinel deliberately uses tokens that the design-system declares
 * in both light and dark mode (`--surface-default-bg`) so the same file
 * also proves the dark-mode variant is being applied through `data-mode`.
 */
describe('Tailwind 4 layer build sentinel', () => {
  it('resolves --surface-default-bg on :root (Tailwind layer + theme.css loaded)', () => {
    const value = getResolvedToken('surface-default-bg');
    expect(value).not.toBe('');
    // Light-mode default is white via oklch(100% 0 0deg). We don't assert
    // the exact color string because Chromium normalizes oklch differently
    // across versions; we assert non-empty + recognizable shape.
    expect(value).toMatch(/oklch|rgb|#|hsl/i);
  });

  it('resolves a Tailwind utility class against the underlying token', () => {
    const host = document.createElement('div');
    host.className = 'bg-surface-default';
    document.body.appendChild(host);
    try {
      const computed = getComputedStyle(host).backgroundColor;
      // backgroundColor must not be transparent — that would mean the
      // utility class did not produce any cascade.
      expect(computed).not.toBe('');
      expect(computed).not.toBe('rgba(0, 0, 0, 0)');
      expect(computed).not.toBe('transparent');
    } finally {
      host.remove();
    }
  });

  it('switches resolved token value between light and dark via data-mode', async () => {
    const lightValue = getResolvedToken('surface-default-bg');
    expect(lightValue).not.toBe('');

    let darkValue = '';
    await withTheme('dark', () => {
      darkValue = getResolvedToken('surface-default-bg');
    });

    expect(darkValue).not.toBe('');
    expect(darkValue).not.toBe(lightValue);
  });

  it('expectToken matcher resolves and asserts equality against :root token', () => {
    const host = document.createElement('div');
    host.style.color = getComputedStyle(document.documentElement)
      .getPropertyValue('--text-primary')
      .trim();
    document.body.appendChild(host);
    try {
      // No throw means the matcher resolved the token and matched.
      expectToken(host, 'color', 'text-primary');
    } finally {
      host.remove();
    }
  });
});
