/**
 * themeReactiveStore — module-level singleton observer for chart theme detection
 *
 * Faz 21.5-B PR-B3b (Codex iter-7+8 hibrit pattern):
 * - SINGLE MutationObserver on documentElement (per-chart observer YASAK)
 * - SINGLE matchMedia listener pair (`prefers-contrast: more` + `prefers-color-scheme: dark`)
 * - useSyncExternalStore-uyumlu `subscribe` / `getSnapshot` / `getServerSnapshot` API
 *
 * Detection priority (codex iter-3 final):
 *   1. `data-appearance` (canonical: 'light' | 'dark' | 'high-contrast'; alias: 'hc')
 *   2. `data-theme` (normalized: 'high-contrast' | 'serban-hc' | '*-hc' suffix → high-contrast,
 *                   'dark' | 'serban-dark' | '*-dark' suffix → dark,
 *                   'light' | 'serban-light' | 'serban-compact' → light)
 *   3. `data-mode` (light|dark only; other values ignored)
 *   4. `prefers-contrast: more` → high-contrast
 *   5. `prefers-color-scheme: dark` → dark
 *   6. default → light
 *
 * NOTE: 'print' theme is NEVER auto-detected — only via explicit chart prop.
 */

export type ChartResolvedTheme = 'light' | 'dark' | 'high-contrast' | 'print';

export type ThemeSnapshotSource =
  | 'data-appearance'
  | 'data-theme'
  | 'data-mode'
  | 'prefers-contrast'
  | 'prefers-color-scheme'
  | 'default'
  | 'server';

export interface ThemeSnapshot {
  /** Resolved auto-detected theme (excluding 'print' which is explicit-only). */
  resolvedTheme: Exclude<ChartResolvedTheme, 'print'>;
  /** Which signal won the priority chain. */
  source: ThemeSnapshotSource;
}

const ATTRIBUTE_FILTER = [
  'data-theme',
  'data-appearance',
  'data-mode',
  'data-accent',
  'data-surface-tone',
  'data-density',
  'style',
];

const SERVER_SNAPSHOT: ThemeSnapshot = { resolvedTheme: 'light', source: 'server' };

const SUBSCRIBERS = new Set<() => void>();
let observer: MutationObserver | null = null;
let mqContrast: MediaQueryList | null = null;
let mqDark: MediaQueryList | null = null;
let mqHandler: (() => void) | null = null;
let cachedSnapshot: ThemeSnapshot | null = null;

const isServer = (): boolean => typeof document === 'undefined';

const matchMediaSafe = (query: string): MediaQueryList | null => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  try {
    return window.matchMedia(query);
  } catch {
    return null;
  }
};

const normalizeDataTheme = (raw: string | null): Exclude<ChartResolvedTheme, 'print'> | null => {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value === 'high-contrast' || value === 'serban-hc' || value.endsWith('-hc')) {
    return 'high-contrast';
  }
  if (value === 'dark' || value === 'serban-dark' || value.endsWith('-dark')) {
    return 'dark';
  }
  if (
    value === 'light' ||
    value === 'serban-light' ||
    value === 'serban-compact' ||
    value.endsWith('-light')
  ) {
    return 'light';
  }
  return null;
};

const normalizeDataAppearance = (
  raw: string | null,
): Exclude<ChartResolvedTheme, 'print'> | null => {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value === 'high-contrast') return 'high-contrast';
  if (value === 'hc') return 'high-contrast'; // alias
  if (value === 'dark') return 'dark';
  if (value === 'light') return 'light';
  return null;
};

const normalizeDataMode = (raw: string | null): Exclude<ChartResolvedTheme, 'print'> | null => {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value === 'dark') return 'dark';
  if (value === 'light') return 'light';
  return null;
};

const computeSnapshot = (): ThemeSnapshot => {
  if (isServer()) return SERVER_SNAPSHOT;
  const root = document.documentElement;

  const appearance = normalizeDataAppearance(root.getAttribute('data-appearance'));
  if (appearance) return { resolvedTheme: appearance, source: 'data-appearance' };

  const theme = normalizeDataTheme(root.getAttribute('data-theme'));
  if (theme) return { resolvedTheme: theme, source: 'data-theme' };

  const mode = normalizeDataMode(root.getAttribute('data-mode'));
  if (mode) return { resolvedTheme: mode, source: 'data-mode' };

  const contrast = matchMediaSafe('(prefers-contrast: more)');
  if (contrast?.matches) {
    return { resolvedTheme: 'high-contrast', source: 'prefers-contrast' };
  }

  const dark = matchMediaSafe('(prefers-color-scheme: dark)');
  if (dark?.matches) {
    return { resolvedTheme: 'dark', source: 'prefers-color-scheme' };
  }

  return { resolvedTheme: 'light', source: 'default' };
};

