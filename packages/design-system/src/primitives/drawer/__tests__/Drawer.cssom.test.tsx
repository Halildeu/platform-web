import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { Drawer } from '../Drawer';
import { expectToken, withTheme, getResolvedToken } from '../../../__tests__/cssom-harness';

/**
 * Drawer — eighth L4-foundation real-component CSSOM canary.
 *
 * Drawer is a slide-in side panel with a separate backdrop overlay
 * div. The cascade we lock:
 *
 * - Panel: `bg-surface-default` (Tailwind utility)
 * - Backdrop: `bg-surface-overlay/40` (Tailwind opacity modifier
 *   resolves to `color-mix(in oklab, var(--surface-overlay-bg) 40%, transparent)`)
 *
 * Using the reference-element comparison pattern (PR-8 Codex
 * iter-2 strengthening) for the backdrop assertion, since opacity
 * modifiers create a `color-mix()` value that differs byte-for-byte
 * from the raw token.
 *
 * Focus-trap (K4 lessons from `useFocusTrap`) is NOT exercised here
 * — autoFocus settles in ~50ms but cssom tests don't dispatch
 * keyboard events, so the focus-trap race that bit drawer
 * interaction tests (Codex 019df8a4 iter-3 K4) doesn't apply to
 * static token reads.
 */

