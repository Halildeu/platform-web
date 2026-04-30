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
  buildCanonicalRegistry,
  computeProvenance,
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

/* ---------------------------------------------------------------- */
/*  Faz 21.6 PR-B — provenance (canonicalId/status/replacedBy)      */
/* ---------------------------------------------------------------- */

const DUPLICATE_NAMES = [
  'BarChart',
  'LineChart',
  'AreaChart',
  'PieChart',
  'FunnelChart',
  'GaugeChart',
  'RadarChart',
  'TreemapChart',
  'WaterfallChart',
];

describe('buildCanonicalRegistry', () => {
  it('maps every x-charts component name to its canonical x-charts id', () => {
    const all = findAllComponents(null, null);
    const registry = buildCanonicalRegistry(all);
    expect(registry.size).toBe(13);
    for (const name of X_CHARTS_CANONICAL) {
      expect(registry.get(name)).toBe(`@mfe/x-charts/${name}`);
    }
  });

  it('does not include design-system components', () => {
    const all = findAllComponents(null, null);
    const registry = buildCanonicalRegistry(all);
    expect(registry.has('Button')).toBe(false);
    expect(registry.has('OrgChart')).toBe(false);
    expect(registry.has('ControlChart')).toBe(false);
  });
});

describe('computeProvenance — x-charts entries', () => {
  it('every x-charts entry → status="canonical", canonicalId="@mfe/x-charts/<name>", replacedBy=null', () => {
    const all = findAllComponents(null, null);
    const registry = buildCanonicalRegistry(all);
    const xc = all.filter((c: { packageId: string }) => c.packageId === 'x-charts');
    expect(xc).toHaveLength(13);
    xc.forEach((cmp: { name: string }) => {
      const p = computeProvenance(cmp, registry);
      expect(p.status).toBe('canonical');
      expect(p.canonicalId).toBe(`@mfe/x-charts/${cmp.name}`);
      expect(p.replacedBy).toBeNull();
    });
  });
});

describe('computeProvenance — DS legacy duplicates', () => {
  it('the 9 duplicate DS chart names → status="legacy"', () => {
    const all = findAllComponents(null, null);
    const registry = buildCanonicalRegistry(all);
    for (const dupName of DUPLICATE_NAMES) {
      const dsCmp = all.find(
        (c: { packageId: string; name: string }) =>
          c.packageId === 'design-system' && c.name === dupName,
      );
      expect(dsCmp, `DS ${dupName} should exist in scan`).toBeDefined();
      const p = computeProvenance(dsCmp!, registry);
      expect(p.status).toBe('legacy');
      expect(p.canonicalId).toBe(`@mfe/x-charts/${dupName}`);
      expect(p.replacedBy).toBe(`@mfe/x-charts/${dupName}`);
    }
  });

  it('legacy canonicalId === replacedBy (point to canonical target)', () => {
    const all = findAllComponents(null, null);
    const registry = buildCanonicalRegistry(all);
    for (const dupName of DUPLICATE_NAMES) {
      const dsCmp = all.find(
        (c: { packageId: string; name: string }) =>
          c.packageId === 'design-system' && c.name === dupName,
      );
      const p = computeProvenance(dsCmp!, registry);
      expect(p.canonicalId).toBe(p.replacedBy);
    }
  });
});

describe('computeProvenance — DS unique components', () => {
  it('DS components without x-charts duplicate → status="canonical", DS canonicalId, replacedBy=null', () => {
    const all = findAllComponents(null, null);
    const registry = buildCanonicalRegistry(all);
    const samples = ['ControlChart', 'OrgChart', 'BulletChart', 'ParetoChart', 'HistogramChart'];
    for (const name of samples) {
      const cmp = all.find(
        (c: { packageId: string; name: string }) =>
          c.packageId === 'design-system' && c.name === name,
      );
      expect(cmp, `DS unique ${name} should exist`).toBeDefined();
      const p = computeProvenance(cmp!, registry);
      expect(p.status).toBe('canonical');
      expect(p.canonicalId).toBe(`@mfe/design-system/${name}`);
      expect(p.replacedBy).toBeNull();
    }
  });
});

describe('Codex iter-20 pinned counts', () => {
  // findAllComponents returns RAW scan (no lineCount<15 post-filter applied).
  // The main scorecard loop applies that filter, so scorecard.json on disk has
  // 1 fewer entry. Both numbers are pinned: raw scan invariant + post-filter
  // invariant (the latter via integration scorecard.json check).
  it('raw scan total is 232 (218 DS raw + 13 x-charts + 1 small-file passthrough)', () => {
    const all = findAllComponents(null, null);
    expect(all).toHaveLength(232);
  });

  it('raw scan canonical count is 223 (legacy=9, canonical=223 → total 232)', () => {
    const all = findAllComponents(null, null);
    const registry = buildCanonicalRegistry(all);
    let canonicalCount = 0;
    for (const cmp of all) {
      const p = computeProvenance(cmp, registry);
      if (p.status === 'canonical') canonicalCount++;
    }
    expect(canonicalCount).toBe(223);
  });

  it('legacy count is exactly 9 — the duplicate chart names (lineCount-independent)', () => {
    const all = findAllComponents(null, null);
    const registry = buildCanonicalRegistry(all);
    const legacy = all
      .map((cmp: unknown) => ({
        cmp,
        prov: computeProvenance(cmp, registry),
      }))
      .filter((row: { prov: { status: string } }) => row.prov.status === 'legacy');
    expect(legacy).toHaveLength(9);
    const legacyNames = legacy.map(({ cmp }: { cmp: { name: string } }) => cmp.name).sort();
    expect(legacyNames).toEqual([...DUPLICATE_NAMES].sort());
  });
});
