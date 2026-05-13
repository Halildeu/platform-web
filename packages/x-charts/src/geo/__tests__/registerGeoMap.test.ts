// @vitest-environment jsdom
/**
 * registerGeoMap — unit invariants (PR-X12c, Codex thread 019e2254
 * iter-1 AGREE).
 *
 * Covers:
 *   1. `isGeoMapRegistered` returns false for unknown names.
 *   2. `ensureGeoMapRegistered` calls the loader once and registers
 *      the resolved GeoJSON on the ECharts global.
 *   3. Repeated calls for the same name with a fresh loader do NOT
 *      re-invoke the loader (idempotency + cache).
 *   4. Concurrent calls in parallel return the same in-flight promise
 *      (de-duplication; only one loader invocation).
 *   5. Loader rejection clears the cache so a later retry can succeed.
 *   6. Non-FeatureCollection payloads surface a clear error and do
 *      NOT register the map.
 */
import { resetEChartsMock } from '../../__tests__/fixtures/echarts-mock';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  ensureGeoMapRegistered,
  isGeoMapRegistered,
  __resetGeoMapRegistrationCacheForTests,
} from '../registerGeoMap';
import { echarts } from '../../renderers/echarts-imports';

const sampleGeoJson = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      properties: { name: 'TestRegion' },
      geometry: { type: 'Polygon', coordinates: [] },
    },
  ],
};

beforeEach(() => {
  resetEChartsMock();
  __resetGeoMapRegistrationCacheForTests();
  // Direct registry reset — `resetEChartsMock` can't reach into the
  // vi.mock factory's closure across the require/import boundary in
  // every environment. Call the explicit hook the mock exposes.
  const e = echarts as unknown as { __resetRegisteredMaps?: () => void };
  if (typeof e.__resetRegisteredMaps === 'function') e.__resetRegisteredMaps();
});

describe('registerGeoMap — invariants', () => {
  it('isGeoMapRegistered returns false for unknown map name', () => {
    expect(isGeoMapRegistered('UnknownMap')).toBe(false);
  });

  it('ensureGeoMapRegistered calls loader once + registers on echarts global', async () => {
    const loader = vi.fn(() => sampleGeoJson);
    await ensureGeoMapRegistered('TR', loader);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(isGeoMapRegistered('TR')).toBe(true);
    expect(
      (echarts as unknown as { registerMap: ReturnType<typeof vi.fn> }).registerMap,
    ).toHaveBeenCalledWith('TR', sampleGeoJson);
  });

  it('repeated call for already-registered map does NOT re-invoke loader (idempotent)', async () => {
    const loader1 = vi.fn(() => sampleGeoJson);
    await ensureGeoMapRegistered('TR', loader1);
    const loader2 = vi.fn(() => sampleGeoJson);
    await ensureGeoMapRegistered('TR', loader2);
    expect(loader1).toHaveBeenCalledTimes(1);
    expect(loader2).not.toHaveBeenCalled();
  });

  it('concurrent calls return same in-flight promise (de-duplicates loader)', async () => {
    let resolveLoader: (g: typeof sampleGeoJson) => void = () => {};
    const loader = vi.fn(
      () =>
        new Promise<typeof sampleGeoJson>((resolve) => {
          resolveLoader = resolve;
        }),
    );
    const p1 = ensureGeoMapRegistered('TR', loader);
    const p2 = ensureGeoMapRegistered('TR', loader);
    // p1 and p2 must be the SAME promise — second call sees the
    // in-flight cache and returns it without invoking loader again.
    expect(p1).toBe(p2);
    // Flush the microtask queue so the wrapped `.then(() => loader())`
    // actually invokes the loader (loader returns a pending promise
    // whose `resolve` is captured in `resolveLoader` only after this
    // microtask fires).
    await Promise.resolve();
    resolveLoader(sampleGeoJson);
    await Promise.all([p1, p2]);
    // After settle, loader was called exactly once (no double-fetch).
    expect(loader).toHaveBeenCalledTimes(1);
    expect(isGeoMapRegistered('TR')).toBe(true);
  });

  it('loader rejection clears cache so retry can succeed', async () => {
    const failingLoader = vi.fn(() => Promise.reject(new Error('network')));
    await expect(ensureGeoMapRegistered('TR', failingLoader)).rejects.toThrow('network');
    expect(isGeoMapRegistered('TR')).toBe(false);

    const successLoader = vi.fn(() => sampleGeoJson);
    await ensureGeoMapRegistered('TR', successLoader);
    expect(isGeoMapRegistered('TR')).toBe(true);
    expect(successLoader).toHaveBeenCalledTimes(1);
  });

  it('non-FeatureCollection payload surfaces clear error + leaves map unregistered', async () => {
    const badLoader = vi.fn(
      () => ({ type: 'Other', features: [] }) as unknown as typeof sampleGeoJson,
    );
    await expect(ensureGeoMapRegistered('TR', badLoader)).rejects.toThrow(
      /non-GeoJSON FeatureCollection/,
    );
    expect(isGeoMapRegistered('TR')).toBe(false);
  });

  it('null / undefined payload surfaces clear error', async () => {
    const nullLoader = vi.fn(() => null as unknown as typeof sampleGeoJson);
    await expect(ensureGeoMapRegistered('TR', nullLoader)).rejects.toThrow(
      /non-GeoJSON FeatureCollection/,
    );
    expect(isGeoMapRegistered('TR')).toBe(false);
  });
});
