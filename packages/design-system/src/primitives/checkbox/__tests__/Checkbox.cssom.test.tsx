import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { Checkbox } from '../Checkbox';
import { expectToken, withTheme, getResolvedToken } from '../../../__tests__/cssom-harness';

/**
 * Checkbox — third L4-foundation real-component CSSOM canary
 * (PR-8 wave 2).
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
 * Production behavior is NOT changed by this PR; the Checkbox source
 * and tokens are untouched.
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

  // NOTE — focus-ring CSSOM test for Checkbox is intentionally NOT
  // included in this canary. The Checkbox source uses an sr-only
  // <input> + visible proxy <span>, but the proxy has no
  // `peer-focus-visible:` (or `focus-within:`) ring rule, so the
  // visible focus indicator is missing in production. Adding a test
  // that asserts a non-existent ring would be a false-positive lie;
  // adding a test that asserts the input outline (which is sr-only
  // and invisible) tests nothing the user can see. The correct fix
  // is in production code (separate PR): add a focus-within or
  // peer-focus-visible ring rule on the proxy. After that lands,
  // this canary should grow a focus-ring test.
});
