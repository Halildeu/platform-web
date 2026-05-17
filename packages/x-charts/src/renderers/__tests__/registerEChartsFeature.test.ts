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
  type EChartsFeature,
} from '../registerEChartsFeature';

// Stub the direct `echarts/lib/chart/tree` side-effect module so the
// dynamic import resolves instantly without loading real ECharts.
vi.mock('echarts/lib/chart/tree', () => ({}));
// PR-X16b-prep — stub the niche-chart series + the parallel / calendar
// coordinate-system component modules the same way.
vi.mock('echarts/lib/chart/graph', () => ({}));
vi.mock('echarts/lib/chart/parallel', () => ({}));
vi.mock('echarts/lib/component/parallel', () => ({}));
vi.mock('echarts/lib/chart/pictorialBar', () => ({}));
vi.mock('echarts/lib/chart/candlestick', () => ({}));
vi.mock('echarts/lib/chart/boxplot', () => ({}));
vi.mock('echarts/lib/component/calendar', () => ({}));
// PR-X16c — stub the polar coordinate-system component module.
vi.mock('echarts/lib/component/polar', () => ({}));
// PR-X16d: themeRiver is a TWO-module feature: the `themeRiver` series
// PLUS the `singleAxis` coordinate component. Each mock factory bumps a
// hoisted spy so the dedicated test below can assert BOTH modules were
// dynamic-imported; a plain `() => ({})` stub would let a loader that
// silently dropped the second module still pass.
const { themeRiverSeriesLoaded, singleAxisComponentLoaded } = vi.hoisted(() => ({
  themeRiverSeriesLoaded: vi.fn(),
  singleAxisComponentLoaded: vi.fn(),
}));
vi.mock('echarts/lib/chart/themeRiver', () => {
  themeRiverSeriesLoaded();
  return {};
});
vi.mock('echarts/lib/component/singleAxis', () => {
  singleAxisComponentLoaded();
  return {};
});

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

/* ------------------------------------------------------------------ */
/*  PR-X16b-prep — every lazy feature key has a working loader          */
/* ------------------------------------------------------------------ */

const ALL_FEATURES: EChartsFeature[] = [
  'tree',
  'graph',
  'parallel',
  'pictorialBar',
  'candlestick',
  'boxplot',
  'calendar',
  'polar',
  'themeRiver',
];

describe('every EChartsFeature loader resolves', () => {
  it.each(ALL_FEATURES)('registers `%s` via its FEATURE_LOADERS entry', async (feature) => {
    expect(isEChartsFeatureRegistered(feature)).toBe(false);
    await ensureEChartsFeatureRegistered(feature);
    expect(isEChartsFeatureRegistered(feature)).toBe(true);
  });

  it.each(ALL_FEATURES)('`%s` registration is idempotent + single-flight', async (feature) => {
    const a = ensureEChartsFeatureRegistered(feature);
    const b = ensureEChartsFeatureRegistered(feature);
    // Overlapping callers share ONE in-flight import promise.
    expect(a).toBe(b);
    await Promise.all([a, b]);
    // A post-registration call resolves immediately (no re-import).
    await ensureEChartsFeatureRegistered(feature);
    expect(isEChartsFeatureRegistered(feature)).toBe(true);
  });

  it('`parallel` registers only after BOTH its series + component modules load', async () => {
    // The `parallel` loader awaits a two-module Promise.all
    // (echarts/lib/chart/parallel + echarts/lib/component/parallel). If
    // either stub were missing, the dynamic import would reject and this
    // await would throw — a clean resolve proves both modules ran.
    await expect(ensureEChartsFeatureRegistered('parallel')).resolves.toBeUndefined();
    expect(isEChartsFeatureRegistered('parallel')).toBe(true);
  });

  it('`themeRiver` registers only after BOTH its series + singleAxis modules load', async () => {
    // The `themeRiver` loader awaits a two-module Promise.all
    // (echarts/lib/chart/themeRiver + echarts/lib/component/singleAxis).
    // The mock factories bump hoisted spies, so asserting BOTH ran proves
    // the loader did not silently drop the singleAxis module — which a
    // clean resolve alone would NOT catch.
    await expect(ensureEChartsFeatureRegistered('themeRiver')).resolves.toBeUndefined();
    expect(isEChartsFeatureRegistered('themeRiver')).toBe(true);
    expect(themeRiverSeriesLoaded).toHaveBeenCalled();
    expect(singleAxisComponentLoaded).toHaveBeenCalled();
  });
});
