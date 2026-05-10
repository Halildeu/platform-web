/**
 * Public entry for the GL renderer namespace. Importing this file
 * itself is safe — it only re-exports lazy registration helpers and
 * does NOT pull in `echarts-gl`. The actual ~150 KB chunk only
 * downloads on the first {@link registerEChartsGL} call.
 *
 * Faz 21.11 PR-A1 — Big Data Renderer Router, WebGL Million-Point Path.
 */
export {
  registerEChartsGL,
  isEChartsGLRegistered,
  resetEChartsGLRegistration,
} from './registerEChartsGL';
export {
  useRequiredEChartsGL,
  type EChartsGLStatus,
  type EChartsGLUnsupportedReason,
  type UseRequiredEChartsGLOptions,
  type UseRequiredEChartsGLResult,
} from './useRequiredEChartsGL';
