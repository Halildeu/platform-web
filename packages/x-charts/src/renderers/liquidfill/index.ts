/**
 * Barrel for the `echarts-liquidfill` lazy-load gate (Faz 21.11
 * Campaign 4 — Codex thread 019e4301).
 */
export {
  registerEChartsLiquidFill,
  isEChartsLiquidFillRegistered,
  __resetEChartsLiquidFillRegistrationForTests,
} from './registerEChartsLiquidFill';
export {
  useRequiredEChartsLiquidFill,
  describeEChartsLiquidFillReason,
} from './useRequiredEChartsLiquidFill';
export type {
  EChartsLiquidFillStatus,
  EChartsLiquidFillUnsupportedReason,
  UseRequiredEChartsLiquidFillOptions,
  UseRequiredEChartsLiquidFillResult,
} from './useRequiredEChartsLiquidFill';
