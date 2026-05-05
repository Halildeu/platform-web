import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';
import { Checkbox } from '../Checkbox';
import {
  expectToken,
  withTheme,
  expectFocusRing,
  getResolvedToken,
} from '../../../__tests__/cssom-harness';

/**
 * Checkbox — third L4-foundation real-component CSSOM canary.
 *
 * Verifies harness behavior on a primitive that uses a *visually
 * proxied* input pattern: the actual <input type="checkbox"> is
 * `sr-only` and a sibling <span> renders the visible box. The token
 * cascade (border-action-primary / bg-action-primary on checked) is
 * thus on the proxy span, not on the input element. This is the
 * common "custom checkbox" pattern; locking it at the CSSOM layer
 * matters because token rename here would silently drop the visual
 * affordance even though the input still works.
 *
 * History:
 * - PR-8 (Codex 019df9f5) — added the checked-state and theme-switch
 *   tests. Dropped a focus-ring test because production had no
 *   visible focus indicator on the proxy.
 * - PR-10 (Codex 019dfa25) — fixed the production a11y gap (`peer`
 *   on input + peer-focus-visible ring on proxy) and restored the
 *   focus-ring test. The third assertion below now locks the
 *   keyboard-focus visible cascade.
 */

describe('Checkbox CSSOM canary', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-mode');
  });

  it('checked state proxy resolves --action-primary border + background', async () => {
    const screen = await render(<Checkbox label="Subscribe" defaultChecked />);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const input = screen.getByRole('checkbox', { name: 'Subscribe' }).element() as HTMLElement;

    // The actual <input> is sr-only; the visible box is the next
    // sibling <span> inside the relative wrapper. Find it via the
    // shared parent.
    const parent = input.parentElement as HTMLElement;
    const proxy = parent.querySelector('span[aria-hidden]') as HTMLElement | null;
    expect(proxy).not.toBeNull();

    // Checked state: border-action-primary + bg-action-primary.
    expectToken(proxy as HTMLElement, 'borderTopColor', 'action-primary');
    expectToken(proxy as HTMLElement, 'backgroundColor', 'action-primary');
  });

  it('label text resolves --text-primary in light, flips in withTheme(dark)', async () => {
    const screen = await render(<Checkbox label="Newsletter" />);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const input = screen.getByRole('checkbox', { name: 'Newsletter' }).element() as HTMLElement;

    // The label <span> owns the `text-text-primary` class. Walk up to
    // the container <label> then down to the label span.
    let container: HTMLElement | null = input;
    while (container && container.tagName !== 'LABEL') {
      container = container.parentElement;
    }
    expect(container).not.toBeNull();
    const labelSpan = (container as HTMLElement).querySelector(
      'span.font-medium',
    ) as HTMLElement | null;
    expect(labelSpan).not.toBeNull();

    const lightTextPrimary = getResolvedToken('text-primary');
    expect(lightTextPrimary).not.toBe('');
    expectToken(labelSpan as HTMLElement, 'color', 'text-primary');

    await withTheme('dark', async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const darkTextPrimary = getResolvedToken('text-primary');
      expect(darkTextPrimary).not.toBe('');
      expect(darkTextPrimary).not.toBe(lightTextPrimary);
      expectToken(labelSpan as HTMLElement, 'color', 'text-primary');
    });
  });

  it('renders a focus ring on proxy span when input gets :focus-visible (Tab)', async () => {
    // PR-10: restored after the production a11y fix landed (Checkbox
    // source now has `peer` on the sr-only input and
    // `peerFocusVisibleRingClass("ring")` on the proxy span).
    const screen = await render(<Checkbox label="Confirm" />);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const input = screen.getByRole('checkbox', { name: 'Confirm' }).element() as HTMLElement;

    // Real keyboard Tab. Programmatic .focus() is unreliable for
    // :focus-visible in Chromium (Codex thread 019df8a4 iter-3 K4).
    await userEvent.keyboard('{Tab}');

    // Wait for :focus-visible to settle on the (sr-only) input.
    await new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        if (input.matches(':focus-visible')) return resolve();
        if (Date.now() - start > 2000)
          return reject(new Error('Checkbox input never received :focus-visible after Tab'));
        setTimeout(tick, 16);
      };
      tick();
    });

    // The visible ring is on the proxy <span> via Tailwind's
    // `peer-focus-visible:` cascade. Find it via the shared parent.
    const parent = input.parentElement as HTMLElement;
    const proxy = parent.querySelector('span[aria-hidden]') as HTMLElement | null;
    expect(proxy).not.toBeNull();

    expectFocusRing(proxy as HTMLElement);
  });
});
