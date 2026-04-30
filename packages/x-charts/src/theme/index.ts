export { buildDesignLabEChartsTheme } from './DesignLabEChartsTheme';
export type { DesignLabThemeOptions } from './DesignLabEChartsTheme';
export { buildDesignLabEChartsDarkTheme, isDarkMode } from './DesignLabEChartsDarkTheme';
export type { DarkThemeOptions } from './DesignLabEChartsDarkTheme';
export { buildDesignLabEChartsHighContrastTheme } from './DesignLabEChartsHighContrastTheme';
export type { HighContrastThemeOptions } from './DesignLabEChartsHighContrastTheme';
export { buildDesignLabEChartsPrintTheme } from './DesignLabEChartsPrintTheme';
export type { PrintThemeOptions } from './DesignLabEChartsPrintTheme';
export { COLORBLIND_PALETTES } from './colorblind-palettes';
export { DECAL_PATTERNS } from './decal-patterns';
export type { DecalPattern } from './decal-patterns';

// Faz 21.5-B PR-B3b — central theme/decal resolver
// Faz 21.5-A3 — density preference + scaling helpers
export { useChartTheme } from './useChartTheme';
export type {
  ChartThemePreference,
  ChartDecalPreference,
  ChartDensityPreference,
  UseChartThemeOptions,
  UseChartThemeResult,
} from './useChartTheme';
export {
  DENSITY_MULTIPLIERS,
  MIN_FONT_SIZE_PX,
  scaleFontSize,
  scaleSpacing,
  scalePadding,
  resolveDensity,
} from './density-helpers';
export type { ChartDensity, DensityMultiplier } from './density-helpers';
export {
  subscribeThemeStore,
  getThemeSnapshot,
  getServerThemeSnapshot,
} from './themeReactiveStore';
export type { ChartResolvedTheme, ThemeSnapshot, ThemeSnapshotSource } from './themeReactiveStore';
