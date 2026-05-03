/**
 * buildResponsiveGrid — pure ECharts grid option builder
 *
 * Returns the `grid` config (top/right/bottom/left + containLabel) that
 * leaves enough room for an optional title strip and bottom legend without
 * letting axis labels get clipped. Density-scaled so compact charts inherit
 * the existing density tightening.
 *
 * Codex REVISE 019defa5: do NOT mass-overwrite grid padding from breakpoint
 * config alone. The existing wrappers compute padding from
 * `(scalePadding × densityMultiplier)`; this helper preserves that pattern,
 * just adds the breakpoint-aware shrink layer on top.
 */

import type { Breakpoint } from '../useResponsiveChart';

/* ------------------------------------------------------------------ */
/*  Public params                                                      */
/* ------------------------------------------------------------------ */

export interface BuildResponsiveGridParams {
  /** Active breakpoint. */
  breakpoint: Breakpoint;
  /** Whether the chart has a title row. */
  hasTitle: boolean;
  /** Whether a bottom legend will steal vertical space. */
  hasBottomLegend: boolean;
  /**
   * Whether the legend has been moved to a vertical right strip (mobile +
   * many series). When true, leave room on the right instead of bottom.
   */
  hasRightLegend?: boolean;
  /**
   * Legacy density paddings — what wrappers used to write inline
   * (`scalePadding(60, densityPaddingMultiplier)`). Pass these so density
   * compact wrappers stay tight.
   */
  density: {
    titleTop: number;
    contentTop: number;
    sidePadding: number;
    legendBottom: number;
    plainBottom: number;
  };
}

/* ------------------------------------------------------------------ */
/*  Output shape                                                       */
/* ------------------------------------------------------------------ */

export interface ResponsiveGridOption {
  top: number;
  right: number;
  bottom: number;
  left: number;
  containLabel: true;
}

/* ------------------------------------------------------------------ */
/*  Builder                                                            */
/* ------------------------------------------------------------------ */

export function buildResponsiveGrid(params: BuildResponsiveGridParams): ResponsiveGridOption {
  const { breakpoint, hasTitle, hasBottomLegend, hasRightLegend, density } = params;

  // Mobile shrink factor — chart canvas is small, every pixel of grid
  // padding eats into the plot area.
  const mobileShrink = breakpoint === 'mobile' ? 0.7 : 1;
  const tabletShrink = breakpoint === 'tablet' ? 0.85 : 1;
  const shrink = mobileShrink * tabletShrink;

  const top = Math.max(16, Math.round((hasTitle ? density.titleTop : density.contentTop) * shrink));

  const bottom = Math.max(
    12,
    Math.round((hasBottomLegend ? density.legendBottom : density.plainBottom) * shrink),
  );

  const baseSide = Math.round(density.sidePadding * shrink);
  const left = Math.max(8, baseSide);
  const right = hasRightLegend ? Math.max(72, Math.round(96 * shrink)) : Math.max(8, baseSide);

  return {
    top,
    right,
    bottom,
    left,
    containLabel: true,
  };
}
