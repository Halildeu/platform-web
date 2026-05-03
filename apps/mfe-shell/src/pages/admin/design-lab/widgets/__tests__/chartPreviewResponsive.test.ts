/**
 * ChartPreviewLive responsive helpers — unit tests
 *
 * Faz 21.9 PR2 (Codex thread `019defa5`): locks the breakpoint↔preview-size
 * coupling so a regression that lets the chart canvas grow taller than its
 * PreviewBox container (the screenshot bug where Generated Code / Sample
 * Data text overlapped the bar chart body) gets caught at unit-test time.
 */

import { describe, it, expect } from 'vitest';
import { clampChartSize, responsiveHeight } from '../ChartPreviewLive';

describe('clampChartSize', () => {
  it('caps at "sm" on mobile regardless of user choice', () => {
    expect(clampChartSize('sm', 'mobile')).toBe('sm');
    expect(clampChartSize('md', 'mobile')).toBe('sm');
    expect(clampChartSize('lg', 'mobile')).toBe('sm');
  });

  it('caps at "md" on tablet', () => {
    expect(clampChartSize('sm', 'tablet')).toBe('sm');
    expect(clampChartSize('md', 'tablet')).toBe('md');
    expect(clampChartSize('lg', 'tablet')).toBe('md');
  });

  it('honours the user choice on desktop', () => {
    expect(clampChartSize('sm', 'desktop')).toBe('sm');
    expect(clampChartSize('md', 'desktop')).toBe('md');
    expect(clampChartSize('lg', 'desktop')).toBe('lg');
  });

  it('never returns a size larger than the user picked (no upgrade)', () => {
    // The function only ever clamps DOWN; it must never up-rate a user
    // who explicitly chose "sm" on a desktop viewport.
    expect(clampChartSize('sm', 'desktop')).toBe('sm');
    expect(clampChartSize('sm', 'tablet')).toBe('sm');
  });
});

describe('responsiveHeight', () => {
  it('returns 220 for "sm" canvas (200 + 20 padding)', () => {
    expect(responsiveHeight('sm')).toBe(220);
  });

  it('returns 320 for "md" canvas (300 + 20)', () => {
    expect(responsiveHeight('md')).toBe(320);
  });

  it('returns 420 for "lg" canvas (400 + 20)', () => {
    expect(responsiveHeight('lg')).toBe(420);
  });

  it('honours an explicit floor when greater than the chart-derived height', () => {
    // sm chart needs 220px; caller wants at least 280 → 280 wins.
    expect(responsiveHeight('sm', 280)).toBe(280);
  });

  it('ignores the floor when the chart-derived height is already taller', () => {
    expect(responsiveHeight('lg', 360)).toBe(420);
  });

  it('Codex 019defa5 PARTIAL fix: no implicit floor — mobile shrink wins by default', () => {
    // Two regressions used to silently re-introduce a 360 floor:
    //   1. ChartDetail.tsx passing height={360} to <ChartPreviewLive />
    //   2. ChartPreviewLive defaulting `height = 360`
    // Both are gone in PR2 iter-3. The helper itself defaults floor=0,
    // and explicit floors are still honoured for theme-only previews.
    expect(responsiveHeight('sm')).toBe(220); // no floor → chart envelope wins
    expect(responsiveHeight('sm', 360)).toBe(360); // explicit floor wins (intentional)
  });
});

/* ------------------------------------------------------------------ */
/*  Integration invariant                                              */
/* ------------------------------------------------------------------ */

describe('clampChartSize + responsiveHeight invariant', () => {
  /**
   * The chart wrapper's SIZE_HEIGHT mapping is { sm: 200, md: 300, lg: 400 }.
   * After clampChartSize + responsiveHeight, the chart canvas must always
   * fit inside the PreviewBox with at least 20px of breathing room —
   * otherwise we reproduce the original screenshot bug (chart body
   * bleeding into the Generated Code section underneath).
   */
  const SIZE_HEIGHT = { sm: 200, md: 300, lg: 400 } as const;
  const MIN_BREATHING_ROOM = 20;

  for (const userSize of ['sm', 'md', 'lg'] as const) {
    for (const bp of ['mobile', 'tablet', 'desktop'] as const) {
      it(`${userSize} on ${bp}: chart canvas fits inside PreviewBox`, () => {
        const clampedSize = clampChartSize(userSize, bp);
        const previewHeight = responsiveHeight(clampedSize);
        expect(previewHeight).toBeGreaterThanOrEqual(SIZE_HEIGHT[clampedSize] + MIN_BREATHING_ROOM);
      });
    }
  }
});
