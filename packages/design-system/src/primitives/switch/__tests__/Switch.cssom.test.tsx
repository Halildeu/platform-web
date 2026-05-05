import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { Switch } from '../Switch';
import { expectToken, withTheme, getResolvedToken } from '../../../__tests__/cssom-harness';

/**
 * Switch — fourth L4-foundation real-component CSSOM canary
 * (PR-8 wave 3).
 *
 * Verifies the harness on a primitive that sets the token via inline
 * `style={{ backgroundColor: 'var(--action-primary)' }}` rather than
 * a Tailwind utility class. This locks an alternate token-application
 * path: the token rename detector must work whether the cascade goes
 * through a class chain (Button/Input) or through a direct inline
 * `var()` reference (Switch). The thumb uses `bg-surface-default`
 * (utility class) so we cover both paths in the same primitive.
 *
 * Production behavior is NOT changed by this PR; the Switch source and
 * tokens are untouched.
 */

describe('Switch CSSOM canary', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-mode');
  });

  it('checked default-variant track resolves --action-primary background (inline var path)', async () => {
    const screen = await render(<Switch label="Notifications" defaultChecked />);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const input = screen.getByRole('switch', { name: 'Notifications' }).element() as HTMLElement;

    // The track is the sibling span with aria-hidden + relative
    // positioning. The visible state-color comes from inline style
    // `var(--action-primary)`.
    const parent = input.parentElement as HTMLElement;
    const track = parent.querySelector('span[aria-hidden]') as HTMLElement | null;
    expect(track).not.toBeNull();

    expectToken(track as HTMLElement, 'backgroundColor', 'action-primary');
  });

  it('checked destructive-variant track resolves --state-error-text background', async () => {
    const screen = await render(
      <Switch label="Delete on save" variant="destructive" defaultChecked />,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const input = screen.getByRole('switch', { name: 'Delete on save' }).element() as HTMLElement;

    const parent = input.parentElement as HTMLElement;
    const track = parent.querySelector('span[aria-hidden]') as HTMLElement | null;
    expect(track).not.toBeNull();

    expectToken(track as HTMLElement, 'backgroundColor', 'state-error-text');
  });

  it('unchecked track resolves --border-default and thumb resolves --surface-default', async () => {
    const screen = await render(<Switch label="Auto-save" />);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const input = screen.getByRole('switch', { name: 'Auto-save' }).element() as HTMLElement;

    const parent = input.parentElement as HTMLElement;
    const track = parent.querySelector('span[aria-hidden]') as HTMLElement | null;
    expect(track).not.toBeNull();

    // Track unchecked: var(--border-default) (inline)
    expectToken(track as HTMLElement, 'backgroundColor', 'border-default');

    // Thumb is the inner span; uses bg-surface-default utility
    const thumb = (track as HTMLElement).querySelector('span') as HTMLElement | null;
    expect(thumb).not.toBeNull();
    expectToken(thumb as HTMLElement, 'backgroundColor', 'surface-default');
  });

  it('thumb --surface-default flips on theme switch (light → dark)', async () => {
    const screen = await render(<Switch label="Sync" defaultChecked />);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const input = screen.getByRole('switch', { name: 'Sync' }).element() as HTMLElement;

    const parent = input.parentElement as HTMLElement;
    const track = parent.querySelector('span[aria-hidden]') as HTMLElement | null;
    expect(track).not.toBeNull();
    const thumb = (track as HTMLElement).querySelector('span') as HTMLElement | null;
    expect(thumb).not.toBeNull();

    // Surface-default flips between light and dark; track stays on
    // action-primary in both modes (token rename of action-primary
    // would be caught by the first test). We assert thumb here.
    const lightSurface = getResolvedToken('surface-default');
    expect(lightSurface).not.toBe('');
    expectToken(thumb as HTMLElement, 'backgroundColor', 'surface-default');

    await withTheme('dark', async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const darkSurface = getResolvedToken('surface-default');
      expect(darkSurface).not.toBe('');
      expect(darkSurface).not.toBe(lightSurface);
      // Thumb on dark mode resolves to the new --surface-default value
      // without re-render.
      expectToken(thumb as HTMLElement, 'backgroundColor', 'surface-default');
    });
  });

  // NOTE — focus-ring CSSOM test for Switch is intentionally NOT
  // included in this canary. The Switch source applies
  // `focusRingClass("ring")` (which expands to
  // `focus-visible:ring-2 ...`) on the wrapping <label> element,
  // but `focus-visible:` only fires when the LABEL itself is the
  // focused element. In practice the inner sr-only <input> receives
  // focus, not the label, so the visible ring never appears. The
  // correct fix is in production code (separate PR): switch the
  // label's variant from `focus-visible:` to `focus-within:` (or
  // use a `:has(:focus-visible)` rule). After that lands, this
  // canary should grow a focus-ring test.
});
