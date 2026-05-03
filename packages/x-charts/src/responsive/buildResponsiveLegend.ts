/**
 * buildResponsiveLegend — pure ECharts legend option builder
 *
 * Replaces the inline `legend: { ... }` blocks in BarChart/LineChart/etc.
 * with one source of truth that knows how to:
 *
 *   - Switch to scroll mode (`type: 'scroll'`) when a legend would otherwise
 *     run out of horizontal space (many series, narrow viewport).
 *   - Move the legend to a vertical right-aligned strip on mobile when the
 *     series count is large (>5) so it doesn't eat half the chart.
 *   - Keep the bottom-anchored horizontal legend on tablet/desktop, matching
 *     the existing wrapper convention so visual diff stays bounded.
 *
 * Codex REVISE 019defa5: the existing `useResponsiveLegend` hook didn't
 * understand `showLegend` or anchor (`bottom`). This helper takes both as
 * input so wrappers can keep their explicit "show legend below the chart"
 * defaults while still gaining responsive collapse.
 */

import type { Breakpoint } from '../useResponsiveChart';

/* ------------------------------------------------------------------ */
/*  Public params                                                      */
/* ------------------------------------------------------------------ */

export interface BuildResponsiveLegendParams {
  /** Active breakpoint resolved by useResponsiveBreakpoint. */
  breakpoint: Breakpoint;
  /** Whether the wrapper's `showLegend` prop is on. */
  showLegend: boolean;
  /** Whether the wrapper has multiple series. */
  hasMultiSeries: boolean;
  /** Number of legend entries (= series count for line/bar, slice count for pie). */
  seriesCount: number;
  /**
   * Density multipliers so item width/height shrink in compact density mode.
   * @default 1
   */
  densitySpacingMultiplier?: number;
  /** @default 1 */
  densityFontMultiplier?: number;
  /**
   * Truncation cap for series names (e.g. 24 chars). Tooltip / aria still
   * receive the original name. `undefined` = no truncation.
   */
  truncateAt?: number;
  /** Icon shape. Falls back to `roundRect` for line/bar, `circle` for pie. */
  icon?: 'roundRect' | 'circle';
}

/* ------------------------------------------------------------------ */
/*  Output shape                                                       */
/* ------------------------------------------------------------------ */

export interface ResponsiveLegendOption {
  show: boolean;
  type: 'plain' | 'scroll';
  orient: 'horizontal' | 'vertical';
  bottom?: number;
  right?: number;
  top?: string | number;
  icon: 'roundRect' | 'circle';
  itemWidth: number;
  itemHeight: number;
  itemGap: number;
  textStyle: { fontSize: number };
  formatter?: (name: string) => string;
}

/* ------------------------------------------------------------------ */
/*  Heuristics                                                         */
/* ------------------------------------------------------------------ */

/**
 * Above this series count, mobile flips legend to vertical-right-scroll
 * because a horizontal legend would wrap into 3+ rows and steal chart space.
 */
export const LEGEND_VERTICAL_SCROLL_THRESHOLD = 5;

/**
 * Above this series count, desktop also switches to `type: 'scroll'`
 * (still bottom-horizontal) so the legend gets pagination arrows instead
 * of overflowing into a second row.
 */
export const LEGEND_HORIZONTAL_SCROLL_THRESHOLD = 8;

/* ------------------------------------------------------------------ */
/*  Builder                                                            */
/* ------------------------------------------------------------------ */

export function buildResponsiveLegend(params: BuildResponsiveLegendParams): ResponsiveLegendOption {
  const {
    breakpoint,
    showLegend,
    hasMultiSeries,
    seriesCount,
    densitySpacingMultiplier = 1,
    densityFontMultiplier = 1,
    truncateAt,
    icon = 'roundRect',
  } = params;

  const show = showLegend || hasMultiSeries;
  const baseItemWidth = Math.round(12 * densitySpacingMultiplier);
  const baseItemHeight = Math.round(8 * densitySpacingMultiplier);
  const baseFontSize = Math.round(12 * densityFontMultiplier);

  const formatter =
    typeof truncateAt === 'number' && truncateAt > 0
      ? (name: string) =>
          name.length > truncateAt ? `${name.slice(0, Math.max(1, truncateAt - 1))}…` : name
      : undefined;

  // Mobile: many series → vertical right-aligned scroll. Few series → still
  // horizontal bottom but scroll-typed so series with long names paginate.
  if (breakpoint === 'mobile') {
    if (seriesCount > LEGEND_VERTICAL_SCROLL_THRESHOLD) {
      return {
        show,
        type: 'scroll',
        orient: 'vertical',
        right: 0,
        top: 'middle',
        icon,
        itemWidth: Math.max(8, baseItemWidth - 2),
        itemHeight: Math.max(6, baseItemHeight - 2),
        itemGap: 8,
        textStyle: { fontSize: Math.max(10, baseFontSize - 2) },
        ...(formatter ? { formatter } : {}),
      };
    }

    return {
      show,
      type: 'scroll',
      orient: 'horizontal',
      bottom: 0,
      icon,
      itemWidth: Math.max(8, baseItemWidth - 2),
      itemHeight: Math.max(6, baseItemHeight - 2),
      itemGap: 10,
      textStyle: { fontSize: Math.max(10, baseFontSize - 1) },
      ...(formatter ? { formatter } : {}),
    };
  }

  // Tablet: same as desktop visually but slightly tighter spacing.
  // Desktop: full horizontal bottom legend; switch to scroll when entry
  // count would otherwise overflow the chart width.
  const useScroll = seriesCount > LEGEND_HORIZONTAL_SCROLL_THRESHOLD;
  return {
    show,
    type: useScroll ? 'scroll' : 'plain',
    orient: 'horizontal',
    bottom: 0,
    icon,
    itemWidth: baseItemWidth,
    itemHeight: baseItemHeight,
    itemGap: breakpoint === 'tablet' ? 12 : 16,
    textStyle: { fontSize: baseFontSize },
    ...(formatter ? { formatter } : {}),
  };
}
