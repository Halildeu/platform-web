import React from 'react';
import { describe, it, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';
import { Button } from '../Button';
import { expectFocusRing } from '../../../__tests__/cssom-harness';

/**
 * Button danger variant — PR-15 follow-up canary.
 *
 * PR-15 converts `focusRingClassWithColor` from template-literal class
 * generation to a token-keyed literal lookup table. Without this, the
 * Tailwind content scanner couldn't detect the dynamically-built classes
 * and the ring would be invisible. This test proves the conversion
 * works for the only existing call site (Button danger variant).
 *
 * If `state-error-text` is removed from `COLOR_OVERRIDE_RING_CLASSES`,
 * Button danger variant falls back to the default focus ring (still
 * visible, just not red) — graceful degradation, not invisible.
 */

describe('Button danger variant focus ring', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-mode');
  });

  it('danger variant renders a visible focus ring on Tab (color-override registered)', async () => {
    const screen = await render(<Button variant="danger">Delete</Button>);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const button = screen.getByRole('button', { name: 'Delete' }).element() as HTMLElement;

    await userEvent.keyboard('{Tab}');

    await new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        if (button.matches(':focus-visible')) return resolve();
        if (Date.now() - start > 2000)
          return reject(new Error('Button never received :focus-visible after Tab'));
        setTimeout(tick, 16);
      };
      tick();
    });

    // expectFocusRing accepts non-empty box-shadow OR outline. Pre-PR-15,
    // the danger ring rule wouldn't compile and box-shadow stayed empty
    // (invisible ring on the most-error-prone button variant — bad UX).
    // Post-PR-15, the registered literal class compiles and the ring
    // appears.
    expectFocusRing(button);
  });
});
