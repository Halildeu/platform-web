/**
 * Barrel for the `echarts-wordcloud` lazy-load gate (Faz 21.11
 * Campaign 5 — Codex thread 019e4351).
 */
export {
  registerEChartsWordCloud,
  isEChartsWordCloudRegistered,
  __resetEChartsWordCloudRegistrationForTests,
} from './registerEChartsWordCloud';
export {
  useRequiredEChartsWordCloud,
  describeEChartsWordCloudReason,
} from './useRequiredEChartsWordCloud';
export type {
  EChartsWordCloudStatus,
  EChartsWordCloudUnsupportedReason,
  UseRequiredEChartsWordCloudOptions,
  UseRequiredEChartsWordCloudResult,
} from './useRequiredEChartsWordCloud';
