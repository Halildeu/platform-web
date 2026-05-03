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
    // Importing this should NOT throw — type-only re-exports + no runtime
    // side effects. If this test ever fails due to a "window is not defined"
    // style error, someone has accidentally dragged echarts/DOM into the
    // SSR barrel and the boundary is broken.
    const ssrMod = await import('@mfe/x-charts/ssr');
    expect(ssrMod).toBeDefined();
    // The SSR barrel must not export runtime React components — only types
    // (which are erased at runtime). So `BarChart` (a forwardRef object)
    // should NOT be on it.
    expect((ssrMod as Record<string, unknown>).BarChart).toBeUndefined();
    expect((ssrMod as Record<string, unknown>).ChartContainer).toBeUndefined();
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

  it("ssrBarrelHasNoUseClient: ssr/index.ts is server-safe (no 'use client' directive)", () => {
    const filePath = path.resolve(__dirname, '../ssr/index.ts');
    const src = fs.readFileSync(filePath, 'utf8');
    // First non-empty line should NOT be a use-client directive.
    const firstNonEmpty = src
      .split('\n')
      .find((line) => line.trim().length > 0 && !line.trim().startsWith('/*'));
    expect(firstNonEmpty?.trim()).not.toMatch(/['"]use client['"];?/);
  });
});
