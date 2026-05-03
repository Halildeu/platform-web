/**
 * buildResponsiveAxisLabel — unit tests
 *
 * Codex 019defa5 plan-time review demanded that the axis label collision
 * heuristics be unit-tested in isolation rather than only inferred via the
 * wrapper option shape. These cases lock the contract.
 */

import { describe, it, expect } from 'vitest';
import {
  buildResponsiveAxisLabel,
  AXIS_LABEL_INTERVAL_THRESHOLD,
  AXIS_LABEL_MOBILE_ROTATE_THRESHOLD,
} from '../buildResponsiveAxisLabel';

describe('buildResponsiveAxisLabel', () => {
  it('always sets hideOverlap to true', () => {
    const result = buildResponsiveAxisLabel({ breakpoint: 'desktop', labelCount: 5 });
    expect(result.hideOverlap).toBe(true);
  });

  it('uses interval=0 when label count is at or below threshold', () => {
    expect(
      buildResponsiveAxisLabel({ breakpoint: 'desktop', labelCount: AXIS_LABEL_INTERVAL_THRESHOLD })
        .interval,
    ).toBe(0);
  });

  it('switches interval to "auto" above threshold (Codex REVISE: not breakpoint-driven)', () => {
    // Codex REVISE point: desktop with 100 categories also needs auto.
    expect(buildResponsiveAxisLabel({ breakpoint: 'desktop', labelCount: 100 }).interval).toBe(
      'auto',
    );
    expect(buildResponsiveAxisLabel({ breakpoint: 'mobile', labelCount: 9 }).interval).toBe('auto');
  });

  it('only rotates labels on mobile and only when label density warrants it', () => {
    // Mobile + few labels → no rotation.
    expect(
      buildResponsiveAxisLabel({
        breakpoint: 'mobile',
        labelCount: AXIS_LABEL_MOBILE_ROTATE_THRESHOLD,
      }).rotate,
    ).toBe(0);
    // Mobile + many labels → 30°.
    expect(
      buildResponsiveAxisLabel({
        breakpoint: 'mobile',
        labelCount: AXIS_LABEL_MOBILE_ROTATE_THRESHOLD + 1,
      }).rotate,
    ).toBe(30);
    // Tablet/desktop: never rotate.
    expect(buildResponsiveAxisLabel({ breakpoint: 'tablet', labelCount: 50 }).rotate).toBe(0);
    expect(buildResponsiveAxisLabel({ breakpoint: 'desktop', labelCount: 100 }).rotate).toBe(0);
  });

  it('shrinks the font on mobile regardless of density multiplier', () => {
    expect(
      buildResponsiveAxisLabel({
        breakpoint: 'mobile',
        labelCount: 5,
        densityFontMultiplier: 1.5,
        baseFontSize: 11,
      }).fontSize,
    ).toBeLessThanOrEqual(11);
  });

  it('respects density multiplier on tablet/desktop', () => {
    const compact = buildResponsiveAxisLabel({
      breakpoint: 'desktop',
      labelCount: 5,
      densityFontMultiplier: 0.85,
      baseFontSize: 11,
    });
    const standard = buildResponsiveAxisLabel({
      breakpoint: 'desktop',
      labelCount: 5,
      densityFontMultiplier: 1,
      baseFontSize: 11,
    });
    expect(compact.fontSize).toBeLessThan(standard.fontSize);
  });

  it('emits a truncate formatter only when truncateAt is provided', () => {
    const without = buildResponsiveAxisLabel({ breakpoint: 'desktop', labelCount: 5 });
    expect(without.formatter).toBeUndefined();

    const withTruncate = buildResponsiveAxisLabel({
      breakpoint: 'desktop',
      labelCount: 5,
      truncateAt: 6,
    });
    expect(withTruncate.formatter).toBeTypeOf('function');
    expect(withTruncate.formatter!('Antalya')).toBe('Antal…');
    expect(withTruncate.formatter!('Van')).toBe('Van');
  });
});
