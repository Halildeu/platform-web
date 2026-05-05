import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';
import { Input } from '../Input';
import {
  expectToken,
  withTheme,
  expectFocusRing,
  getResolvedToken,
} from '../../../__tests__/cssom-harness';

/**
 * Input — second L4-foundation real-component CSSOM canary (PR-8 wave 1
 * after Button.cssom.test.tsx in PR-5).
 *
 * Verifies the L3 harness API (expectToken, withTheme, expectFocusRing)
 * works against another production primitive that has a richer cascade
 * than Button: a wrapper `FieldControlShell` + framed input slot with
 * focus-within ring and tone-driven (default/invalid/disabled) tokens.
 *
 * Production behavior is NOT changed by this PR; the Input source and
 * tokens are untouched.
 */

describe('Input CSSOM canary', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-mode');
  });

  it('default-tone input resolves --text-primary text color', async () => {
    const screen = await render(<Input aria-label="Email" />);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const input = screen.getByRole('textbox', { name: 'Email' }).element() as HTMLElement;

    // The text color is the actual contract: tokens applied via
    // FieldControlShell + getFieldFrameClass, regardless of which DOM
    // node is the role-mapped one.
    expectToken(input, 'color', 'text-primary');
  });

  it('invalid (error) variant resolves border to --state-danger-text/90 (color-mix)', async () => {
    const screen = await render(
      <Input aria-label="Email" error="Required field" defaultValue="" />,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const input = screen.getByRole('textbox', { name: 'Email' }).element() as HTMLElement;

    // The frame is the parent <div> with data-field-type; that's what
    // wears the border tone classes (`border-state-danger-text/90`).
    // Walk up to find it.
    let frame: HTMLElement | null = input;
    while (frame && frame.getAttribute('data-field-type') !== 'text-input') {
      frame = frame.parentElement;
    }
    expect(frame).not.toBeNull();

    // Tailwind's `border-state-danger-text/90` utility expands to
    // `color-mix(in oklab, var(--state-danger-text) 90%, transparent)`.
    // Chromium normalizes this to a numeric oklch / rgba value that
    // differs byte-for-byte from the raw token, but matches if we stamp
    // the same expression on a reference element and read its computed
    // value (Chromium's normalizer is deterministic for the same input).
    // Codex thread 019df9f5 iter-1: substring/non-empty checks would
    // pass even if the variant accidentally regressed to a different
    // token — reference-element comparison locks the actual cascade.
    const ref = document.createElement('div');
    ref.style.borderTopStyle = 'solid';
    ref.style.borderTopWidth = '1px';
    ref.style.borderTopColor = 'color-mix(in oklab, var(--state-danger-text) 90%, transparent)';
    document.body.appendChild(ref);

    try {
      const got = window
        .getComputedStyle(frame as HTMLElement)
        .borderTopColor.replace(/\s+/g, '')
        .toLowerCase();
      const want = window.getComputedStyle(ref).borderTopColor.replace(/\s+/g, '').toLowerCase();
      expect(want).not.toBe('');
      expect(got).toBe(want);
    } finally {
      ref.remove();
    }

    // Sanity floor: the underlying token resolves at root.
    const dangerToken = getResolvedToken('state-danger-text');
    expect(dangerToken).not.toBe('');
  });

  it('text color flips on theme switch via withTheme(dark)', async () => {
    const screen = await render(<Input aria-label="Username" />);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const input = screen.getByRole('textbox', { name: 'Username' }).element() as HTMLElement;

    const lightTextPrimary = getResolvedToken('text-primary');
    expect(lightTextPrimary).not.toBe('');
    expectToken(input, 'color', 'text-primary');

    await withTheme('dark', async () => {
      // Microtask flush: Tailwind 4 dark variant applies via CSS, not
      // React re-render. Wait one tick for the cascade.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const darkTextPrimary = getResolvedToken('text-primary');
      expect(darkTextPrimary).not.toBe('');
      expect(darkTextPrimary).not.toBe(lightTextPrimary);
      // Same DOM node should now resolve to the dark-mode token without
      // any re-render.
      expectToken(input, 'color', 'text-primary');
    });
  });

  it('renders a focus ring on keyboard focus (Tab) — :focus-within cascade', async () => {
    const screen = await render(<Input aria-label="Search" />);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const input = screen.getByRole('textbox', { name: 'Search' }).element() as HTMLElement;

    // Real keyboard Tab. Programmatic .focus() is unreliable for
    // :focus-visible / :focus-within in Chromium (Codex thread
    // 019df8a4 iter-3 K4).
    await userEvent.keyboard('{Tab}');

    // The focus ring is on the FRAME (parent div with class
    // `focus-within:ring-2 ...`), not on the inner <input>. Walk up
    // until we find the frame that owns the ring rule.
    let frame: HTMLElement | null = input;
    while (frame && frame.getAttribute('data-field-type') !== 'text-input') {
      frame = frame.parentElement;
    }
    expect(frame).not.toBeNull();

    // Wait for :focus-within to settle on the frame.
    await new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        if ((frame as HTMLElement).matches(':focus-within')) return resolve();
        if (Date.now() - start > 2000)
          return reject(new Error('Input frame never received :focus-within after Tab'));
        setTimeout(tick, 16);
      };
      tick();
    });

    expectFocusRing(frame as HTMLElement);
  });
});
