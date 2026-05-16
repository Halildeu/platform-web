export { registerECharts, echarts } from './echarts-imports';
export type { ECharts, EChartsOption } from './echarts-imports';
export { useEChartsRenderer } from './echarts-renderer';
export type { EChartsRendererOptions, EChartsRendererState } from './echarts-renderer';

// PR-X16 ECharts Depth campaign — lazy feature registration. Depth
// charts (Tree, and later Calendar/Polar/ThemeRiver/Gantt) keep their
// ECharts modules OUT of the eager base register so the CONTRACT §8
// bundle gate stays under cap; the wrapper lazy-loads its feature on
// first mount via `useRequiredEChartsFeature`.
export {
  ensureEChartsFeatureRegistered,
  isEChartsFeatureRegistered,
  resetEChartsFeatureRegistration,
  markEChartsFeatureRegisteredForTest,
} from './registerEChartsFeature';
export type { EChartsFeature } from './registerEChartsFeature';
export { useRequiredEChartsFeature } from './useRequiredEChartsFeature';
export type {
  EChartsFeatureStatus,
  UseRequiredEChartsFeatureOptions,
  UseRequiredEChartsFeatureResult,
} from './useRequiredEChartsFeature';

// Faz 21.11 PR-A0: Big Data Renderer Router (Codex thread 019e0e7a).
export { detectWebGLCapability, resetWebGLCapabilityCache } from './detectWebGLCapability';
export { chooseRenderer } from './chooseRenderer';
export {
  AUTO_WEBGL_POINT_THRESHOLD,
  CANVAS_LTTB_POINT_THRESHOLD,
  CROSS_FILTER_WEBGL_MAX_POINTS,
} from './types';
export type {
  ChooseRendererInput,
  CrossFilterCapability,
  CrossFilterCapabilityEvent,
  RendererBackend,
  RendererDecision,
  RendererFallbackEvent,
  RendererMode,
  WebGLCapability,
} from './types';
