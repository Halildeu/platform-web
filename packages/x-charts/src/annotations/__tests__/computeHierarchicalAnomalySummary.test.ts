/**
 * computeHierarchicalAnomalySummary — pure helper tests
 * (Faz 21.11 batch3 / PR-Hierarchical).
 *
 * Locks the tree-walking IQR detector contract Codex thread
 * `019e1100` PR-Hierarchical iter-1 mandated:
 *   - <4 finite values total → no anomalies
 *   - leaf-only mode by default (inner-node aggregations excluded)
 *   - all-nodes mode opt-in
 *   - normalised severity (rawFenceDistance / observedMaxAbs)
 *   - kind: 'hierarchical' on every emitted summary
 *   - id format `${idPrefix}-${path.join('-')}`
 *   - path[] + depth metadata propagated
 *   - severityHighFraction default 0.25 (precedent uyumu)
 */
import { describe, it, expect } from 'vitest';
import { computeHierarchicalAnomalySummary } from '../computeHierarchicalAnomalySummary';

describe('computeHierarchicalAnomalySummary — empty / tiny inputs', () => {
  it('returns [] when data is empty', () => {
    expect(computeHierarchicalAnomalySummary({ data: [] })).toEqual([]);
  });

  it('skips when fewer than 4 finite leaves are available', () => {
    const out = computeHierarchicalAnomalySummary({
      data: [
        {
          name: 'root',
          children: [
            { name: 'a', value: 10 },
            { name: 'b', value: 11 },
            { name: 'c', value: 100 }, // looks like a spike but n=3
          ],
        },
      ],
    });
    expect(out).toEqual([]);
  });

  it('skips non-finite leaf values silently (NaN/Infinity/undefined)', () => {
    const out = computeHierarchicalAnomalySummary({
      data: [
        {
          name: 'root',
          children: [
            { name: 'a', value: 10 },
            { name: 'b', value: 11 },
            { name: 'c', value: Number.NaN },
            { name: 'd' },
            { name: 'e', value: Number.POSITIVE_INFINITY },
          ],
        },
      ],
    });
    // Only a + b finite → <4 → skip.
    expect(out).toEqual([]);
  });
});

