/**
 * accent-palettes — token-aware chart palette per accent theme
 *
 * Faz 21.5-A2 (Codex iter-13+14 AGREE):
 * design-tokens/figma.tokens.json → semantic.theme.palette mapping.
 *
 * 7 accent × 10-color matrix:
 *   - 'light' (alias 'neutral'): current DEFAULT_PALETTE — backward compat critical
 *   - 'dark', 'emerald', 'graphite', 'ocean', 'sunset', 'violet': accent-tinted
 *
 * Each palette starts with the accent's `colorPrimary` from figma.tokens.json
 * (when applicable), followed by complementary tones tuned for chart series
 * differentiation (8-10 distinct colors with adequate luminance separation).
 *
 * NOTE: HC and Print themes IGNORE these palettes — HC uses the
 * HIGH_CONTRAST_PALETTE (max-luminance), Print uses COLORBLIND_PALETTES.monochrome.
 *
 * SEMANTIC PRESERVATION: GaugeChart thresholds (success/warning/danger),
 * HeatmapChart gradient, WaterfallChart increase/decrease colors are
 * accent-IMMUNE. Only WaterfallChart's `total` color binds to accent[0].
 */

export type ChartAccentName =
  | 'light'
  | 'dark'
  | 'emerald'
  | 'graphite'
  | 'ocean'
  | 'sunset'
  | 'violet';

/**
 * Accent palette matrix — 10 colors per accent.
 *
 * `light` palette === legacy chart wrapper DEFAULT_PALETTE (zero-diff backward
 * compat for consumers without `data-accent` attribute).
 *
 * Other accents derive from figma.tokens.json:
 *   - palette[0] === semantic.theme.palette[name].colorPrimary
 *   - palette[1..9] = complementary chart series tones (curated)
 */
export const ACCENT_PALETTES: Record<ChartAccentName, string[]> = {
  // BACKWARD COMPAT: identical to legacy DEFAULT_PALETTE in 13 chart wrappers
  light: [
    '#3b82f6', // primary blue
    '#22c55e', // success green
    '#f59e0b', // warning amber
    '#ef4444', // danger red
    '#06b6d4', // info cyan
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#14b8a6', // teal
    '#f97316', // orange
    '#6366f1', // indigo
  ],

  // Dark mode — brighter palette for dark backgrounds
  dark: [
    '#60a5fa', // primary blue (lighter)
    '#4ade80', // success green
    '#fbbf24', // warning amber
    '#f87171', // danger red
    '#22d3ee', // info cyan
    '#a78bfa', // purple
    '#f472b6', // pink
    '#2dd4bf', // teal
    '#fb923c', // orange
    '#818cf8', // indigo
  ],

  // Emerald — green-leaning, figma colorPrimary='#16a34a'
  emerald: [
    '#16a34a', // primary emerald
    '#0d9488', // teal
    '#84cc16', // lime
    '#22d3ee', // cyan
    '#10b981', // emerald-500
    '#059669', // emerald-600
    '#15803d', // emerald-700
    '#65a30d', // lime-600
    '#0e7490', // cyan-700
    '#0891b2', // sky-600
  ],

  // Graphite — neutral grayscale-leaning
  graphite: [
    '#475569', // slate-600
    '#64748b', // slate-500
    '#94a3b8', // slate-400
    '#374151', // gray-700
    '#6b7280', // gray-500
    '#9ca3af', // gray-400
    '#1e293b', // slate-800
    '#334155', // slate-700
    '#0f172a', // slate-900
    '#020617', // slate-950
  ],

  // Ocean — blue-leaning, figma colorPrimary='#0ea5e9'
  ocean: [
    '#0ea5e9', // primary sky
    '#06b6d4', // cyan
    '#3b82f6', // blue
    '#0284c7', // sky-600
    '#0369a1', // sky-700
    '#075985', // sky-800
    '#0891b2', // cyan-600
    '#0e7490', // cyan-700
    '#0c4a6e', // sky-900
    '#1e40af', // blue-700
  ],

  // Sunset — warm orange/amber-leaning, figma colorPrimary='#f97316'
  sunset: [
    '#f97316', // primary orange
    '#f59e0b', // amber
    '#fbbf24', // amber-400
    '#fb923c', // orange-400
    '#ea580c', // orange-600
    '#d97706', // amber-600
    '#b45309', // amber-700
    '#c2410c', // orange-700
    '#9a3412', // orange-800
    '#7c2d12', // orange-900
  ],

  // Violet — purple-leaning, figma colorPrimary='#722ed1'
  violet: [
    '#722ed1', // primary violet
    '#8b5cf6', // violet-500
    '#a855f7', // purple-500
    '#7c3aed', // violet-600
    '#6d28d9', // violet-700
    '#5b21b6', // violet-800
    '#4c1d95', // violet-900
    '#9333ea', // purple-600
    '#c026d3', // fuchsia-600
    '#a21caf', // fuchsia-700
  ],
};

/**
 * Validate a runtime accent name (defensive — invalid → 'light' fallback).
 */
export const isValidAccent = (value: string): value is ChartAccentName =>
  Object.prototype.hasOwnProperty.call(ACCENT_PALETTES, value);

/**
 * Resolve a `data-accent` attribute string into a canonical ChartAccentName.
 *
 * Codex iter-14 alias absorb: runtime occasionally emits 'neutral' which maps
 * to 'light'. Other invalid values fall through to 'light' (default).
 */
export const normalizeAccent = (raw: string | null | undefined): ChartAccentName => {
  if (!raw) return 'light';
  const value = raw.trim().toLowerCase();
  if (value === 'neutral') return 'light'; // alias
  if (isValidAccent(value)) return value;
  return 'light';
};
