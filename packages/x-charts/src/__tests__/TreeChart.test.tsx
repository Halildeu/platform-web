// @vitest-environment jsdom
/**
 * TreeChart — PR-X16a option-shape + a11y linearization tests.
 *
 * Codex thread 019e32da plan-time AGREE — ECharts Depth campaign,
 * first wrapper. Covers:
 *   (a) option-shape: series[0].type/layout/orient/expandAndCollapse/
 *       initialTreeDepth/roam, radial drops orient, data preserved
 *   (b) empty-data stability
 *   (c) rerender stale-dependency (layout/orient change → fresh option)
 *   (d) linearizeTreeForA11y DFS path + value fallback
 *   (e) countDescendants helper
 */
import { lastDispatchedOption, resetEChartsMock } from './fixtures/echarts-mock'; // side-effect import: vi.mock hoisted before component imports
import { installJsdomPolyfills, restoreJsdomPolyfills } from './fixtures/jsdom-polyfills';

import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

import { TreeChart, linearizeTreeForA11y, countDescendants, type TreeNode } from '../TreeChart';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const orgTree = (): TreeNode[] => [
  {
    name: 'Liderlik',
    children: [
      {
        name: 'İK',
        children: [
          { name: 'İK Operasyon', value: 12 },
          { name: 'İşe Alım', value: 8 },
        ],
      },
      {
        name: 'Mühendislik',
        children: [
          { name: 'Frontend', value: 20 },
          { name: 'Backend', value: 25 },
        ],
      },
    ],
  },
];

/** series[0] of the last dispatched option, typed loose for assertions. */
const treeSeries = (): Record<string, unknown> => {
  const opt = lastDispatchedOption();
  const series = opt?.series as Array<Record<string, unknown>> | undefined;
  return series?.[0] ?? {};
};

beforeEach(() => {
  resetEChartsMock();
  installJsdomPolyfills();
});
afterEach(() => {
  restoreJsdomPolyfills();
});

/* ------------------------------------------------------------------ */
/*  countDescendants helper                                            */
/* ------------------------------------------------------------------ */

describe('countDescendants', () => {
  it('returns 0 for a leaf node', () => {
    expect(countDescendants({ name: 'Leaf' })).toBe(0);
    expect(countDescendants({ name: 'Leaf', children: [] })).toBe(0);
  });

  it('counts direct children', () => {
    expect(
      countDescendants({
        name: 'Parent',
        children: [{ name: 'A' }, { name: 'B' }],
      }),
    ).toBe(2);
  });

  it('counts the full sub-tree recursively', () => {
    // orgTree root: İK(2) + İK Operasyon + İşe Alım + Mühendislik(2)
    //   + Frontend + Backend = 2 dept + 4 leaves = 6
    expect(countDescendants(orgTree()[0])).toBe(6);
  });
});

/* ------------------------------------------------------------------ */
/*  linearizeTreeForA11y                                               */
/* ------------------------------------------------------------------ */

