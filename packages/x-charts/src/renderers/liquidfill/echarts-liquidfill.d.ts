/**
 * Ambient module declaration for `echarts-liquidfill@~3.1.0`.
 *
 * The upstream package ships no TypeScript declarations of its own —
 * it self-registers a `'liquidFill'` series type on ECharts core when
 * its entry module evaluates (side-effect import). The lazy registrar
 * in `registerEChartsLiquidFill.ts` consumes it as a side-effect, so
 * we only need a minimal `declare module` to unblock the dynamic
 * import call site.
 *
 * Codex thread 019e4301 iter-1: side-effect import keeps the wrapper
 * out of the initial shell chunk; static `import 'echarts-liquidfill'`
 * is forbidden by the bundle-guard test (same posture as echarts-gl).
 */
declare module 'echarts-liquidfill';
