// @vitest-environment jsdom
/**
 * Waterfall connector + markup merge regression — Codex thread
 * 019e0e20 iter-2 P1 absorb. Locks two invariants:
 *
 *   1. Connector `markLine.data` items remain 2-element ARRAYS
 *      (segment endpoint pairs). Spreading the pair into an object
 *      would silently break ECharts segment rendering.
 *   2. Each connector endpoint carries per-item `silent: true` so
 *      `onMarkupClick` (which routes through ECharts native `click`
 *      events) NEVER fires for the connector visuals; user-supplied
 *      markup line/segment entries appended via `mergeMarkupPatches`
 *      keep their default clickable behaviour.
 */
import { resetEChartsMock, lastDispatchedOption } from './fixtures/echarts-mock';
import { installJsdomPolyfills, restoreJsdomPolyfills } from './fixtures/jsdom-polyfills';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { WaterfallChart } from '../WaterfallChart';
import type { ChartMarkup } from '../types';

beforeEach(() => {
  resetEChartsMock();
  installJsdomPolyfills();
});

afterEach(() => {
  restoreJsdomPolyfills();
});

describe('WaterfallChart connector markLine — Codex iter-2 P1 regression', () => {
  it('connector entries are 2-element arrays with per-endpoint silent:true', () => {
    render(
      <WaterfallChart
        data={[
          { label: 'A', value: 100 },
          { label: 'B', value: 50 },
          { label: 'C', value: -30 },
        ]}
        showConnector
      />,
    );
    const opt = lastDispatchedOption() as {
      series?: Array<{ markLine?: { data?: unknown[] } }>;
    };
    // Visible value series (index 1) carries the connector markLine.
    const valueSeries = opt.series?.[1];
    const data = valueSeries?.markLine?.data ?? [];
    expect(data.length).toBeGreaterThan(0);
    for (const entry of data) {
      // PAIR shape preserved — array of 2 endpoints, NOT an object
      // with numeric keys.
      expect(Array.isArray(entry)).toBe(true);
      expect(entry as unknown[]).toHaveLength(2);
      const [a, b] = entry as Array<{ silent?: boolean }>;
      expect(a.silent).toBe(true);
      expect(b.silent).toBe(true);
    }
  });

  it('user markup line APPENDED on top of connectors keeps default clickable behaviour', () => {
    const markups: ChartMarkup[] = [
      {
        id: 'budget',
        type: 'line',
        axis: 'y',
        value: 75,
        label: { text: 'Budget' },
      },
    ];
    render(
      <WaterfallChart
        data={[
          { label: 'A', value: 100 },
          { label: 'B', value: 50 },
        ]}
        markups={markups}
        showConnector
      />,
    );
    const opt = lastDispatchedOption() as {
      series?: Array<{ markLine?: { data?: unknown[] } }>;
    };
    const valueSeries = opt.series?.[1];
    const data = (valueSeries?.markLine?.data ?? []) as unknown[];
    // Connector pairs + at least one user markup entry
    expect(data.length).toBeGreaterThan(0);
    // Find the user markup entry by name (single object form, not pair)
    const userEntry = data.find(
      (d) =>
        !Array.isArray(d) &&
        typeof d === 'object' &&
        d !== null &&
        (d as { name?: string }).name === 'budget',
    ) as { silent?: boolean } | undefined;
    expect(userEntry).toBeDefined();
    // Default clickable — silent must NOT be set on the user markup
    expect(userEntry?.silent).toBeUndefined();
  });
});
