export { useAutoGranularity } from './useAutoGranularity';
export type { GranularityLevel, AutoGranularityOptions } from './useAutoGranularity';
export { useResponsiveLegend } from './useResponsiveLegend';
export { useResponsiveChartType } from './useResponsiveChartType';

// Pure ECharts option-fragment builders. Wrappers spread these into their
// `useMemo` option blocks so collision/overflow management stays consistent
// across the 13 chart wrappers without copy-pasting heuristics.
export {
  buildResponsiveAxisLabel,
  AXIS_LABEL_INTERVAL_THRESHOLD,
  AXIS_LABEL_MOBILE_ROTATE_THRESHOLD,
} from './buildResponsiveAxisLabel';
export type {
  BuildResponsiveAxisLabelParams,
  ResponsiveAxisLabelOption,
} from './buildResponsiveAxisLabel';

export {
  buildResponsiveLegend,
  LEGEND_VERTICAL_SCROLL_THRESHOLD,
  LEGEND_HORIZONTAL_SCROLL_THRESHOLD,
} from './buildResponsiveLegend';
export type { BuildResponsiveLegendParams, ResponsiveLegendOption } from './buildResponsiveLegend';

export { buildResponsiveGrid } from './buildResponsiveGrid';
export type { BuildResponsiveGridParams, ResponsiveGridOption } from './buildResponsiveGrid';

export { buildResponsiveDataZoom } from './buildResponsiveDataZoom';
export type {
  BuildResponsiveDataZoomParams,
  ResponsiveDataZoomOption,
} from './buildResponsiveDataZoom';
