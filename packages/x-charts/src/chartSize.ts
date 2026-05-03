/**
 * chartSize — single-source-of-truth for the chart-size axis
 *
 * Faz 21.9 PR3a (Codex thread `019defa5`): the `ChartSize` type already
 * lived in `types.ts`, but the *runtime* `SIZE_HEIGHT: Record<ChartSize, number>`
 * map was duplicated inside every chart wrapper (13 copies) and once more
 * inside `mfe-shell/ChartPreviewLive`. Whenever any consumer wanted to
 * reason about preview heights ("the canvas is exactly N px tall for size
 * S") they had to either import the wrapper (heavy) or copy the literal
 * (drift).
 *
 * This module exposes:
 *   - `ChartSize` type (re-exported from `types.ts` so legacy imports keep
 *     working)
 *   - `CHART_CANVAS_HEIGHT` runtime map — the contract every wrapper now
 *     reads from
 *   - `CHART_SIZE_ORDER` — ordered axis for clamp helpers
 *
 * NOTE: This is a runtime module (not type-only). Keep it tiny — no
 * React, no ECharts imports — so consumers from any layer (RSC,
 * design-lab, tests) can pull it without dragging the renderer in.
 */

import type { ChartSize } from './types';

export type { ChartSize };

/**
 * The canvas height every wrapper renders for a given `size` prop.
 * Keep these numbers PINNED — bumping them is a public-API change that
 * cascades into design-lab preview sizing, Storybook visual snapshots,
 * and any consumer that pre-computes layout space for a chart card.
 */
export const CHART_CANVAS_HEIGHT: Record<ChartSize, number> = {
  sm: 200,
  md: 300,
  lg: 400,
};

/**
 * Ordered size axis — used by clamp helpers (`clampChartSize`) to walk
 * from `'sm'` (smallest) to `'lg'` (largest). Order matters; do not
 * alphabetise.
 */
export const CHART_SIZE_ORDER: readonly ChartSize[] = ['sm', 'md', 'lg'] as const;
