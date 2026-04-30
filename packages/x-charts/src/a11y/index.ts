/**
 * A11y — Chart accessibility utilities
 *
 * @see chart-viz-engine-selection D-009
 */
export { ChartKeyboardNav } from './ChartKeyboardNav';
export type { ChartKeyboardNavProps } from './ChartKeyboardNav';

export { ChartDataTable } from './ChartDataTable';
export type { ChartDataTableProps, ChartDataTableColumn } from './ChartDataTable';

export { ChartAriaLive } from './ChartAriaLive';
export type { ChartAriaLiveProps } from './ChartAriaLive';

export { useReducedMotion } from './useReducedMotion';

// Faz 21.5-B PR-B1 — Codex iter-7 hibrit pattern: default-on a11y composer.
export { useChartA11y } from './useChartA11y';
export type {
  UseChartA11yOptions,
  UseChartA11yResult,
  ChartA11yKind,
  ChartA11yDataPoint,
  ChartA11yContainerProps,
  HiddenDataTablePayload,
} from './useChartA11y';
