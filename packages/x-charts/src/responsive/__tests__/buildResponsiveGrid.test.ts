/**
 * buildResponsiveGrid — unit tests
 */

import { describe, it, expect } from 'vitest';
import { buildResponsiveGrid } from '../buildResponsiveGrid';

const baseDensity = {
  titleTop: 60,
  contentTop: 24,
  sidePadding: 16,
  legendBottom: 48,
  plainBottom: 24,
};

describe('buildResponsiveGrid', () => {
  it('always sets containLabel: true', () => {
    expect(
      buildResponsiveGrid({
        breakpoint: 'desktop',
        hasTitle: false,
        hasBottomLegend: false,
        density: baseDensity,
      }).containLabel,
    ).toBe(true);
  });

  it('uses titleTop padding when hasTitle is true', () => {
    const grid = buildResponsiveGrid({
      breakpoint: 'desktop',
      hasTitle: true,
      hasBottomLegend: false,
      density: baseDensity,
    });
    expect(grid.top).toBe(60);
  });

  it('uses contentTop padding when hasTitle is false', () => {
    const grid = buildResponsiveGrid({
      breakpoint: 'desktop',
      hasTitle: false,
      hasBottomLegend: false,
      density: baseDensity,
    });
    expect(grid.top).toBe(24);
  });

  it('uses legendBottom padding when hasBottomLegend is true', () => {
    const grid = buildResponsiveGrid({
      breakpoint: 'desktop',
      hasTitle: false,
      hasBottomLegend: true,
      density: baseDensity,
    });
    expect(grid.bottom).toBe(48);
  });

  it('shrinks paddings on mobile breakpoint', () => {
    const desktop = buildResponsiveGrid({
      breakpoint: 'desktop',
      hasTitle: true,
      hasBottomLegend: true,
      density: baseDensity,
    });
    const mobile = buildResponsiveGrid({
      breakpoint: 'mobile',
      hasTitle: true,
      hasBottomLegend: true,
      density: baseDensity,
    });
    expect(mobile.top).toBeLessThan(desktop.top);
    expect(mobile.bottom).toBeLessThan(desktop.bottom);
  });

  it('reserves right-side padding when legend has flipped to vertical', () => {
    const grid = buildResponsiveGrid({
      breakpoint: 'mobile',
      hasTitle: false,
      hasBottomLegend: false,
      hasRightLegend: true,
      density: baseDensity,
    });
    expect(grid.right).toBeGreaterThanOrEqual(72);
  });

  it('floors padding to a sensible minimum (no zero or negative values)', () => {
    const grid = buildResponsiveGrid({
      breakpoint: 'mobile',
      hasTitle: false,
      hasBottomLegend: false,
      density: { titleTop: 0, contentTop: 0, sidePadding: 0, legendBottom: 0, plainBottom: 0 },
    });
    expect(grid.top).toBeGreaterThanOrEqual(16);
    expect(grid.bottom).toBeGreaterThanOrEqual(12);
    expect(grid.left).toBeGreaterThanOrEqual(8);
    expect(grid.right).toBeGreaterThanOrEqual(8);
  });
});