const snapshotsEqual = (a: ThemeSnapshot, b: ThemeSnapshot): boolean =>
  a.resolvedTheme === b.resolvedTheme && a.source === b.source;

const broadcast = () => {
  const next = computeSnapshot();
  if (cachedSnapshot && snapshotsEqual(cachedSnapshot, next)) return;
  cachedSnapshot = next;
  SUBSCRIBERS.forEach((fn) => {
    try {
      fn();
    } catch {
      /* listener errors must not break siblings */
    }
  });
};

const ensureWatchers = () => {
  if (isServer()) return;

  if (!observer && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(broadcast);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ATTRIBUTE_FILTER,
    });
  }

  if (!mqContrast && !mqDark) {
    const c = matchMediaSafe('(prefers-contrast: more)');
    const d = matchMediaSafe('(prefers-color-scheme: dark)');
    if (c || d) {
      mqHandler = broadcast;
      if (c) {
        mqContrast = c;
        if (typeof c.addEventListener === 'function') {
          c.addEventListener('change', mqHandler);
        } else if (
          typeof (c as MediaQueryList & { addListener?: (cb: () => void) => void }).addListener ===
          'function'
        ) {
          (c as MediaQueryList & { addListener: (cb: () => void) => void }).addListener(mqHandler);
        }
      }
      if (d) {
        mqDark = d;
        if (typeof d.addEventListener === 'function') {
          d.addEventListener('change', mqHandler);
        } else if (
          typeof (d as MediaQueryList & { addListener?: (cb: () => void) => void }).addListener ===
          'function'
        ) {
          (d as MediaQueryList & { addListener: (cb: () => void) => void }).addListener(mqHandler);
        }
      }
    }
  }
};

const teardownWatchers = () => {
  if (SUBSCRIBERS.size > 0) return;
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (mqHandler) {
    if (mqContrast) {
      if (typeof mqContrast.removeEventListener === 'function') {
        mqContrast.removeEventListener('change', mqHandler);
      } else if (
        typeof (mqContrast as MediaQueryList & { removeListener?: (cb: () => void) => void })
          .removeListener === 'function'
      ) {
        (
          mqContrast as MediaQueryList & { removeListener: (cb: () => void) => void }
        ).removeListener(mqHandler);
      }
    }
    if (mqDark) {
      if (typeof mqDark.removeEventListener === 'function') {
        mqDark.removeEventListener('change', mqHandler);
      } else if (
        typeof (mqDark as MediaQueryList & { removeListener?: (cb: () => void) => void })
          .removeListener === 'function'
      ) {
        (mqDark as MediaQueryList & { removeListener: (cb: () => void) => void }).removeListener(
          mqHandler,
        );
      }
    }
    mqHandler = null;
  }
  mqContrast = null;
  mqDark = null;
};

/**
 * Subscribe to theme changes. Returns unsubscribe callback.
 * `useSyncExternalStore` semantics.
 */
export const subscribeThemeStore = (cb: () => void): (() => void) => {
  SUBSCRIBERS.add(cb);
  ensureWatchers();
  return () => {
    SUBSCRIBERS.delete(cb);
    if (SUBSCRIBERS.size === 0) {
      teardownWatchers();
    }
  };
};

/**
 * Stable snapshot getter for `useSyncExternalStore`.
 * Cached until the singleton observer broadcasts a change.
 */
export const getThemeSnapshot = (): ThemeSnapshot => {
  if (isServer()) return SERVER_SNAPSHOT;
  if (!cachedSnapshot) cachedSnapshot = computeSnapshot();
  return cachedSnapshot;
};

/** SSR snapshot fallback. */
export const getServerThemeSnapshot = (): ThemeSnapshot => SERVER_SNAPSHOT;

/**
 * Test-only reset. Disconnects observer, clears cache and subscribers.
 * Production callers should never need this.
 */
export const __resetThemeStoreForTests = (): void => {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (mqHandler) {
    if (mqContrast?.removeEventListener) mqContrast.removeEventListener('change', mqHandler);
    if (mqDark?.removeEventListener) mqDark.removeEventListener('change', mqHandler);
  }
  mqContrast = null;
  mqDark = null;
  mqHandler = null;
  cachedSnapshot = null;
  SUBSCRIBERS.clear();
};

/** Test-only subscriber count. */
export const __getThemeSubscriberCountForTests = (): number => SUBSCRIBERS.size;
