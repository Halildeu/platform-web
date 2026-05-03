/**
 * buildResponsiveLegend — unit tests
 *
 * Locks the contract for collision-aware legend placement:
 *   - mobile + many series → vertical right scroll
 *   - mobile + few series  → horizontal bottom scroll (smaller)
 *   - desktop + many series → horizontal bottom scroll
 *   - desktop + few series → horizontal bottom plain
 */

import { describe, it, expect } from 'vitest';
import {
  buildResponsiveLegend,
  LEGEND_VERTICAL_SCROLL_THRESHOLD,
  LEGEND_HORIZONTAL_SCROLL_THRESHOLD,
} from '../buildResponsiveLegend';

describe('buildResponsiveLegend', () => {
  it('flips to vertical right scroll on mobile when series count exceeds threshold', () => {
    const r = buildResponsiveLegend({
      breakpoint: 'mobile',
      showLegend: true,
      hasMultiSeries: true,
      seriesCount: LEGEND_VERTICAL_SCROLL_THRESHOLD + 1,
    });
    expect(r.orient).toBe('vertical');
    expect(r.type).toBe('scroll');
    expect(r.right).toBe(0);
    expect(r.top).toBe('middle');
  });

  it('keeps horizontal bottom on mobile when series count is small but still uses scroll', () => {
    const r = buildResponsiveLegend({
      breakpoint: 'mobile',
      showLegend: true,
      hasMultiSeries: false,
      seriesCount: 3,
    });
    expect(r.orient).toBe('horizontal');
    expect(r.type).toBe('scroll');
    expect(r.bottom).toBe(0);
  });

  it('uses plain horizontal legend on desktop when series fit', () => {
    const r = buildResponsiveLegend({
      breakpoint: 'desktop',
      showLegend: true,
      hasMultiSeries: false,
      seriesCount: 3,
    });
    expect(r.orient).toBe('horizontal');
    expect(r.type).toBe('plain');
    expect(r.bottom).toBe(0);
  });

  it('switches desktop to scroll-typed when series exceed horizontal threshold', () => {
    const r = buildResponsiveLegend({
      breakpoint: 'desktop',
      showLegend: true,
      hasMultiSeries: true,
      seriesCount: LEGEND_HORIZONTAL_SCROLL_THRESHOLD + 1,
    });
    expect(r.type).toBe('scroll');
    expect(r.orient).toBe('horizontal');
  });

  it('hides the legend when neither showLegend nor hasMultiSeries are set', () => {
    const r = buildResponsiveLegend({
      breakpoint: 'desktop',
      showLegend: false,
      hasMultiSeries: false,
      seriesCount: 1,
    });
    expect(r.show).toBe(false);
  });

  it('shows the legend automatically when there are multiple series', () => {
    const r = buildResponsiveLegend({
      breakpoint: 'desktop',
      showLegend: false,
      hasMultiSeries: true,
      seriesCount: 3,
    });
    expect(r.show).toBe(true);
  });

  it('attaches a truncate formatter only when truncateAt is provided', () => {
    const without = buildResponsiveLegend({
      breakpoint: 'desktop',
      showLegend: true,
      hasMultiSeries: false,
      seriesCount: 1,
    });
    expect(without.formatter).toBeUndefined();

    const withTruncate = buildResponsiveLegend({
      breakpoint: 'desktop',
      showLegend: true,
      hasMultiSeries: false,
      seriesCount: 1,
      truncateAt: 6,
    });
    expect(withTruncate.formatter!('Yıllık ortalama')).toBe('Yıllı…');
  });

  it('respects density multipliers on item width/height/fontSize', () => {
    const compact = buildResponsiveLegend({
      breakpoint: 'desktop',
      showLegend: true,
      hasMultiSeries: false,
      seriesCount: 1,
      densitySpacingMultiplier: 0.75,
      densityFontMultiplier: 0.85,
    });
    const standard = buildResponsiveLegend({
      breakpoint: 'desktop',
      showLegend: true,
      hasMultiSeries: false,
      seriesCount: 1,
    });
    expect(compact.itemWidth).toBeLessThan(standard.itemWidth);
    expect(compact.textStyle.fontSize).toBeLessThan(standard.textStyle.fontSize);
  });
});
