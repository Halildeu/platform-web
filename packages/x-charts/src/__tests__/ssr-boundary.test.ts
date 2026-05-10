/**
 * Faz 21.8 PR-X2 — T4 boundary smoke.
 *
 * Verifies the new package subpath strategy actually resolves and that
 * `@mfe/x-charts/ssr` stays free of DOM / ECharts side effects so it can be
 * imported from a Next.js server component (or any Node-only consumer)
 * without crashing.
 *
 * Mutation discipline:
 *   - "drop ./client export entry"      → clientImport (BarChart undefined)
 *   - "drop ./ssr export entry"         → ssrImport (resolution fails)
 *   - "leak echarts into ssr/index"     → ssrIsServerSafe (test would
 *                                          throw the moment echarts touches
 *                                          window/document during import)
 *   - "drop 'use client' from wrapper"  → useClientPresentInClient (string
 *                                          check on the source file)
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Type-only import smoke (Codex iter-2 PR-X2 fix): if any of these are
// dropped from the documented `@mfe/x-charts/ssr` surface, the test file
// itself fails to compile — a far stronger signal than string-matching.
import type {
  ChartSpec,
  ChartType,
  ChartChannel,
  ChartEncoding,
  DrillDownLevel,
  BarChartProps,
  LineChartProps,
  PieChartProps,
  AreaChartProps,
  CrossFilterEntry,
  DrillLevel,
  HistoryEntry,
  AccessLevel,
  AccessControlledProps,
  // Faz 21.11 P1a — 3D Extension Pack public type surface.
  Scatter3DProps,
  Scatter3DDataPoint,
  // Faz 21.11 P1b — Surface3D + Lines3D type-only surface.
  Surface3DProps,
  Surface3DDataPoint,
  Lines3DProps,
  Lines3DPath,
} from '@mfe/x-charts/ssr';

// Reference each one so the imports are not pruned as unused. The
// declaration is type-only, so it has zero runtime cost.
type _SSRTypeSurfaceSmoke = [
  ChartSpec,
  ChartType,
  ChartChannel,
  ChartEncoding,
  DrillDownLevel,
  BarChartProps,
  LineChartProps,
  PieChartProps,
  AreaChartProps,
  CrossFilterEntry,
  DrillLevel,
  HistoryEntry,
  AccessLevel,
  AccessControlledProps,
  Scatter3DProps,
  Scatter3DDataPoint,
  Surface3DProps,
  Surface3DDataPoint,
  Lines3DProps,
  Lines3DPath,
];

describe('@mfe/x-charts package boundary (Faz 21.8 PR-X2)', () => {
  it("clientImport: '@mfe/x-charts/client' resolves and exposes BarChart", async () => {
    const mod = await import('@mfe/x-charts/client');
    expect(mod.BarChart).toBeDefined();
    expect(mod.LineChart).toBeDefined();
    expect(mod.PieChart).toBeDefined();
    // 13 wrappers + composites
    expect(typeof mod.BarChart).toBe('object'); // forwardRef = object with $$typeof
    expect(mod.ChartContainer).toBeDefined();
    expect(mod.ChartDashboard).toBeDefined();
  });

  it("ssrImport: '@mfe/x-charts/ssr' resolves without DOM access", async () => {
    // Importing this should NOT throw — type-only re-exports + a tiny set of
    // pure runtime constants (PR3a: chart-size contract). If this test ever
    // fails due to a "window is not defined" style error, someone has
    // accidentally dragged echarts/DOM into the SSR barrel and the boundary
    // is broken.
    const ssrMod = await import('@mfe/x-charts/ssr');
    expect(ssrMod).toBeDefined();
    // The SSR barrel must not export runtime React components — only types
    // (erased at runtime) and pure constants. Wrapper components and the
    // ChartContainer card should NOT be reachable here.
    expect((ssrMod as Record<string, unknown>).BarChart).toBeUndefined();
    expect((ssrMod as Record<string, unknown>).ChartContainer).toBeUndefined();
  });

  it("ssrChartCanvasHeight: '@mfe/x-charts/ssr' exposes the chart-size contract", async () => {
    // Faz 21.9 PR3a (Codex thread `019defa5`): RSC consumers that pre-compute
    // layout space need the canvas-height map without dragging the runtime
    // wrappers. The constant must be reachable through the SSR barrel and
    // hold its canonical values.
    const ssrMod = await import('@mfe/x-charts/ssr');
    const map = (ssrMod as Record<string, unknown>).CHART_CANVAS_HEIGHT as
      | Record<string, number>
      | undefined;
    expect(map).toBeDefined();
    expect(map!.sm).toBe(200);
    expect(map!.md).toBe(300);
    expect(map!.lg).toBe(400);
    const order = (ssrMod as Record<string, unknown>).CHART_SIZE_ORDER as
      | readonly string[]
      | undefined;
    expect(order).toEqual(['sm', 'md', 'lg']);
  });

  it("useClientPresentInClient: every chart wrapper has 'use client' as its first directive", () => {
    const wrappers = [
      'AreaChart',
      'BarChart',
      'FunnelChart',
      'GaugeChart',
      'HeatmapChart',
      'LineChart',
      'PieChart',
      'RadarChart',
      'SankeyChart',
      'ScatterChart',
      'SunburstChart',
      'TreemapChart',
      'WaterfallChart',
      // Faz 21.11 P1a — 3D Extension Pack. Each new 3D wrapper has
      // to start with the `'use client'` directive so it stays out
      // of the SSR subpath. P1c adds Globe.
      'Scatter3D',
      // Faz 21.11 P1b — Surface3D + Lines3D wrappers. Codex thread
      // `019e10d7` iter-2.
      'Surface3D',
      'Lines3D',
    ];
    const srcDir = path.resolve(__dirname, '..');
    const missing: string[] = [];
    for (const name of wrappers) {
      const filePath = path.join(srcDir, `${name}.tsx`);
      const src = fs.readFileSync(filePath, 'utf8');
      const firstStatement = src.split('\n')[0].trim();
      if (firstStatement !== "'use client';" && firstStatement !== '"use client";') {
        missing.push(name);
      }
    }
    expect(missing).toEqual([]);
  });

  it("clientBarrelHasUseClient: client/index.ts itself starts with 'use client'", () => {
    const filePath = path.resolve(__dirname, '../client/index.ts');
    const src = fs.readFileSync(filePath, 'utf8');
    expect(src.split('\n')[0].trim()).toMatch(/['"]use client['"];?/);
  });

  it("ssrBarrelHasNoUseClient: ssr/index.ts is server-safe (no 'use client' directive at any non-comment site)", () => {
    // Codex iter-1 PR-X2 review: the previous version of this test only
    // matched the first non-empty-non-`/*` line, which a leading docblock
    // could mask. Strip block + line comments first, then assert the first
    // real statement is NOT a use-client directive AND the directive does
    // not appear anywhere as a top-level statement.
    const filePath = path.resolve(__dirname, '../ssr/index.ts');
    const raw = fs.readFileSync(filePath, 'utf8');
    // Strip /* ... */ block comments
    const noBlockComments = raw.replace(/\/\*[\s\S]*?\*\//g, '');
    // Strip // line comments
    const noComments = noBlockComments.replace(/^\s*\/\/.*$/gm, '');
    const lines = noComments
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    // First real statement must not be the directive
    expect(lines[0]).not.toMatch(/['"]use client['"];?/);
    // And the directive must not appear as a standalone top-level statement
    // anywhere (a string in JSDoc would have been stripped above).
    const hasDirective = lines.some((l) => /^['"]use client['"];?$/.test(l));
    expect(hasDirective).toBe(false);
  });

  it('ssrTypeSurface: ssr/index.ts exports ChartSpec + chart wrapper prop types (Codex iter-1 PR-X2 fix)', () => {
    // Codex flagged that the documented RSC example imports ChartSpec, but
    // the barrel did not export it. This test enforces the documented
    // surface by string-matching the export declarations. A type-level
    // tsc smoke would be stronger; this is the closest signal we can run
    // inside vitest without introducing a new build step.
    const filePath = path.resolve(__dirname, '../ssr/index.ts');
    const src = fs.readFileSync(filePath, 'utf8');
    const required = [
      // From ChartSpec
      'ChartSpec',
      'ChartType',
      'ChartChannel',
      'ChartEncoding',
      'DrillDownLevel',
      // Wrapper prop types
      'BarChartProps',
      'LineChartProps',
      'PieChartProps',
      'AreaChartProps',
      // Cross-filter
      'CrossFilterEntry',
      'DrillLevel',
      'HistoryEntry',
      // Access vocabulary
      'AccessLevel',
      'AccessControlledProps',
    ];
    const missing = required.filter((name) => !new RegExp(`\\b${name}\\b`).test(src));
    expect(missing).toEqual([]);
  });
});
