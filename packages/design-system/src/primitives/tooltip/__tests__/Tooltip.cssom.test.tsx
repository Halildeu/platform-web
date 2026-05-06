import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';
import { Tooltip } from '../Tooltip';
import { expectToken, withTheme, getResolvedToken } from '../../../__tests__/cssom-harness';

/**
 * Tooltip — ninth L4-foundation real-component CSSOM canary.
 *
 * Tooltip uses a text-token-backed popup surface — the popup sits
 * on `bg-text-primary` (the text token doubles as a surface) with
 * `text-text-inverse` for the foreground. This is a deliberate
 * design choice and unique to Tooltip in the primitive set, so
 * locking it at the canary layer matters: any future "let's give
 * Tooltip its own surface token" refactor will surface here as a
 * deliberate token swap, not a silent regression.
 *
 * Plus: the popup only renders when `visible` (mouse hover or focus
 * triggers it). Tests use real `userEvent.hover` to flip the state
 * machine through the same `setTimeout` path production uses.
 *
 * Production source: `Tooltip.tsx` applies
 * `bg-text-primary text-text-inverse` to the popup. Both tokens
 * have light/dark mode values, so the cascade flips on theme switch
 * (asserted in the third test).
 */

describe('Tooltip CSSOM canary', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-mode');
  });

  // Tooltip popup carries `data-component="tooltip"` from stateAttrs.
  // It only exists in the DOM while visible.
  const findPopup = () => {
    return document.querySelector('[data-component="tooltip"]') as HTMLElement | null;
  };

  // Show the tooltip via the same hover path users trigger. Tooltip's
  // openDelay is 200ms by default; we wait one tick past that.
  const showTooltip = async (trigger: HTMLElement) => {
    await userEvent.hover(trigger);
    await new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        if (findPopup()) return resolve();
        if (Date.now() - start > 1000) {
          return reject(new Error('Tooltip popup never rendered after hover'));
        }
        setTimeout(tick, 16);
      };
      tick();
    });
  };

  it('visible popup resolves --text-primary background + --text-inverse text', async () => {
    const screen = await render(
      <Tooltip content="Hello tooltip" openDelay={0}>
        <button>Hover me</button>
      </Tooltip>,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const trigger = screen.getByRole('button', { name: 'Hover me' }).element() as HTMLElement;

    await showTooltip(trigger);
    const popup = findPopup();
    expect(popup).not.toBeNull();

    expectToken(popup as HTMLElement, 'backgroundColor', 'text-primary');
    expectToken(popup as HTMLElement, 'color', 'text-inverse');
  });

  it('popup data-state=open while visible', async () => {
    const screen = await render(
      <Tooltip content="State check" openDelay={0}>
        <button>Trigger</button>
      </Tooltip>,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const trigger = screen.getByRole('button', { name: 'Trigger' }).element() as HTMLElement;

    await showTooltip(trigger);
    const popup = findPopup();
    expect(popup).not.toBeNull();

    expect(popup?.getAttribute('data-state')).toBe('open');
  });

  it('popup --text-primary surface flips on theme switch (light → dark)', async () => {
    const screen = await render(
      <Tooltip content="Theme flip" openDelay={0}>
        <button>Trigger</button>
      </Tooltip>,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const trigger = screen.getByRole('button', { name: 'Trigger' }).element() as HTMLElement;
    await showTooltip(trigger);
    const popup = findPopup();
    expect(popup).not.toBeNull();

    // text-primary is the popup's surface token. Light value differs
    // from dark; locking the flip at this primitive proves the
    // inverted-color cascade survives dark mode.
    const lightPrimary = getResolvedToken('text-primary');
    expect(lightPrimary).not.toBe('');
    expectToken(popup as HTMLElement, 'backgroundColor', 'text-primary');

    await withTheme('dark', async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const darkPrimary = getResolvedToken('text-primary');
      expect(darkPrimary).not.toBe('');
      expect(darkPrimary).not.toBe(lightPrimary);
      expectToken(popup as HTMLElement, 'backgroundColor', 'text-primary');
    });
  });
});
