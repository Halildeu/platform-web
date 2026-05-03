/**
 * buildResponsiveAxisLabel — pure ECharts axis-label option builder
 *
 * Centralises the collision/overflow rules every category-axis chart needs:
 *
 *   - `hideOverlap`         → ECharts skips labels that would overlap.
 *   - `interval`            → `0` only when label count is small enough to fit
 *                             without rotation. Threshold heuristic = 8 labels
 *                             (Codex REVISE 019defa5: `mobile?'auto':0` was
 *                             wrong — desktop with 100 categories also needs
 *                             `'auto'`).
 *   - `rotate`              → mobile-only 30° rotation when there are too many
 *                             labels to fit horizontally.
 *   - `formatter` truncate  → caps display string length so long category
 *                             names don't bleed into neighbours. The original
 *                             label still reaches the tooltip and a11y layer
 *                             via `axisPointer.label` / aria descriptions.
 *
 * Helpers stay pure (no React, no ECharts imports) so they can be unit tested
 * in isolation and shared across all 13 chart wrappers without duplication.
 *
 * @see decisions/topics/chart-viz-engine-selection.v1.json (D-009)
 * @see useResponsiveChart.ts (provides Breakpoint enum)
 */

import type { Breakpoint } from '../useResponsiveChart';

/* ------------------------------------------------------------------ */
/*  Public params                                                      */
/* ------------------------------------------------------------------ */

export interface BuildResponsiveAxisLabelParams {
  /** Active breakpoint resolved by useResponsiveBreakpoint. */
  breakpoint: Breakpoint;
  /** Total label count on the category axis. */
  labelCount: number;
  /**
   * Density-multiplier from useChartTheme so density-compact charts get the
   * same fractional shrink that the rest of the chart uses.
   * @default 1
   */
  densityFontMultiplier?: number;
  /** Base font size before density scaling. @default 11 */
  baseFontSize?: number;
  /**
   * Hard truncation threshold for the label text. `undefined` = no truncation.
   * Useful for long category labels that would otherwise force the chart
   * grid to shrink dramatically.
   */
  truncateAt?: number;
}

/* ------------------------------------------------------------------ */
/*  Output shape                                                       */
/* ------------------------------------------------------------------ */

export interface ResponsiveAxisLabelOption {
  fontSize: number;
  hideOverlap: true;
  interval: 0 | 'auto';
  rotate: number;
  formatter?: (value: string) => string;
}

/* ------------------------------------------------------------------ */
/*  Heuristics (exposed for tests)                                     */
/* ------------------------------------------------------------------ */

/**
 * Above this label count the chart switches from "show every label" to
 * "let ECharts auto-skip labels that don't fit". 8 is the Codex REVISE
 * threshold: empirically the point where 11px labels at 700px container
 * width start touching.
 */
export const AXIS_LABEL_INTERVAL_THRESHOLD = 8;

/**
 * Mobile-only rotation kicks in when label count exceeds this. Below it,
 * even mobile keeps labels horizontal (cleaner, less squint).
 */
export const AXIS_LABEL_MOBILE_ROTATE_THRESHOLD = 4;

/* ------------------------------------------------------------------ */
/*  Builder                                                            */
/* ------------------------------------------------------------------ */

/**
 * Build a responsive `axisLabel` option fragment for an ECharts category axis.
 *
 * Wrappers should spread the result into the existing `axisLabel` object so
 * any wrapper-specific keys (e.g. `formatter` for value axes) win:
 *
 * ```ts
 * axisLabel: {
 *   ...buildResponsiveAxisLabel({ breakpoint, labelCount }),
 *   color: textSecondary, // wrapper-specific
 * }
 * ```
 */
export function buildResponsiveAxisLabel(
  params: BuildResponsiveAxisLabelParams,
): ResponsiveAxisLabelOption {
  const {
    breakpoint,
    labelCount,
    densityFontMultiplier = 1,
    baseFontSize = 11,
    truncateAt,
  } = params;

  // Codex REVISE rule: interval is driven by label count, not breakpoint.
  // Desktop with 100 categories still needs 'auto' to skip overlapping ticks.
  const interval: 0 | 'auto' = labelCount <= AXIS_LABEL_INTERVAL_THRESHOLD ? 0 : 'auto';

  // Mobile-only rotation: don't rotate on tablet/desktop because the chart
  // grid has enough horizontal real estate.
  const rotate =
    breakpoint === 'mobile' && labelCount > AXIS_LABEL_MOBILE_ROTATE_THRESHOLD ? 30 : 0;

  // Mobile shrinks fonts to 10px regardless of density (already small);
  // tablet/desktop respect the density multiplier.
  const fontSize =
    breakpoint === 'mobile'
      ? Math.max(9, Math.round(baseFontSize * 0.9))
      : Math.round(baseFontSize * densityFontMultiplier);

  const formatter =
    typeof truncateAt === 'number' && truncateAt > 0
      ? (value: string) =>
          value.length > truncateAt ? `${value.slice(0, Math.max(1, truncateAt - 1))}…` : value
      : undefined;

  return {
    fontSize,
    hideOverlap: true,
    interval,
    rotate,
    ...(formatter ? { formatter } : {}),
  };
}
