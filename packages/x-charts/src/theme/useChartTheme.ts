/**
 * useChartTheme — central theme/decal hook for x-charts wrappers
 *
 * Faz 21.5-B PR-B3b (Codex iter-3 AGREE):
 * - Single source of theme resolution for all 13 chart wrappers.
 * - Reactive: re-renders when documentElement attributes or media queries change.
 * - SSR-safe: returns 'light' theme during server render.
 *
 * Public API:
 *   const { themeObject, resolvedTheme, decalEnabled, decalPatterns } =
 *     useChartTheme({ theme: 'auto', decal: 'auto' });
 *
 * Theme preference normalization:
 *   - 'auto' → from themeReactiveStore snapshot (data-appearance > data-theme > data-mode > media)
 *   - 'light' === 'default' (alias)
 *   - 'dark' / 'high-contrast' / 'print' → explicit
 *
 * Decal preference normalization:
 *   - 'auto' → enabled iff resolvedTheme is 'high-contrast' or 'print'
 *   - true / false → respected verbatim
 *
 * Print theme builder is invoked with `useDecalPatterns: false` to avoid double-injection;
 * decal control lives ONLY at the option level.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { buildDesignLabEChartsTheme } from './DesignLabEChartsTheme';
import { buildDesignLabEChartsDarkTheme } from './DesignLabEChartsDarkTheme';
import { buildDesignLabEChartsHighContrastTheme } from './DesignLabEChartsHighContrastTheme';
import { buildDesignLabEChartsPrintTheme } from './DesignLabEChartsPrintTheme';
import { DECAL_PATTERNS, type DecalPattern } from './decal-patterns';
import {
  subscribeThemeStore,
  getThemeSnapshot,
  getServerThemeSnapshot,
  type ThemeSnapshot,
  type ChartResolvedTheme,
} from './themeReactiveStore';

export type ChartThemePreference =
  | 'auto'
  | 'light'
  | 'default'
  | 'dark'
  | 'high-contrast'
  | 'print';

export type ChartDecalPreference = boolean | 'auto';

export interface UseChartThemeOptions {
  /** Theme override. `'auto'` (default) follows the documentElement signals. */
  theme?: ChartThemePreference;
  /** Decal pattern override. `'auto'` (default) enables only for high-contrast / print. */
  decal?: ChartDecalPreference;
}

export interface UseChartThemeResult {
  /** ECharts theme object — pass to `echarts.init(div, themeObject)`. */
  themeObject: Record<string, unknown>;
  /** Resolved theme name after auto/alias normalization. */
  resolvedTheme: ChartResolvedTheme;
  /** Whether decal patterns should be injected into option.aria.decal. */
  decalEnabled: boolean;
  /** Stable reference to the decal pattern matrix. */
  decalPatterns: DecalPattern[];
  /** Source of resolved theme (debug + observability). */
  themeSource: ThemeSnapshot['source'] | 'explicit';
}

const resolveThemePreference = (
  preference: ChartThemePreference,
  snapshot: ThemeSnapshot,
): { resolved: ChartResolvedTheme; source: ThemeSnapshot['source'] | 'explicit' } => {
  if (preference === 'auto') {
    return { resolved: snapshot.resolvedTheme, source: snapshot.source };
  }
  // 'light' and 'default' are aliases for the same resolved 'light' theme.
  if (preference === 'light' || preference === 'default') {
    return { resolved: 'light', source: 'explicit' };
  }
  return { resolved: preference, source: 'explicit' };
};

const resolveDecalPreference = (
  preference: ChartDecalPreference,
  resolvedTheme: ChartResolvedTheme,
): boolean => {
  if (preference === 'auto') {
    return resolvedTheme === 'high-contrast' || resolvedTheme === 'print';
  }
  return Boolean(preference);
};

const buildThemeObject = (
  resolved: ChartResolvedTheme,
  isDarkSurface: boolean,
): Record<string, unknown> => {
  switch (resolved) {
    case 'dark':
      // DarkTheme builder kendi isDarkMode() helper'ı ile data-theme/media
      // query üzerinden çalışır; ekstra flag gerekmez.
      return buildDesignLabEChartsDarkTheme();
    case 'high-contrast':
      // Codex iter-5 fix: HC builder iki varyant (light HC vs dark HC) destekler.
      // isDarkSurface DOM/data-mode/data-theme/media-query'den hesaplanır.
      return buildDesignLabEChartsHighContrastTheme({ dark: isDarkSurface });
    case 'print':
      // Codex iter-2 madde 4: print theme'in built-in aria.decal'ı kapatılır;
      // decal kontrolü sadece option seviyesinde yapılır.
      return buildDesignLabEChartsPrintTheme({ useDecalPatterns: false });
    case 'light':
    default:
      return buildDesignLabEChartsTheme();
  }
};

/**
 * Resolve theme + decal preferences into ECharts-ready outputs.
 * Reactive: re-renders the calling component when the singleton store snapshots change.
 */
export function useChartTheme(options?: UseChartThemeOptions): UseChartThemeResult {
  const themePreference: ChartThemePreference = options?.theme ?? 'auto';
  const decalPreference: ChartDecalPreference = options?.decal ?? 'auto';

  const snapshot = useSyncExternalStore(
    subscribeThemeStore,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  const { resolved, source } = resolveThemePreference(themePreference, snapshot);
  const decalEnabled = resolveDecalPreference(decalPreference, resolved);

  // Codex iter-5: HC builder needs dark surface flag. Other themes ignore it
  // but the dependency keeps the snapshot reactive — overhead is negligible
  // since theme builders are tiny pure functions.
  const themeObject = useMemo(
    () => buildThemeObject(resolved, snapshot.isDarkSurface),
    [resolved, snapshot.isDarkSurface],
  );

  return {
    themeObject,
    resolvedTheme: resolved,
    decalEnabled,
    decalPatterns: DECAL_PATTERNS,
    themeSource: source,
  };
}
