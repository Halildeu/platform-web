/**
 * Ambient module declaration for `echarts-gl@2.x`.
 *
 * `echarts-gl` ships only a single CommonJS bundle (`dist/echarts-gl.js`)
 * with no exports map and no `.d.ts` files. The package's runtime
 * contract is "side-effect import that registers WebGL series + 3D
 * components on the global ECharts core namespace" — there is no API
 * we type-check at the call site.
 *
 * This declaration tells TypeScript "trust me, this module exists; its
 * shape is `any`" so the dynamic
 *
 *   await import('echarts-gl');
 *
 * call inside `registerEChartsGL.ts` type-checks without
 * `// @ts-ignore`. The `.d.ts` file itself is type-only and ships
 * nothing to the runtime bundle.
 *
 * Codex review thread `019e0e7a` iter-PR-A1: TS7016 fix.
 */
declare module 'echarts-gl';
