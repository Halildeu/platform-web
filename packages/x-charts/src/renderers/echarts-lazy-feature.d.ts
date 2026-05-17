/**
 * Ambient module declarations for the lazy ECharts feature modules.
 *
 * echarts@5.6 ships `lib/chart/<name>.js` side-effect modules but NO
 * adjacent `.d.ts` for them — module types live only in the
 * `types/dist/*` bundle that the `echarts/charts` barrel resolves to.
 * The PR-X16 depth-chart campaign dynamic-imports the direct
 * `echarts/lib/chart/<name>` path (see `registerEChartsFeature.ts`); it
 * is a side-effect import whose resolved module value we never
 * dereference.
 *
 * These declarations tell TypeScript "this module exists; its shape is
 * `any`" so the dynamic `import('echarts/lib/chart/tree')` type-checks
 * without `// @ts-ignore` under `strict` + classic `Node` resolution
 * (TS7016 fix — echarts has no declaration file at that path). This
 * `.d.ts` is type-only and ships nothing to the runtime bundle.
 *
 * One `declare module` line per lazy feature module — a chart series
 * (`echarts/lib/chart/<name>`) or a coordinate-system component
 * (`echarts/lib/component/<name>`).
 *
 * @see renderers/gl/echarts-gl.d.ts — the GL-pack sibling.
 */
declare module 'echarts/lib/chart/tree';
// PR-X16b-prep — niche charts converted from eager to lazy registration.
declare module 'echarts/lib/chart/graph';
declare module 'echarts/lib/chart/parallel';
declare module 'echarts/lib/component/parallel';
declare module 'echarts/lib/chart/pictorialBar';
declare module 'echarts/lib/chart/candlestick';
declare module 'echarts/lib/chart/boxplot';
// PR-X16b — calendar coordinate-system component for CalendarHeatmap.
declare module 'echarts/lib/component/calendar';
