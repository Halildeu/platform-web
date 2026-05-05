import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';
import { Radio } from '../Radio';
import { expectToken, expectFocusRing, getResolvedToken } from '../../../__tests__/cssom-harness';

/**
 * Radio — fifth L4-foundation real-component CSSOM canary
 * (PR-10 wave: a11y fix follow-up).
 *
 * Covers the same sr-only-input + visible-proxy pattern as Checkbox,
 * verifying:
 *
 * 1. The checked-state token cascade reaches the proxy span border
 *    (border-action-primary), proving the visual cue follows the
 *    actual selection state through the cascade.
 * 2. The proxy span renders a visible focus ring on keyboard Tab,
 *    proving the PR-10 fix (`peer` on input + `peerFocusVisibleRingClass`
 *    on proxy) actually emits CSS in the browser-provider Tailwind
 *    build, not just adds class names that nothing renders.
 *
 * Production behavior IS changed by this PR (PR-10 added the focus-ring
 * cascade); this canary locks the new contract so a future regression
 * (token rename, helper rewrite, layout change) breaks the gate.
 */

describe('Radio CSSOM canary', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-mode');
  });

  it('checked state proxy resolves --action-primary border', async () => {
    // Radio is controlled-only for visual state — `checked` prop drives
    // the proxy class; `defaultChecked` only sets the DOM input but
    // doesn't update the React-managed proxy ternary. Use `checked`.
    const screen = await render(<Radio name="grp" label="Option" checked onChange={() => {}} />);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const input = screen.getByRole('radio', { name: 'Option' }).element() as HTMLElement;

    const parent = input.parentElement as HTMLElement;
    const proxy = parent.querySelector('span[aria-hidden]') as HTMLElement | null;
    expect(proxy).not.toBeNull();

    expectToken(proxy as HTMLElement, 'borderTopColor', 'action-primary');
  });

  it('renders a focus ring on proxy span when input gets :focus-visible (Tab)', async () => {
    // PR-10: same fix as Checkbox — input has `peer sr-only` and the
    // proxy carries `peerFocusVisibleRingClass("ring")`. Lock the
    // visible-ring contract for the sr-only-input + proxy pattern.
    const screen = await render(<Radio name="g2" label="Confirm" />);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const input = screen.getByRole('radio', { name: 'Confirm' }).element() as HTMLElement;

    await userEvent.keyboard('{Tab}');

    await new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        if (input.matches(':focus-visible')) return resolve();
        if (Date.now() - start > 2000)
          return reject(new Error('Radio input never received :focus-visible after Tab'));
        setTimeout(tick, 16);
      };
      tick();
    });

    const parent = input.parentElement as HTMLElement;
    const proxy = parent.querySelector('span[aria-hidden]') as HTMLElement | null;
    expect(proxy).not.toBeNull();

    expectFocusRing(proxy as HTMLElement);
  });

  it('underlying token --action-primary resolves at root (sanity floor)', () => {
    // Floor check: if this fails, every assertion above is meaningless
    // — the token is missing from the cascade entirely.
    const token = getResolvedToken('action-primary');
    expect(token).not.toBe('');
  });
});