describe('linearizeTreeForA11y', () => {
  it('produces one DFS pre-order row per node', () => {
    const rows = linearizeTreeForA11y(orgTree());
    // 1 root + 2 depts + 4 leaves = 7
    expect(rows).toHaveLength(7);
  });

  it('builds breadcrumb-style path labels', () => {
    const rows = linearizeTreeForA11y(orgTree());
    const labels = rows.map((r) => r.label);
    expect(labels[0]).toBe('Liderlik');
    expect(labels).toContain('Liderlik > İK');
    expect(labels).toContain('Liderlik > İK > İK Operasyon');
    expect(labels).toContain('Liderlik > Mühendislik > Backend');
  });

  it('uses node.value when finite', () => {
    const rows = linearizeTreeForA11y(orgTree());
    const backend = rows.find((r) => r.label.endsWith('Backend'));
    expect(backend?.value).toBe(25);
  });

  it('falls back to descendant count when value absent', () => {
    const rows = linearizeTreeForA11y(orgTree());
    // "Liderlik" root has no value → descendant count 6
    expect(rows[0].value).toBe(6);
    // "Liderlik > İK" has no value → 2 leaves
    const ik = rows.find((r) => r.label === 'Liderlik > İK');
    expect(ik?.value).toBe(2);
  });

  it('falls back to descendant count for non-finite value', () => {
    const rows = linearizeTreeForA11y([
      { name: 'Bad', value: NaN, children: [{ name: 'C1' }, { name: 'C2' }] },
    ]);
    expect(rows[0].value).toBe(2);
  });

  it('handles empty input', () => {
    expect(linearizeTreeForA11y([])).toEqual([]);
  });

  it('handles multi-root forest', () => {
    const rows = linearizeTreeForA11y([
      { name: 'Root A', value: 1 },
      { name: 'Root B', value: 2 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].label).toBe('Root A');
    expect(rows[1].label).toBe('Root B');
  });
});

/* ------------------------------------------------------------------ */
/*  Option-shape                                                       */
/* ------------------------------------------------------------------ */

describe('TreeChart — option shape', () => {
  it('emits a single series of type "tree"', () => {
    render(<TreeChart data={orgTree()} animate={false} />);
    const opt = lastDispatchedOption();
    const series = opt?.series as unknown[];
    expect(series).toHaveLength(1);
    expect(treeSeries().type).toBe('tree');
  });

  it('data is preserved nested (structure intact)', () => {
    render(<TreeChart data={orgTree()} animate={false} />);
    const data = treeSeries().data as TreeNode[];
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe('Liderlik');
    expect(data[0].children).toHaveLength(2);
    expect(data[0].children?.[0].children).toHaveLength(2);
  });

  it('layout defaults to orthogonal with orient LR', () => {
    render(<TreeChart data={orgTree()} animate={false} />);
    expect(treeSeries().layout).toBe('orthogonal');
    expect(treeSeries().orient).toBe('LR');
  });

  it('orthogonal honours explicit orient', () => {
    render(<TreeChart data={orgTree()} orient="TB" animate={false} />);
    expect(treeSeries().layout).toBe('orthogonal');
    expect(treeSeries().orient).toBe('TB');
  });

  it('radial layout DROPS orient from the option (Codex iter-1 must-fix #2)', () => {
    render(<TreeChart data={orgTree()} layout="radial" orient="TB" animate={false} />);
    expect(treeSeries().layout).toBe('radial');
    // orient must NOT appear — radial ignores it; leaving it in would
    // be a misleading no-op in DevTools.
    expect(treeSeries().orient).toBeUndefined();
  });

  it('expandAndCollapse + initialTreeDepth defaults', () => {
    render(<TreeChart data={orgTree()} animate={false} />);
    expect(treeSeries().expandAndCollapse).toBe(true);
    expect(treeSeries().initialTreeDepth).toBe(2);
  });

  it('expandAndCollapse + initialTreeDepth overrides propagate', () => {
    render(
      <TreeChart data={orgTree()} expandAndCollapse={false} initialTreeDepth={4} animate={false} />,
    );
    expect(treeSeries().expandAndCollapse).toBe(false);
    expect(treeSeries().initialTreeDepth).toBe(4);
  });

  it('roam defaults to false, honours override', () => {
    render(<TreeChart data={orgTree()} animate={false} />);
    expect(treeSeries().roam).toBe(false);
    render(<TreeChart data={orgTree()} roam="scale" animate={false} />);
    expect(treeSeries().roam).toBe('scale');
  });

  it('symbolSize default 10, honours override', () => {
    render(<TreeChart data={orgTree()} animate={false} />);
    expect(treeSeries().symbolSize).toBe(10);
    render(<TreeChart data={orgTree()} symbolSize={24} animate={false} />);
    expect(treeSeries().symbolSize).toBe(24);
  });

  it('empty data renders an empty-state without throwing', () => {
    expect(() => render(<TreeChart data={[]} animate={false} />)).not.toThrow();
    // No option dispatched for empty data (component short-circuits).
  });

  it('rerender with new layout produces a fresh option (stale-dep guard)', () => {
    const { rerender } = render(<TreeChart data={orgTree()} layout="orthogonal" animate={false} />);
    expect(treeSeries().layout).toBe('orthogonal');
    rerender(<TreeChart data={orgTree()} layout="radial" animate={false} />);
    expect(treeSeries().layout).toBe('radial');
    expect(treeSeries().orient).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  A11y                                                               */
/* ------------------------------------------------------------------ */

describe('TreeChart — a11y SR data table', () => {
  it('renders a hidden SR table with DFS-linearized rows', () => {
    const { container } = render(
      <TreeChart data={orgTree()} title="Organizasyon Şeması" animate={false} />,
    );
    const rows = container.querySelectorAll('table tbody tr');
    const labels = Array.from(rows).map((tr) => tr.querySelector('td')?.textContent ?? '');
    // 7 nodes linearized.
    expect(labels.length).toBeGreaterThanOrEqual(7);
    expect(labels.some((l) => l === 'Liderlik')).toBe(true);
    expect(labels.some((l) => l === 'Liderlik > İK > İK Operasyon')).toBe(true);
  });

  it('uses the custom valueColumnHeader', () => {
    const { container } = render(
      <TreeChart data={orgTree()} title="Org" valueColumnHeader="Personel" animate={false} />,
    );
    const headerCells = Array.from(container.querySelectorAll('table thead th')).map(
      (th) => th.textContent,
    );
    expect(headerCells).toContain('Personel');
  });
});
