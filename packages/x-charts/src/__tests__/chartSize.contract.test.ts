/**
 * chartSize contract test
 *
 * Faz 21.9 PR3a (Codex thread `019defa5`): the shared chart-size
 * contract replaces 13 inline `SIZE_HEIGHT` mirrors. This test guards
 * the canonical values + checks that the runtime constant matches the
 * type axis exactly (no extra keys, no missing keys).
 */

import { describe, it, expect } from 'vitest';
import { CHART_CANVAS_HEIGHT, CHART_SIZE_ORDER } from '../chartSize';

describe('CHART_CANVAS_HEIGHT contract', () => {
  it('pins the canonical canvas heights for each ChartSize', () => {
    expect(CHART_CANVAS_HEIGHT.sm).toBe(200);
    expect(CHART_CANVAS_HEIGHT.md).toBe(300);
    expect(CHART_CANVAS_HEIGHT.lg).toBe(400);
  });

  it('contains exactly the three sizes — no drift, no extras', () => {
    expect(Object.keys(CHART_CANVAS_HEIGHT).sort()).toEqual(['lg', 'md', 'sm']);
  });

  it('every entry is a positive integer', () => {
    for (const [key, value] of Object.entries(CHART_CANVAS_HEIGHT)) {
      expect(value, `${key}`).toBeGreaterThan(0);
      expect(Number.isInteger(value), `${key}`).toBe(true);
    }
  });
});

describe('CHART_SIZE_ORDER contract', () => {
  it('walks from smallest to largest', () => {
    expect(CHART_SIZE_ORDER).toEqual(['sm', 'md', 'lg']);
  });

  it('every entry maps to a real CHART_CANVAS_HEIGHT key', () => {
    for (const size of CHART_SIZE_ORDER) {
      expect(CHART_CANVAS_HEIGHT[size]).toBeDefined();
    }
  });

  it('the order is monotonically increasing in canvas height', () => {
    let prev = 0;
    for (const size of CHART_SIZE_ORDER) {
      expect(CHART_CANVAS_HEIGHT[size]).toBeGreaterThan(prev);
      prev = CHART_CANVAS_HEIGHT[size];
    }
  });
});