describe('Drawer CSSOM canary', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-mode');
  });

  // Drawer renders via React portal into document.body, NOT into the
  // vitest-browser-react container. Query from document directly.
  const findDrawer = () => {
    const container = document.querySelector('[data-component="drawer"]') as HTMLElement | null;
    if (!container) throw new Error('Drawer container not found');
    const panel = container.querySelector('[role="dialog"]') as HTMLElement | null;
    if (!panel) throw new Error('Drawer panel not found via role=dialog');
    const overlay = container.querySelector('[data-testid="drawer-overlay"]') as HTMLElement | null;
    return { container, panel, overlay };
  };

  it('open panel resolves --surface-default background', async () => {
    await render(
      <Drawer open onClose={() => {}} placement="right" title="Filter">
        <div>Body</div>
      </Drawer>,
    );
    // useFocusTrap autoFocus settles ~50ms; flush microtasks first.
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const { panel } = findDrawer();

    expectToken(panel, 'backgroundColor', 'surface-default');
  });

  it('backdrop overlay resolves --surface-overlay/40 (color-mix)', async () => {
    await render(
      <Drawer open onClose={() => {}} placement="right">
        <div>Body</div>
      </Drawer>,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const { overlay } = findDrawer();
    expect(overlay).not.toBeNull();

    // Tailwind's `bg-surface-overlay/40` resolves to:
    //   color-mix(in oklab, var(--surface-overlay-bg) 40%, transparent)
    // Stamp the same expression on a reference element and compare
    // Chromium's normalized output (PR-8 Codex iter-2 pattern). If
    // the variant accidentally drops to a different token, the
    // reference value differs and the test fails.
    const ref = document.createElement('div');
    ref.style.backgroundColor = 'color-mix(in oklab, var(--surface-overlay-bg) 40%, transparent)';
    document.body.appendChild(ref);

    try {
      const got = window
        .getComputedStyle(overlay as HTMLElement)
        .backgroundColor.replace(/\s+/g, '')
        .toLowerCase();
      const want = window.getComputedStyle(ref).backgroundColor.replace(/\s+/g, '').toLowerCase();
      expect(want).not.toBe('');
      expect(got).toBe(want);
    } finally {
      ref.remove();
    }

    // Sanity floor: --surface-overlay-bg resolves at root.
    const overlayToken = getResolvedToken('surface-overlay-bg');
    expect(overlayToken).not.toBe('');
  });

  it('container carries data-state="open" + data-component="drawer"', async () => {
    await render(
      <Drawer open onClose={() => {}} placement="right">
        <div>Body</div>
      </Drawer>,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const { container } = findDrawer();

    expect(container.getAttribute('data-state')).toBe('open');
    expect(container.getAttribute('data-component')).toBe('drawer');
  });

  /**
   * platform-web#992 — %400 yakınlaştırma (320×256 CSS px). Canlı TEST gözleminde sabit başlık
   * kısa ekranın yarısını tutuyor, gövde küçük bir pencereden kayıyordu; uzun başlık da
   * `truncate` ile kesiliyordu (WCAG 1.4.10 bilgi kaybı).
   */
  describe('reflow at 400% zoom (#992)', () => {
    const LONG_TITLE =
      'Aday bilgileri ve insan kararı: uzun bir çekmece başlığı kesilmeden okunmalı';

    const withViewport = async (width: number, height: number, run: () => Promise<void>) => {
      const previous = { width: window.innerWidth, height: window.innerHeight };
      await page.viewport(width, height);
      try {
        await run();
      } finally {
        await page.viewport(previous.width, previous.height);
      }
    };

    const renderLongDrawer = async () => {
      await render(
        <Drawer open onClose={() => {}} placement="right" title={LONG_TITLE} description="Açıklama">
          <div style={{ height: 1200 }}>Gövde</div>
        </Drawer>,
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 60));
      const { panel } = findDrawer();
      const header = panel.firstElementChild as HTMLElement;
      const body = header.nextElementSibling as HTMLElement;
      const heading = panel.querySelector('h2') as HTMLElement;
      return { panel, header, body, heading };
    };

    it('scrolls the whole panel on a short screen so the header moves with the content', async () => {
      await withViewport(320, 256, async () => {
        const { panel, header, body, heading } = await renderLongDrawer();

        // Başlık kesilmez: satır kaydırılır, taşma yok.
        expect(getComputedStyle(heading).textOverflow).not.toBe('ellipsis');
        expect(getComputedStyle(heading).whiteSpace).not.toBe('nowrap');
        expect(heading.scrollWidth).toBeLessThanOrEqual(heading.clientWidth + 1);

        // Kısa ekranda panelin tamamı kayar; gövde kendi küçük penceresinde kaymaz.
        expect(getComputedStyle(panel).overflowY).toBe('auto');
        expect(getComputedStyle(body).overflowY).toBe('visible');
        expect(panel.scrollHeight).toBeGreaterThan(panel.clientHeight);

        // Kapat düğmesi en üstte erişilebilir.
        const close = panel.querySelector('button') as HTMLElement;
        const panelTop = panel.getBoundingClientRect().top;
        expect(close.getBoundingClientRect().top).toBeGreaterThanOrEqual(panelTop);

        // Başlık sabit değil: kaydırınca içerikle birlikte yukarı çıkar ve gövdeye yer açar.
        panel.scrollTop = panel.scrollHeight;
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        expect(header.getBoundingClientRect().bottom).toBeLessThanOrEqual(panelTop);
      });
    });

    it('keeps the desktop layout: fixed header, body scrolls on its own', async () => {
      await withViewport(1280, 800, async () => {
        const { panel, body } = await renderLongDrawer();

        expect(getComputedStyle(panel).overflowY).not.toBe('auto');
        expect(getComputedStyle(body).overflowY).toBe('auto');
      });
    });
  });

  it('panel --surface-default flips on theme switch (light → dark)', async () => {
    await render(
      <Drawer open onClose={() => {}} placement="right">
        <div>Body</div>
      </Drawer>,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const { panel } = findDrawer();

    const lightSurface = getResolvedToken('surface-default');
    expect(lightSurface).not.toBe('');
    expectToken(panel, 'backgroundColor', 'surface-default');

    await withTheme('dark', async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const darkSurface = getResolvedToken('surface-default');
      expect(darkSurface).not.toBe('');
      expect(darkSurface).not.toBe(lightSurface);
      expectToken(panel, 'backgroundColor', 'surface-default');
    });
  });
});
