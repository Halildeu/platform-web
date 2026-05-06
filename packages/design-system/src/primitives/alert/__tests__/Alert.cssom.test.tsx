import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { Alert } from '../Alert';
import { expectToken, withTheme, getResolvedToken } from '../../../__tests__/cssom-harness';

/**
 * Alert — tenth L4-foundation real-component CSSOM canary.
 *
 * Alert has 4 state-bound variants, each pulling 3 tokens from the
 * `state-*` family (bg, border, text). What this canary locks:
 *
 *   info    → bg-state-info-bg    + border-state-info-text/20    + text-state-info-text
 *   success → bg-state-success-bg + border-state-success-text/20 + text-state-success-text
 *   warning → bg-state-warning-bg + border-state-warning-text/20 + text-state-warning-text
 *   error   → bg-state-danger-bg  + border-state-danger-text/20  + text-state-danger-text
 *
 * If a token rename lands on any of `state-{info,success,warning,danger}-{bg,text}`
 * without updating Alert.variantStyles, the corresponding variant
 * loses its semantic color cue silently — invisible to jsdom but
 * critical for accessibility (info/success/warning/error must look
 * different to color-vision users).
 *
 * Border uses `/20` opacity modifier → `color-mix(in oklab, ... 20%, transparent)`
 * cascade; we use the reference-element pattern (PR-8 Codex iter-2)
 * for byte-for-byte border-color equality on every variant
 * (parametric `it.each` over 4 variants — PR-14 Codex iter-1).
 */

describe('Alert CSSOM canary', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-mode');
  });

  // Alert root has role="alert" and data-component="alert" from stateAttrs.
  // role is the more durable query target.
  const findAlert = (root: HTMLElement): HTMLElement => {
    const el = root.querySelector('[role="alert"]') as HTMLElement | null;
    if (!el) throw new Error('Alert root not found via role=alert');
    return el;
  };

  it('info variant resolves --state-info-bg + --state-info-text tokens', async () => {
    const screen = await render(
      <Alert variant="info" title="Info">
        Body
      </Alert>,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const alert = findAlert(screen.container as HTMLElement);

    expectToken(alert, 'backgroundColor', 'state-info-bg');
    expectToken(alert, 'color', 'state-info-text');
  });

  it('success variant resolves --state-success-bg + --state-success-text tokens', async () => {
    const screen = await render(
      <Alert variant="success" title="OK">
        Body
      </Alert>,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const alert = findAlert(screen.container as HTMLElement);

    expectToken(alert, 'backgroundColor', 'state-success-bg');
    expectToken(alert, 'color', 'state-success-text');
  });

  it('warning variant resolves --state-warning-bg + --state-warning-text tokens', async () => {
    const screen = await render(
      <Alert variant="warning" title="Heads up">
        Body
      </Alert>,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const alert = findAlert(screen.container as HTMLElement);

    expectToken(alert, 'backgroundColor', 'state-warning-bg');
    expectToken(alert, 'color', 'state-warning-text');
  });

  it('error variant resolves --state-danger-bg + --state-danger-text tokens', async () => {
    const screen = await render(
      <Alert variant="error" title="Failed">
        Body
      </Alert>,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const alert = findAlert(screen.container as HTMLElement);

    expectToken(alert, 'backgroundColor', 'state-danger-bg');
    expectToken(alert, 'color', 'state-danger-text');
  });

  // Border color-mix coverage for ALL 4 variants. Codex thread
  // 019dfae2 iter-1 finding 1: info-only assertion proves the
  // Tailwind opacity mechanism but doesn't catch wrong token mapping
  // per variant (e.g., `success` border accidentally pointing to
  // `state-info-text/20` would still pass an info-only test).
  // Parametric assertion across all 4 closes that gap.
  const VARIANT_BORDER_TOKENS = [
    { variant: 'info' as const, token: 'state-info-text' },
    { variant: 'success' as const, token: 'state-success-text' },
    { variant: 'warning' as const, token: 'state-warning-text' },
    { variant: 'error' as const, token: 'state-danger-text' },
  ];

  it.each(VARIANT_BORDER_TOKENS)(
    '$variant variant border resolves --$token/20 (color-mix)',
    async ({ variant, token }) => {
      // Reference-element pattern (PR-8 Codex iter-2): stamp the
      // expected color-mix expression on a sibling element, read
      // its computed borderTopColor, require byte-for-byte match
      // with the alert's. If the variant accidentally drops to a
      // different token, the reference resolves to a different
      // value and the test fails.
      const screen = await render(
        <Alert variant={variant} title="Border check">
          Body
        </Alert>,
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const alert = findAlert(screen.container as HTMLElement);

      const ref = document.createElement('div');
      ref.style.borderTopStyle = 'solid';
      ref.style.borderTopWidth = '1px';
      ref.style.borderTopColor = `color-mix(in oklab, var(--${token}) 20%, transparent)`;
      document.body.appendChild(ref);

      try {
        const got = window.getComputedStyle(alert).borderTopColor.replace(/\s+/g, '').toLowerCase();
        const want = window.getComputedStyle(ref).borderTopColor.replace(/\s+/g, '').toLowerCase();
        expect(want).not.toBe('');
        expect(got).toBe(want);
      } finally {
        ref.remove();
      }

      // Sanity floor: the underlying token resolves at root.
      const tokenValue = getResolvedToken(token);
      expect(tokenValue).not.toBe('');
    },
  );

  it('success variant --state-success-bg flips on theme switch (light → dark)', async () => {
    const screen = await render(
      <Alert variant="success" title="Theme test">
        Body
      </Alert>,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const alert = findAlert(screen.container as HTMLElement);

    const lightBg = getResolvedToken('state-success-bg');
    expect(lightBg).not.toBe('');
    expectToken(alert, 'backgroundColor', 'state-success-bg');

    await withTheme('dark', async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const darkBg = getResolvedToken('state-success-bg');
      expect(darkBg).not.toBe('');
      expect(darkBg).not.toBe(lightBg);
      expectToken(alert, 'backgroundColor', 'state-success-bg');
    });
  });
});
