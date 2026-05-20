/**
 * Ambient module declaration for `echarts-wordcloud@~2.1.0`.
 *
 * Upstream ships no TypeScript declarations — package self-registers a
 * `'wordCloud'` series type on ECharts core when its entry module
 * evaluates (side-effect import). Lazy registrar in
 * `registerEChartsWordCloud.ts` consumes it as a side-effect; this
 * minimal `declare module` unblocks the dynamic import call site.
 *
 * Codex thread 019e4351 iter-1: side-effect import keeps the chunk out
 * of the initial shell; static `import 'echarts-wordcloud'` is
 * forbidden by `bundle-guard.test.ts` (same posture as echarts-gl +
 * echarts-liquidfill).
 */
declare module 'echarts-wordcloud';
