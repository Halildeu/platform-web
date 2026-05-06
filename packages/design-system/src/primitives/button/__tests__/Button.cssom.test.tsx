import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';
import { Button } from '../Button';
import {
  expectToken,
  withTheme,
  expectFocusRing,
  getResolvedToken,
} from '../../../__tests__/cssom-harness';

/**
 * Button — first L4-foundation real-component CSSOM canary (PR-5,
 * Codex thread 019df990 iter-1).
 *
 * Verifies that the L3 harness API (expectToken, withTheme,
 * expectFocusRing) works against a production primitive — not a
 * stamped reference div like the PR-1 sentinel. If a token rename
 * lands without updating Button's class chain, this test surfaces
 * the regression at the resolved-style layer in real Chromium.
 *
 * Production behavior is NOT changed by this PR; the Button source
 * and tokens are untouched.
 */

describe('Button CSSOM canary', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-mode');
  });

  it('primary variant resolves --action-primary background and --text-inverse foreground', async () => {
    const screen = await render(<Button variant="primary">Save</Button>);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const button = screen.getByRole('button', { name: 'Save' }).element() as HTMLElement;

    expectToken(button, 'backgroundColor', 'action-primary');
    expectToken(button, 'color', 'text-inverse');
  });

  it('primary variant hover resolves --accent-primary-hover background', async () => {
    const screen = await render(<Button variant="primary">Save</Button>);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const button = screen.getByRole('button', { name: 'Save' });

    // Real Chromium hover via Playwright locator. userEvent.hover would
    // also work but the locator API is what the rest of this file's
    // primitives use; staying in one paradigm reduces interop noise.
    await button.hover();

    // The hover state must resolve to the production hover token. If a
    // token rename lands (e.g. accent-primary-hover -> action-primary-hover)
    // without updating Button's hover:bg-accent-primary-hover class, this
    // assertion surfaces the regression at the cascade layer.
    expectToken(button.element() as HTMLElement, 'backgroundColor', 'accent-primary-hover');
  });

  it('secondary variant resolves theme-switched tokens via withTheme(dark)', async () => {
    const screen = await render(<Button variant="secondary">Cancel</Button>);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const button = screen.getByRole('button', { name: 'Cancel' }).element() as HTMLElement;

    // Light mode baseline: secondary uses --surface-muted (aliased) +
    // --text-primary (light value oklch(21%)).
    const lightTextPrimary = getResolvedToken('text-primary');
    expect(lightTextPrimary).not.toBe('');
    expectToken(button, 'color', 'text-primary');

    // Dark mode: --text-primary flips to oklch(92%). Same Button
    // element should now resolve to the dark-mode token without any
    // re-render.
    await withTheme('dark', async () => {
      // Microtask flush: Tailwind 4 dark variant is applied via CSS,
      // not React re-render, so the next paint is what we want.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const darkTextPrimary = getResolvedToken('text-primary');
      expect(darkTextPrimary).not.toBe('');
      expect(darkTextPrimary).not.toBe(lightTextPrimary);
      expectToken(button, 'color', 'text-primary');
    });
  });

  it('renders a focus ring on keyboard focus (Tab) — :focus-visible cascade', async () => {
    const screen = await render(<Button variant="primary">Submit</Button>);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const button = screen.getByRole('button', { name: 'Submit' }).element() as HTMLElement;

    // Real keyboard Tab; programmatic .focus() is unreliable for
    // :focus-visible in Chromium (Codex thread 019df8a4 iter-3 K4).
    await userEvent.keyboard('{Tab}');

    // Wait for :focus-visible to settle on the button before reading
    // computed style.
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

    expectFocusRing(button);
  });

  it('renders a focus ring on danger variant — color-override token registered (PR-15)', async () => {
    // PR-15 (Codex thread 019dfaed): focusRingClassWithColor was using
    // template-literal class strings (`focus-visible:ring-[color-mix(...,${color},...)]`)
    // which Tailwind 4 content scanner cannot detect. Button danger
    // variant's red ring was invisible in production. Fix:
    // pre-register the color tokens in COLOR_OVERRIDE_RING_CLASSES
    // (focus-policy.ts).
    //
    // Locking this case in the REQUIRED canary (not advisory glob)
    // means a future regression — adding a new color override without
    // registering it, or removing the registration — fails the merge
    // gate immediately. Pre-PR-15 this assertion would fail
    // (box-shadow empty post-Tab); post-PR-15 it passes.
    const screen = await render(<Button variant="danger">Delete</Button>);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const button = screen.getByRole('button', { name: 'Delete' }).element() as HTMLElement;

    await userEvent.keyboard('{Tab}');

    await new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        if (button.matches(':focus-visible')) return resolve();
        if (Date.now() - start > 2000)
          return reject(new Error('Button danger never received :focus-visible after Tab'));
        setTimeout(tick, 16);
      };
      tick();
    });

    expectFocusRing(button);
  });
});
