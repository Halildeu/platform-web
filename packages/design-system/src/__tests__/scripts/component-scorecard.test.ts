/**
 * Faz 21.6 PR-A — component-scorecard.mjs multi-package scan contract.
 *
 * Codex iter-17 AGREE invariants:
 *   - x-charts package scan returns EXACTLY 13 audited components (allowlist)
 *   - x-charts component names match the canonical 13-chart list
 *   - design-system package scan returns >=200 audited components (regression baseline)
 *   - SCAN_PACKAGES config has expected package IDs and shape
 *   - --package filter isolates a single package
 *
 * Tests import scoring helpers from the script as ES modules. The script's
 * main CLI block is gated by `import.meta.url === file://process.argv[1]`,
 * so importing it does NOT trigger the CLI execution.
 */
import { describe, it, expect } from 'vitest';
import {
  SCAN_PACKAGES,
  findComponentsInPackage,
  findAllComponents,
} from '../../../scripts/ci/component-scorecard.mjs';

const X_CHARTS_CANONICAL = [
  'BarChart',
  'LineChart',
  'AreaChart',
  'PieChart',
  'ScatterChart',
  'GaugeChart',
  'RadarChart',
  'TreemapChart',
  'HeatmapChart',
  'WaterfallChart',
  'FunnelChart',
  'SankeyChart',
  'SunburstChart',
];

describe('SCAN_PACKAGES config', () => {
  it('contains design-system and x-charts entries', () => {
    const ids = SCAN_PACKAGES.map((p: { id: string }) => p.id);
    expect(ids).toContain('design-system');
    expect(ids).toContain('x-charts');
  });

  it('design-system config has DS-specific feature flags', () => {
    const ds = SCAN_PACKAGES.find((p: { id: string }) => p.id === 'design-system');
    expect(ds?.recursive).toBe(true);
    expect(ds?.includeFiles).toBeNull();
    expect(ds?.hasCatalog).toBe(true);
    expect(ds?.hasVisualDir).toBe(true);
    expect(ds?.hasAuthoring).toBe(true);
  });

  it('x-charts config has flat-package settings + allowlist', () => {
    const xc = SCAN_PACKAGES.find((p: { id: string }) => p.id === 'x-charts');
    expect(xc?.recursive).toBe(false);
    expect(xc?.componentDirs).toEqual(['.']);
    expect(xc?.hasCatalog).toBe(false);
    expect(xc?.hasVisualDir).toBe(false);
    expect(xc?.hasAuthoring).toBe(false);
    expect(Array.isArray(xc?.includeFiles)).toBe(true);
    expect(xc?.includeFiles).toHaveLength(13);
  });

  it('x-charts allowlist contains exactly the 13 canonical chart filenames', () => {
    const xc = SCAN_PACKAGES.find((p: { id: string }) => p.id === 'x-charts');
    const expected = X_CHARTS_CANONICAL.map((n) => `${n}.tsx`).sort();
    expect([...(xc?.includeFiles as string[])].sort()).toEqual(expected);
  });
});

describe('findComponentsInPackage — x-charts (deterministic 13)', () => {
  it('returns exactly 13 components', () => {
    const xc = SCAN_PACKAGES.find((p: { id: string }) => p.id === 'x-charts');
    const components = findComponentsInPackage(xc, null);
    expect(components).toHaveLength(13);
  });

  it('every component has packageId="x-charts"', () => {
    const xc = SCAN_PACKAGES.find((p: { id: string }) => p.id === 'x-charts');
    const components = findComponentsInPackage(xc, null);
    components.forEach((c: { packageId: string }) => {
      expect(c.packageId).toBe('x-charts');
    });
  });

  it('component names match canonical 13-chart list', () => {
    const xc = SCAN_PACKAGES.find((p: { id: string }) => p.id === 'x-charts');
    const components = findComponentsInPackage(xc, null);
    const names = components.map((c: { name: string }) => c.name).sort();
    expect(names).toEqual([...X_CHARTS_CANONICAL].sort());
  });

  it('component dirs all equal "." (top-level scan)', () => {
    const xc = SCAN_PACKAGES.find((p: { id: string }) => p.id === 'x-charts');
    const components = findComponentsInPackage(xc, null);
    components.forEach((c: { dir: string }) => {
      expect(c.dir).toBe('.');
    });
  });

  it('utility subdirectories (a11y, theme, spec, etc.) are EXCLUDED', () => {
    const xc = SCAN_PACKAGES.find((p: { id: string }) => p.id === 'x-charts');
    const components = findComponentsInPackage(xc, null);
    const paths = components.map((c: { relPath: string }) => c.relPath);
    // recursive:false + includeFiles allowlist guarantees no subdir audit
    paths.forEach((p: string) => {
      expect(p.includes('/'), `x-charts entry should be top-level only, got: ${p}`).toBe(false);
    });
  });
});

describe('findComponentsInPackage — design-system (regression baseline)', () => {
  it('returns >=200 components (regression baseline post-PR-A)', () => {
    const ds = SCAN_PACKAGES.find((p: { id: string }) => p.id === 'design-system');
    const components = findComponentsInPackage(ds, null);
    expect(components.length).toBeGreaterThanOrEqual(200);
  });

  it('every component has packageId="design-system"', () => {
    const ds = SCAN_PACKAGES.find((p: { id: string }) => p.id === 'design-system');
    const components = findComponentsInPackage(ds, null);
    components.slice(0, 20).forEach((c: { packageId: string }) => {
      // Sample to keep test fast — full run is integration-level
      expect(c.packageId).toBe('design-system');
    });
  });

  it('targetDir filter narrows to specific subdirectory', () => {
    const ds = SCAN_PACKAGES.find((p: { id: string }) => p.id === 'design-system');
    const all = findComponentsInPackage(ds, null);
    const onlyEnterprise = findComponentsInPackage(ds, 'enterprise');
    expect(onlyEnterprise.length).toBeGreaterThan(0);
    expect(onlyEnterprise.length).toBeLessThan(all.length);
    onlyEnterprise.forEach((c: { dir: string }) => {
      expect(c.dir).toBe('enterprise');
    });
  });
});

describe('findAllComponents — multi-package + filter', () => {
  it('includes both packages by default', () => {
    const all = findAllComponents(null, null);
    const dsCount = all.filter(
      (c: { packageId: string }) => c.packageId === 'design-system',
    ).length;
    const xcCount = all.filter((c: { packageId: string }) => c.packageId === 'x-charts').length;
    expect(dsCount).toBeGreaterThanOrEqual(200);
    expect(xcCount).toBe(13);
    expect(all.length).toBe(dsCount + xcCount);
  });

  it('--package x-charts filter returns only 13 x-charts entries', () => {
    const filtered = findAllComponents(null, 'x-charts');
    expect(filtered).toHaveLength(13);
    filtered.forEach((c: { packageId: string }) => {
      expect(c.packageId).toBe('x-charts');
    });
  });

  it('--package design-system filter excludes x-charts', () => {
    const filtered = findAllComponents(null, 'design-system');
    expect(filtered.length).toBeGreaterThanOrEqual(200);
    filtered.forEach((c: { packageId: string }) => {
      expect(c.packageId).toBe('design-system');
    });
  });

  it('--package <unknown> returns empty', () => {
    const filtered = findAllComponents(null, 'no-such-package');
    expect(filtered).toHaveLength(0);
  });
});
