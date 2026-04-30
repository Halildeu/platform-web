/**
 * x-charts locale store — single source of truth that drives ECharts
 * `init({ locale })` for every chart wrapper. Shell hosts call
 * `setChartsLocale(bcp47)` whenever the user switches language; chart
 * wrappers subscribe via `useChartsLocale()` and re-init their ECharts
 * instance with the new locale key.
 *
 * The store is intentionally framework-light:
 *   - module-scoped current locale + listener Set (avoids zustand
 *     circular import and SSR cold-start issues)
 *   - `setChartsLocale` is idempotent (no listener traffic if value
 *     does not change)
 *   - `useChartsLocale` keeps a per-component subscription and removes
 *     it on unmount (prevents the leak that `setState` listeners
 *     hold a stale reference to)
 *
 * Why module scope is OK:
 *   - mfe-shell mounts a single shared store (cross-package singleton);
 *   - the data is reactive, not persistent (no need to namespace per
 *     QueryClient / Provider boundary);
 *   - the listener Set is bounded by mounted chart wrappers.
 *
 * @see Faz 21.5-A1 plan in docs/x-charts-ui-ux-tracker.md §6
 */
import { useEffect, useState } from 'react';
import { registerEChartsLocale } from './echarts-locale';

const DEFAULT_LOCALE = 'tr-TR';

let currentLocale: string = DEFAULT_LOCALE;
const listeners = new Set<(locale: string) => void>();

/**
 * Update the active charts locale. Idempotent — repeats with the same
 * value are no-ops. Calls registerEChartsLocale so the renderer can
 * pick up locale data on its next init / option update.
 */
export function setChartsLocale(bcp47: string): void {
  if (typeof bcp47 !== 'string' || bcp47.length === 0) return;
  if (currentLocale === bcp47) return;
  currentLocale = bcp47;
  // Best-effort registration; unknown locales return null and we fall
  // back to ECharts' built-in EN.
  registerEChartsLocale(bcp47);
  for (const listener of listeners) {
    listener(bcp47);
  }
}

/**
 * Read the current charts locale synchronously (no React subscription).
 * Useful for ECharts init option construction outside hooks.
 */
export function getCurrentChartsLocale(): string {
  return currentLocale;
}

/**
 * React hook — returns the current charts locale and re-renders the
 * caller when it changes. Intended for chart wrappers and
 * useEChartsRenderer.
 */
export function useChartsLocale(): string {
  const [locale, setLocale] = useState<string>(currentLocale);

  useEffect(() => {
    // Cover the rare race where the store changed between the initial
    // useState read and effect mount.
    if (locale !== currentLocale) {
      setLocale(currentLocale);
    }

    const handler = (next: string) => setLocale(next);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, [locale]);

  return locale;
}

/**
 * Test-only helper. Resets the store to the default locale and clears
 * all listeners. Production code should not use this.
 */
export function __resetChartsLocaleStoreForTests(): void {
  currentLocale = DEFAULT_LOCALE;
  listeners.clear();
}
