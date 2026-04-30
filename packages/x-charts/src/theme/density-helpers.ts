/**
 * density-helpers — clamp + multiplier utilities for density-aware sizing
 *
 * Faz 21.5-A3 (Codex iter-8 AGREE):
 * Compact theme density'sinde fontSize/spacing/padding hesaplaması için
 * merkezi helper'lar. fontSize 10px altına düşmesin (a11y minimum
 * readable size guarantee).
 *
 * Multiplier matrix:
 *   - comfortable: fontSize 1.0, spacing 1.0, padding 1.0
 *   - compact:     fontSize 0.875, spacing 0.75, padding 0.75
 *
 * Codex iter-7 absorb: fontSize için Math.max(10, ...) clamp; spacing /
 * padding ayrı multiplier kalsın (tek "densityMultiplier" yerine 3
 * boyutlu).
 */

export type ChartDensity = 'comfortable' | 'compact';

export interface DensityMultiplier {
  /** Font size scaling factor. */
  fontSize: number;
  /** Margin / gap / item spacing scaling factor. */
  spacing: number;
  /** Inner padding scaling factor (axis tick labels, tooltip box, etc.). */
  padding: number;
}

export const DENSITY_MULTIPLIERS: Record<ChartDensity, DensityMultiplier> = {
  comfortable: { fontSize: 1.0, spacing: 1.0, padding: 1.0 },
  compact: { fontSize: 0.875, spacing: 0.75, padding: 0.75 },
};

/** Minimum font size in pixels — a11y readable threshold. */
export const MIN_FONT_SIZE_PX = 10;

/**
 * Scale a base font size by a multiplier, clamping to MIN_FONT_SIZE_PX.
 * Round to integer pixels for crisp rendering.
 *
 * @example
 *   scaleFontSize(11, 0.875) === 10  // round(9.625) = 10
 *   scaleFontSize(13, 0.875) === 11  // round(11.375) = 11
 *   scaleFontSize(8, 0.875) === 10   // clamp at 10
 *   scaleFontSize(11, 1.0) === 11    // unchanged
 */
export const scaleFontSize = (base: number, multiplier: number): number => {
  const scaled = Math.round(base * multiplier);
  return Math.max(MIN_FONT_SIZE_PX, scaled);
};

/**
 * Scale a spacing/gap value (legend itemGap, axis nameGap, etc.).
 * Floor at 0, no minimum clamp (spacing can legitimately be 0).
 */
export const scaleSpacing = (base: number, multiplier: number): number =>
  Math.max(0, Math.round(base * multiplier));

/**
 * Scale a padding value (tooltip padding, grid padding, etc.).
 * Floor at 0.
 */
export const scalePadding = (base: number, multiplier: number): number =>
  Math.max(0, Math.round(base * multiplier));

/**
 * Resolve density preference + DOM signal into a final density.
 * Used both inside useChartTheme and for direct utility access.
 */
export const resolveDensity = (
  preference: 'auto' | ChartDensity | undefined,
  snapshotDensity: ChartDensity,
): ChartDensity => {
  if (preference && preference !== 'auto') return preference;
  return snapshotDensity;
};
