export { registerECharts, echarts } from './echarts-imports';
export type { ECharts, EChartsOption } from './echarts-imports';
export { useEChartsRenderer } from './echarts-renderer';
export type { EChartsRendererOptions, EChartsRendererState } from './echarts-renderer';

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
