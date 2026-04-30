// @vitest-environment jsdom
/**
 * Mutation-aware tests for `registerEChartsLocale` and the locale data
 * registry — the bridge between BCP 47 locale codes and ECharts'
 * runtime locale system.
 *
 * Codex iter-2 blockers absorbed:
 *   - B7: prior tests covered store/listener contracts but not whether
 *     `echarts.registerLocale` is actually invoked. Without that call
 *     `echarts.init({ locale: 'AR' })` silently falls back to EN.
 *   - B3: ECHARTS_LOCALE_MAP claimed `ar-SA` but LOCALE_DATA had no AR
 *     entry — registering reported success but echarts saw no data.
 *
 * Each assertion below would fail under a plausible mutation:
 *   - "drop the registerLocale call"     → assert: registerLocale called with key+data
 *   - "register without data lookup"     → assert: data passed equals AR locale
 *   - "skip registration after first"    → assert: re-registering same locale is a no-op
 *   - "lose the AR data"                 → assert: AR entry exists with Arabic strings
 *   - "claim DE/FR/JA/ZH without data"   → assert: map only contains data-backed locales
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { registerLocaleMock } = vi.hoisted(() => ({
  registerLocaleMock: vi.fn(),
}));

// Mock the renderer's echarts module BEFORE importing echarts-locale so
// the dynamic import inside registerEChartsLocale resolves to our mock.
vi.mock('../renderers/echarts-imports', () => ({
  echarts: {
    registerLocale: registerLocaleMock,
    init: vi.fn(),
    dispose: vi.fn(),
  },
  registerECharts: vi.fn(),
}));

import {
  registerEChartsLocale,
  getEChartsLocale,
  ECHARTS_LOCALE_MAP,
  __resetRegisteredLocalesForTests,
} from '../i18n/echarts-locale';

beforeEach(() => {
  registerLocaleMock.mockClear();
  __resetRegisteredLocalesForTests();
});

describe('registerEChartsLocale — actually calls echarts.registerLocale', () => {
  it('invokes echarts.registerLocale with mapped key and locale data on first call', async () => {
    // Codex iter-2 B7 — guard against the regression where registerLocale
    // was tracked in a Set but never actually called on echarts. Lazy
    // import resolution requires waiting for the dynamic import promise.
    registerEChartsLocale('en-US');

    await vi.waitFor(() => {
      expect(registerLocaleMock).toHaveBeenCalled();
    });

    expect(registerLocaleMock).toHaveBeenCalledWith(
      'EN',
      expect.objectContaining({
        toolbox: expect.any(Object),
        legend: expect.any(Object),
        series: expect.any(Object),
      }),
    );
  });

  it('passes Arabic locale data when registering ar-SA (Codex iter-2 B3)', async () => {
    registerEChartsLocale('ar-SA');

    await vi.waitFor(() => {
      expect(registerLocaleMock).toHaveBeenCalledWith(
        'AR',
        expect.objectContaining({
          toolbox: expect.objectContaining({
            saveAsImage: { title: expect.stringContaining('حفظ') },
          }),
        }),
      );
    });
  });

  it('does not re-invoke registerLocale for the same locale (idempotent guard)', async () => {
    registerEChartsLocale('en-US');
    await vi.waitFor(() => {
      expect(registerLocaleMock).toHaveBeenCalled();
    });

    const firstCallCount = registerLocaleMock.mock.calls.length;

    registerEChartsLocale('en-US');
    registerEChartsLocale('en-US');
    // Microtask flush — any extra calls would have hit by now.
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(registerLocaleMock.mock.calls.length).toBe(firstCallCount);
  });

  it('returns null and skips registration for unsupported BCP 47 codes', async () => {
    registerLocaleMock.mockClear();
    const result = registerEChartsLocale('xx-YY');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(result).toBeNull();
    expect(registerLocaleMock).not.toHaveBeenCalled();
  });
});

describe('LOCALE_DATA registry — coverage parity with ECHARTS_LOCALE_MAP', () => {
  it('exposes locale data for every locale code listed in the map', () => {
    // Codex iter-2 B3 absorbu: claim/data parity. Every code in the map
    // must resolve to a non-null data object. Silent claim-without-data
    // makes echarts.init fall back to EN without warning.
    for (const bcp47 of Object.keys(ECHARTS_LOCALE_MAP)) {
      const data = getEChartsLocale(bcp47);
      expect(data, `LOCALE_DATA missing for ${bcp47}`).not.toBeNull();
      expect(data?.toolbox).toBeDefined();
      expect(data?.legend).toBeDefined();
      expect(data?.series).toBeDefined();
    }
  });

  it('AR locale ships actual Arabic-script strings (not romanized fallback)', () => {
    const data = getEChartsLocale('ar-SA');
    expect(data).not.toBeNull();
    // Sample a known string and verify it contains Arabic-script
    // characters (Unicode range U+0600 to U+06FF).
    expect(data?.toolbox.saveAsImage.title).toMatch(/[؀-ۿ]/);
    expect(data?.legend.selector.all).toMatch(/[؀-ۿ]/);
  });
});
