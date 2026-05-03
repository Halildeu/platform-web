/**
 * buildResponsiveDataZoom — unit tests
 *
 * Codex REVISE explicit guidance: don't enable dataZoom on every chart.
 * Threshold-driven, breakpoint-aware, axis-aware.
 */

import { describe, it, expect } from 'vitest';
import { buildResponsiveDataZoom } from '../buildResponsiveDataZoom';

describe('buildResponsiveDataZoom', () => {
  it('returns null on desktop regardless of label count', () => {
    expect(buildResponsiveDataZoom({ breakpoint: 'desktop', labelCount: 1000 })).toBeNull();
  });

  it('returns null below threshold on mobile/tablet', () => {
    expect(buildResponsiveDataZoom({ breakpoint: 'tablet', labelCount: 10 })).toBeNull();
    expect(buildResponsiveDataZoom({ breakpoint: 'mobile', labelCount: 25 })).toBeNull();
  });

  it('emits an inside-type dataZoom array above threshold on tablet', () => {
    const dz = buildResponsiveDataZoom({ breakpoint: 'tablet', labelCount: 50 });
    expect(dz).not.toBeNull();
    expect(Array.isArray(dz)).toBe(true);
    expect(dz![0].type).toBe('inside');
    expect(dz![0].zoomLock).toBe(false);
  });

  it('targets xAxis by default', () => {
    const dz = buildResponsiveDataZoom({
      breakpoint: 'mobile',
      labelCount: 100,
    });
    expect(dz![0].xAxisIndex).toBe(0);
    expect(dz![0].yAxisIndex).toBeUndefined();
  });

  it('targets yAxis when horizontal flag is set', () => {
    const dz = buildResponsiveDataZoom({
      breakpoint: 'mobile',
      labelCount: 100,
      horizontal: true,
    });
    expect(dz![0].yAxisIndex).toBe(0);
    expect(dz![0].xAxisIndex).toBeUndefined();
  });

  it('initial window shrinks as label count grows', () => {
    const small = buildResponsiveDataZoom({ breakpoint: 'mobile', labelCount: 40 });
    const large = buildResponsiveDataZoom({ breakpoint: 'mobile', labelCount: 200 });
    expect(small![0].end).toBeGreaterThan(large![0].end);
    expect(large![0].end).toBeGreaterThan(0);
    expect(large![0].end).toBeLessThanOrEqual(50);
  });

  it('respects custom threshold override', () => {
    expect(
      buildResponsiveDataZoom({ breakpoint: 'mobile', labelCount: 15, threshold: 10 }),
    ).not.toBeNull();
    expect(
      buildResponsiveDataZoom({ breakpoint: 'mobile', labelCount: 15, threshold: 20 }),
    ).toBeNull();
  });
});