describe('computeHierarchicalAnomalySummary — happy-path detection', () => {
  it('flags an upper-fence leaf with kind=hierarchical metadata + path', () => {
    const out = computeHierarchicalAnomalySummary({
      data: [
        {
          name: 'Q1',
          children: [
            {
              name: 'North',
              children: [
                { name: 'NYC', value: 10 },
                { name: 'BOS', value: 12 },
              ],
            },
            {
              name: 'South',
              children: [
                { name: 'ATL', value: 11 },
                { name: 'MIA', value: 9 },
                { name: 'NOL', value: 500 }, // upper-fence outlier
              ],
            },
          ],
        },
      ],
    });
    expect(out).toHaveLength(1);
    const anom = out[0];
    expect(anom.kind).toBe('hierarchical');
    expect(anom.x).toBe('NOL');
    expect(anom.y).toBe(500);
    expect(anom.direction).toBe('above');
    expect(anom.path).toEqual(['Q1', 'South', 'NOL']);
    expect(anom.depth).toBe(2);
    expect(anom.severityBucket).toBe('high'); // single anomaly is always 'high'
    expect(anom.id).toBe('hierarchy-anomaly-Q1-South-NOL');
  });

  it('flags a lower-fence leaf as direction "below"', () => {
    const out = computeHierarchicalAnomalySummary({
      data: [
        {
          name: 'root',
          children: [
            { name: 'a', value: 50 },
            { name: 'b', value: 51 },
            { name: 'c', value: 52 },
            { name: 'd', value: 49 },
            { name: 'e', value: 53 },
            { name: 'f', value: 1 }, // lower-fence outlier
          ],
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].direction).toBe('below');
    expect(out[0].path).toEqual(['root', 'f']);
  });

  it('walks multiple roots independently', () => {
    const out = computeHierarchicalAnomalySummary({
      data: [
        {
          name: 'tree1',
          children: [
            { name: 'a', value: 10 },
            { name: 'b', value: 11 },
          ],
        },
        {
          name: 'tree2',
          children: [
            { name: 'c', value: 12 },
            { name: 'd', value: 9999 }, // outlier
            { name: 'e', value: 13 },
          ],
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].x).toBe('d');
    expect(out[0].path).toEqual(['tree2', 'd']);
  });

  it('mode="leaf-only" excludes inner-node aggregations', () => {
    const out = computeHierarchicalAnomalySummary({
      mode: 'leaf-only',
      data: [
        {
          name: 'root',
          value: 99999, // inner-node aggregation, MUST be excluded
          children: [
            { name: 'a', value: 10 },
            { name: 'b', value: 11 },
            { name: 'c', value: 12 },
            { name: 'd', value: 13 },
            { name: 'e', value: 100 }, // upper-fence among leaves
          ],
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].x).toBe('e');
    // Root not flagged even though 99999 >> any leaf — its IQR contribution
    // is excluded.
    expect(out.find((a) => a.x === 'root')).toBeUndefined();
  });

  it('mode="all-nodes" includes inner-node aggregations', () => {
    const out = computeHierarchicalAnomalySummary({
      mode: 'all-nodes',
      data: [
        {
          name: 'root',
          value: 99999, // inner-node aggregation INCLUDED
          children: [
            { name: 'a', value: 10 },
            { name: 'b', value: 11 },
            { name: 'c', value: 12 },
            { name: 'd', value: 13 },
          ],
        },
      ],
    });
    // root=99999 is the obvious upper-fence outlier in {99999,10,11,12,13}.
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out.find((a) => a.x === 'root')).toBeDefined();
    expect(out.find((a) => a.x === 'root')!.path).toEqual(['root']);
    expect(out.find((a) => a.x === 'root')!.depth).toBe(0);
  });
});

describe('computeHierarchicalAnomalySummary — id + idPrefix scoping', () => {
  it('default idPrefix produces ids like "hierarchy-anomaly-{path.join(-)}"', () => {
    const out = computeHierarchicalAnomalySummary({
      data: [
        {
          name: 'root',
          children: [
            { name: 'a', value: 10 },
            { name: 'b', value: 11 },
            { name: 'c', value: 12 },
            { name: 'd', value: 13 },
            { name: 'e', value: 999 },
          ],
        },
      ],
    });
    expect(out[0].id).toBe('hierarchy-anomaly-root-e');
  });

  it('honours custom idPrefix', () => {
    const out = computeHierarchicalAnomalySummary({
      idPrefix: 'q4-treemap',
      data: [
        {
          name: 'root',
          children: [
            { name: 'a', value: 10 },
            { name: 'b', value: 11 },
            { name: 'c', value: 12 },
            { name: 'd', value: 13 },
            { name: 'e', value: 999 },
          ],
        },
      ],
    });
    expect(out[0].id).toBe('q4-treemap-root-e');
  });
});

describe('computeHierarchicalAnomalySummary — severityHighFraction bucketing', () => {
  // To detect 4 outliers under a SINGLE global IQR fence we need a tight
  // baseline that doesn't drift Q3 toward the spikes. 12 close baseline
  // values + 4 high spikes works: with n=16, Q3 still sits in the
  // baseline cluster and the spikes are all above upperFence. Cf.
  // computeRadarAnomalySummary's per-indicator equivalent which only
  // needs 5 values per indicator because each indicator has its own
  // fence.
  const BASELINE = [
    { name: 'b00', value: 10 },
    { name: 'b01', value: 11 },
    { name: 'b02', value: 12 },
    { name: 'b03', value: 13 },
    { name: 'b04', value: 14 },
    { name: 'b05', value: 15 },
    { name: 'b06', value: 16 },
    { name: 'b07', value: 17 },
    { name: 'b08', value: 18 },
    { name: 'b09', value: 19 },
    { name: 'b10', value: 20 },
    { name: 'b11', value: 21 },
  ];
  const SPIKES = [
    { name: 'spike1', value: 1000 },
    { name: 'spike2', value: 2000 },
    { name: 'spike3', value: 3000 },
    { name: 'spike4', value: 4000 },
  ];

  it('default 0.25 → top quarter of detected anomalies become "high"', () => {
    const out = computeHierarchicalAnomalySummary({
      data: [{ name: 'root', children: [...BASELINE, ...SPIKES] }],
    });
    expect(out).toHaveLength(4);
    const high = out.filter((a) => a.severityBucket === 'high');
    // 4 outliers × 0.25 = 1 high.
    expect(high).toHaveLength(1);
    expect(high[0].x).toBe('spike4');
  });

  it('custom severityHighFraction tightens the high bucket', () => {
    const out = computeHierarchicalAnomalySummary({
      severityHighFraction: 0.5,
      data: [{ name: 'root', children: [...BASELINE, ...SPIKES] }],
    });
    expect(out).toHaveLength(4);
    const high = out.filter((a) => a.severityBucket === 'high');
    // 4 × 0.5 = 2 high.
    expect(high).toHaveLength(2);
  });
});

describe('computeHierarchicalAnomalySummary — formattedY + ariaLabel', () => {
  it('formattedY uses default toFixed(2) when no formatter supplied', () => {
    const out = computeHierarchicalAnomalySummary({
      data: [
        {
          name: 'root',
          children: [
            { name: 'a', value: 10 },
            { name: 'b', value: 11 },
            { name: 'c', value: 12 },
            { name: 'd', value: 13 },
            { name: 'e', value: 99.456 },
          ],
        },
      ],
    });
    expect(out[0].formattedY).toBe('99.46');
  });

  it('formattedY honours valueFormatter override', () => {
    const out = computeHierarchicalAnomalySummary({
      valueFormatter: (v) => `${Math.round(v)}!`,
      data: [
        {
          name: 'root',
          children: [
            { name: 'a', value: 10 },
            { name: 'b', value: 11 },
            { name: 'c', value: 12 },
            { name: 'd', value: 13 },
            { name: 'e', value: 99.456 },
          ],
        },
      ],
    });
    expect(out[0].formattedY).toBe('99!');
  });

  it('ariaLabel includes drill-down path + value + bucket', () => {
    const out = computeHierarchicalAnomalySummary({
      data: [
        {
          name: 'Q1',
          children: [
            {
              name: 'North',
              children: [
                { name: 'NYC', value: 10 },
                { name: 'BOS', value: 12 },
                { name: 'PHL', value: 11 },
                { name: 'DC', value: 9 },
                { name: 'BAL', value: 999 },
              ],
            },
          ],
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].ariaLabel).toBe(
      'Outlier above expected at Q1 > North > BAL, value=999.00 (high severity)',
    );
  });
});
