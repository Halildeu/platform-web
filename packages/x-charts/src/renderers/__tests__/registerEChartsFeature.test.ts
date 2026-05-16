/**
 * Lazy ECharts feature registration unit tests — PR-X16a.
 *
 * Tests the contract — idempotency, single-flight promise de-dup, the
 * test-only seams — without exercising real ECharts: the direct
 * `echarts/lib/chart/tree` side-effect module is stubbed so the suite
 * stays in the jsdom-less runtime and never pulls real ECharts chart
 * code (cf. `registerEChartsGL.test.ts` which stubs `echarts-gl`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureEChartsFeatureRegistered,
  isEChartsFeatureRegistered,
  markEChartsFeatureRegisteredForTest,
  resetEChartsFeatureRegistration,
} from '../registerEChartsFeature';

// Stub the direct `echarts/lib/chart/tree` side-effect module so the
// dynamic import resolves instantly without loading real ECharts.
vi.mock('echarts/lib/chart/tree', () => ({}));

beforeEach(() => {
  resetEChartsFeatureRegistration();
});
afterEach(() => {
  resetEChartsFeatureRegistration();
});

describe('ensureEChartsFeatureRegistered', () => {
  it('starts unregistered', () => {
    expect(isEChartsFeatureRegistered('tree')).toBe(false);
  });

  it('marks the feature registered after the dynamic import resolves', async () => {
    await ensureEChartsFeatureRegistered('tree');
    expect(isEChartsFeatureRegistered('tree')).toBe(true);
  });

  it('shares one in-flight promise across concurrent callers (single-flight)', async () => {
    const a = ensureEChartsFeatureRegistered('tree');
    const b = ensureEChartsFeatureRegistered('tree');
    // The second caller gets the SAME pending promise, not a fresh import.
    expect(a).toBe(b);
    await Promise.all([a, b]);
    expect(isEChartsFeatureRegistered('tree')).toBe(true);
  });

  it('is idempotent — a call after registration resolves immediately', async () => {
    await ensureEChartsFeatureRegistered('tree');
    await ensureEChartsFeatureRegistered('tree');
    await ensureEChartsFeatureRegistered('tree');
    expect(isEChartsFeatureRegistered('tree')).toBe(true);
  });
});

describe('markEChartsFeatureRegisteredForTest', () => {
  it('marks a feature registered without triggering the dynamic import', () => {
    expect(isEChartsFeatureRegistered('tree')).toBe(false);
    markEChartsFeatureRegisteredForTest('tree');
    expect(isEChartsFeatureRegistered('tree')).toBe(true);
  });
});

describe('resetEChartsFeatureRegistration', () => {
  it('clears a single named feature', async () => {
    await ensureEChartsFeatureRegistered('tree');
    expect(isEChartsFeatureRegistered('tree')).toBe(true);
    resetEChartsFeatureRegistration('tree');
    expect(isEChartsFeatureRegistered('tree')).toBe(false);
  });

  it('clears every feature when called with no argument', async () => {
    await ensureEChartsFeatureRegistered('tree');
    resetEChartsFeatureRegistration();
    expect(isEChartsFeatureRegistered('tree')).toBe(false);
  });
});
