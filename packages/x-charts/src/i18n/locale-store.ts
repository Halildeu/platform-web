/**
 * x-charts locale store — single source of truth that drives ECharts
 * `init({ locale })` for every chart wrapper. Shell hosts call
 * `setChartsLocale(bcp47)` whenever the user switches language; chart
 * wrappers subscribe via `useChartsLocale()` and re-init their ECharts
 * instance with the new locale key.
 *
 * The store has two layers:
 *
 *   1. Module-scoped state (`currentLocale` + `listeners`) — fast
 *      synchronous reads, in-process listener notification.
 *
 *   2. Window CustomEvent broadcast (`mfe-x-charts:locale-change`) —
 *      crosses the Module Federation boundary so a remote that bundles
 *      its own copy of `@mfe/x-charts` (mfe-reporting today; mfe-access
 *      / mfe-audit / mfe-users tomorrow) still sees shell-driven locale
 *      switches. Each module copy listens to the broadcast, mirrors the
 *      change into its own module-scoped state, and notifies its own
 *      listeners. The origin-id guard prevents self-echo loops.
 *
 *   - `setChartsLocale` is idempotent (no listener traffic if value
 *     does not change).
 *   - `useChartsLocale` keeps a per-component subscription and removes
 *     it on unmount (prevents the leak that `setState` listeners
 *     hold a stale reference to).
 *   - `subscribeChartsLocale` exposes the same channel without React
 *     for cross-cutting wiring (analytics, test introspection).
 *
 * @see Faz 21.5-A1 plan in docs/x-charts-ui-ux-tracker.md §6
 * @see Codex audit thread `019dddb9-...` (PR-A1 second pass)
 */
import { useEffect, useState } from 'react';
import { registerEChartsLocale } from './echarts-locale';

const DEFAULT_LOCALE = 'tr-TR';
const BROADCAST_EVENT = 'mfe-x-charts:locale-change';

interface LocaleChangeEventDetail {
  locale: string;
  /** ID of the module-copy that originated the broadcast — used to
   *  ignore self-echo so we don't notify listeners twice. */
  origin: number;
}

/**
 * Shell I18nManager persists the current locale to
 * `localStorage['mfe.locale']`. Late-loaded remotes that bundle their
 * own copy of `@mfe/x-charts` initialise after the shell's locale
 * change CustomEvent has already fired — they would otherwise sit on
 * DEFAULT_LOCALE until the next switch. Reading the persisted value
 * at module-init mirrors shell state into the remote copy.
 *
 * Codex iter-2 B2 absorbu — late-loaded remote fix.
 */
const SHELL_LOCALE_STORAGE_KEY = 'mfe.locale';

const ORIGIN_ID = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

const readShellLocale = (): string => {
  if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_LOCALE;
  try {
    const stored = window.localStorage.getItem(SHELL_LOCALE_STORAGE_KEY);
    if (typeof stored === 'string' && stored.length > 0) return stored;
  } catch {
    // localStorage access denied (Safari private mode, quota, sandboxed iframe)
    // — fall through to default.
  }
  return DEFAULT_LOCALE;
};

let currentLocale: string = readShellLocale();
const listeners = new Set<(locale: string) => void>();

// Pre-register the hydrated locale so ECharts has its data ready before
// the first chart instance calls `echarts.init({ locale })`.
if (currentLocale !== DEFAULT_LOCALE) {
  registerEChartsLocale(currentLocale);
}

const dispatchBroadcast = (locale: string) => {
  if (typeof window === 'undefined' || typeof CustomEvent !== 'function') return;
  try {
    window.dispatchEvent(
      new CustomEvent<LocaleChangeEventDetail>(BROADCAST_EVENT, {
        detail: { locale, origin: ORIGIN_ID },
      }),
    );
  } catch {
    // Some test runners ship a stub window without CustomEvent constructor —
    // safe to swallow; module-scope state still updates correctly.
  }
};

if (typeof window !== 'undefined') {
  // Subscribe once per module copy. When another copy fires the event we
  // mirror its locale into our own state and notify our listeners. The
  // origin guard prevents self-echo loops.
  const handleBroadcast = (event: Event) => {
    const detail = (event as CustomEvent<LocaleChangeEventDetail>).detail;
    if (!detail || detail.origin === ORIGIN_ID) return;
    if (typeof detail.locale !== 'string' || detail.locale.length === 0) return;
    if (currentLocale === detail.locale) return;
    currentLocale = detail.locale;
    registerEChartsLocale(detail.locale);
    for (const listener of listeners) {
      listener(detail.locale);
    }
  };
  window.addEventListener(BROADCAST_EVENT, handleBroadcast as EventListener);
}

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
  // Broadcast across MF module-copies so every chart instance — even
  // ones bundled by remotes that don't share @mfe/x-charts via MF —
  // sees the change.
  dispatchBroadcast(bcp47);
}

/**
 * Read the current charts locale synchronously (no React subscription).
 * Useful for ECharts init option construction outside hooks.
 */
export function getCurrentChartsLocale(): string {
  return currentLocale;
}

/**
 * Subscribe directly to locale changes without React. Returns the
 * unsubscribe function. Useful for cross-cutting wiring (analytics,
 * test introspection) that does not own a React tree.
 */
export function subscribeChartsLocale(listener: (locale: string) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
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

/**
 * Test-only helper. Returns the current listener count so tests can
 * directly assert listener-bookkeeping invariants (idempotency,
 * unmount-leak) instead of relying on indirect render-count proxies.
 */
export function __getChartsLocaleListenerCountForTests(): number {
  return listeners.size;
}
