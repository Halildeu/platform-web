// @vitest-environment jsdom
/**
 * ScatterChart `enableBrush` + `onBrushSelection` wiring tests.
 *
 * Faz 21.11 PR-A2c-wire — locks the contract between `ScatterChart`
 * and the cross-filter helpers shipped in PR-A2c
 * (`normalizeBrushSelection` / `brushToAgGridFilterModel`).
 *
 * Test strategy (Codex iter-1 PR-A2c-wire absorbed)
 *   - Mock surface: `fixtures/echarts-mock` already hoists the
 *     ECharts module mock; we extend it with generic
 *     `eventListenerRegistrations(eventName)` helpers (see PR
 *     diff).
 *   - Boundary: the chart wrapper, NOT ECharts itself. We assert
 *     option shape (toolbox/brush block presence), listener
 *     registration on `brushselected`, normalised payload
 *     forwarded to the consumer, clear-event handling, and
 *     access-gate stripping.
 *   - NOT in scope: real ECharts canvas mount; PR-A2c-adopt's
 *     AG Grid wiring; `useChartInteractions.ts` data-space
 *     migration (Codex iter-1 §3 — separate PR).
 */
import {
  lastDispatchedOption,
  resetEChartsMock,
  eventListenerRegistrations,
  eventListenerUnregistrations,
} from './fixtures/echarts-mock'; // side-effect import: hoists vi.mock before chart imports below
import { installJsdomPolyfills, restoreJsdomPolyfills } from './fixtures/jsdom-polyfills';

import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { ScatterChart } from '../ScatterChart';

const SAMPLE_DATA = [
  { x: 0, y: 1 },
  { x: 1, y: 2 },
  { x: 2, y: 3 },
  { x: 3, y: 4 },
  { x: 4, y: 5 },
];

function fireBrushEvent(handler: (...args: unknown[]) => void, payload: unknown): void {
  handler(payload);
}

beforeEach(() => {
  resetEChartsMock();
  installJsdomPolyfills();
});

afterEach(() => {
  restoreJsdomPolyfills();
});

describe('ScatterChart — `enableBrush=false` (default backwards compat)', () => {
  it('does NOT inject toolbox/brush blocks when brush is disabled', () => {
    render(<ScatterChart data={SAMPLE_DATA} />);
    const opt = lastDispatchedOption();
    expect(opt).not.toBeNull();
    expect(opt?.toolbox).toBeUndefined();
    expect(opt?.brush).toBeUndefined();
  });

  it('does NOT register a `brushselected` listener when brush is disabled', () => {
    render(<ScatterChart data={SAMPLE_DATA} onBrushSelection={() => {}} />);
    expect(eventListenerRegistrations('brushselected')).toHaveLength(0);
  });

  it('does NOT register a `brushselected` listener when callback is missing', () => {
    render(<ScatterChart data={SAMPLE_DATA} enableBrush />);
    expect(eventListenerRegistrations('brushselected')).toHaveLength(0);
  });
});

describe('ScatterChart — `enableBrush=true` + `onBrushSelection` wiring', () => {
  it('injects `toolbox.feature.brush` and top-level `brush` config (Codex iter-1 §4)', () => {
    render(<ScatterChart data={SAMPLE_DATA} enableBrush onBrushSelection={() => {}} />);
    const opt = lastDispatchedOption();
    expect(opt).not.toBeNull();
    const toolbox = opt?.toolbox as { feature?: { brush?: { type?: string[] } } };
    expect(toolbox?.feature?.brush?.type).toEqual(['rect', 'clear']);
    const brush = opt?.brush as {
      brushMode?: string;
      xAxisIndex?: number;
      yAxisIndex?: number;
      toolbox?: string[];
    };
    expect(brush?.brushMode).toBe('single');
    expect(brush?.xAxisIndex).toBe(0);
    expect(brush?.yAxisIndex).toBe(0);
    expect(brush?.toolbox).toEqual(['rect', 'clear']);
  });

  it('registers a `brushselected` listener on mount (≥1 — instanceVersion may bump)', () => {
    render(<ScatterChart data={SAMPLE_DATA} enableBrush onBrushSelection={() => {}} />);
    // Existing pattern (see `access.contract.test.tsx`): the
    // renderer init effect bumps `instanceVersion` after creating
    // the ECharts instance, which re-runs the listener effect with
    // a fresh handler (the previous handler is detached). Net
    // active subscription is 1, but raw `on(...)` call count can
    // be 1+ depending on render cadence.
    const regs = eventListenerRegistrations('brushselected').length;
    const unregs = eventListenerUnregistrations('brushselected').length;
    expect(regs).toBeGreaterThanOrEqual(1);
    expect(regs - unregs).toBe(1); // exactly 1 active subscription
  });

  it('forwards a normalised BrushSelection on a rectangle event', () => {
    const onBrush = vi.fn();
    render(<ScatterChart data={SAMPLE_DATA} enableBrush onBrushSelection={onBrush} />);
    const [handler] = eventListenerRegistrations('brushselected');
    expect(handler).toBeDefined();
    fireBrushEvent(handler, {
      batch: [
        {
          areas: [
            {
              brushType: 'rect',
              coordRange: [
                [1, 3],
                [2, 4],
              ],
            },
          ],
          selected: [{ seriesIndex: 0, dataIndex: [1, 2, 3] }],
        },
      ],
    });
    expect(onBrush).toHaveBeenCalledTimes(1);
    const selection = onBrush.mock.calls[0][0];
    expect(selection).not.toBeNull();
    expect(selection.from).toEqual({ x: 1, y: 2 });
    expect(selection.to).toEqual({ x: 3, y: 4 });
    // `originalIndex` defaulted to the array index since the data
    // wasn't pre-stamped — wire path mirrors PR-A2c lenient mode.
    expect(selection.indices).toEqual([1, 2, 3]);
    expect(selection.kind).toBe('rect');
  });

  it('forwards `null` when ECharts emits a clear event (no area / empty selected)', () => {
    const onBrush = vi.fn();
    render(<ScatterChart data={SAMPLE_DATA} enableBrush onBrushSelection={onBrush} />);
    const [handler] = eventListenerRegistrations('brushselected');
    fireBrushEvent(handler, {
      batch: [
        {
          areas: [],
          selected: [],
        },
      ],
    });
    expect(onBrush).toHaveBeenCalledTimes(1);
    expect(onBrush.mock.calls[0][0]).toBeNull();
  });

  it('preserves source-row mapping when data carries `originalIndex` (PR-A2a coupling)', () => {
    const downsampled = [
      { x: 0, y: 0, originalIndex: 100 },
      { x: 1, y: 1, originalIndex: 200 },
      { x: 2, y: 2, originalIndex: 300 },
      { x: 3, y: 3, originalIndex: 400 },
      { x: 4, y: 4, originalIndex: 500 },
    ];
    const onBrush = vi.fn();
    render(<ScatterChart data={downsampled} enableBrush onBrushSelection={onBrush} />);
    const [handler] = eventListenerRegistrations('brushselected');
    fireBrushEvent(handler, {
      batch: [
        {
          areas: [
            {
              brushType: 'rect',
              coordRange: [
                [0, 5],
                [0, 5],
              ],
            },
          ],
          selected: [{ seriesIndex: 0, dataIndex: [0, 2, 4] }],
        },
      ],
    });
    const selection = onBrush.mock.calls[0][0];
    expect(selection.indices).toEqual([100, 300, 500]);
  });
});

describe('ScatterChart — access gate stripping', () => {
  it('strips `onBrushSelection` AND skips `brushselected` subscription when access=readonly', () => {
    const onBrush = vi.fn();
    render(
      <ScatterChart data={SAMPLE_DATA} enableBrush onBrushSelection={onBrush} access="readonly" />,
    );
    // Toolbox/brush option block stays — the UI still renders the
    // button so the user sees it's a brushable chart, but the
    // callback never reaches the consumer.
    const opt = lastDispatchedOption();
    expect(opt?.toolbox).toBeDefined();
    expect(opt?.brush).toBeDefined();
    // Listener subscription is gated on the callback presence — the
    // outer wrapper stripped `onBrushSelection`, so `ScatterChartInner`
    // never wires `unstable_onBrushSelected`.
    expect(eventListenerRegistrations('brushselected')).toHaveLength(0);
  });
});

describe('ScatterChart — listener lifecycle (latest-closure pattern)', () => {
  it('does NOT re-bind the `brushselected` listener when callback identity changes', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const { rerender } = render(
      <ScatterChart data={SAMPLE_DATA} enableBrush onBrushSelection={cb1} />,
    );
    const initialRegistrations = eventListenerRegistrations('brushselected').length;
    rerender(<ScatterChart data={SAMPLE_DATA} enableBrush onBrushSelection={cb2} />);
    // Latest-closure pattern: the renderer reads the callback via
    // a ref so changing identity does NOT trigger a new
    // `instance.on('brushselected', ...)` call.
    expect(eventListenerRegistrations('brushselected').length).toBe(initialRegistrations);
    // BUT the new callback IS the one invoked when the next event
    // fires.
    const [handler] = eventListenerRegistrations('brushselected');
    fireBrushEvent(handler, {
      batch: [
        {
          areas: [
            {
              brushType: 'rect',
              coordRange: [
                [0, 5],
                [0, 5],
              ],
            },
          ],
          selected: [{ seriesIndex: 0, dataIndex: [0] }],
        },
      ],
    });
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it('detaches listener when `onBrushSelection` transitions to undefined', () => {
    const cb = vi.fn();
    const { rerender } = render(
      <ScatterChart data={SAMPLE_DATA} enableBrush onBrushSelection={cb} />,
    );
    const initialRegs = eventListenerRegistrations('brushselected').length;
    const initialUnregs = eventListenerUnregistrations('brushselected').length;
    expect(initialRegs - initialUnregs).toBe(1); // mount established 1 active subscription
    rerender(<ScatterChart data={SAMPLE_DATA} enableBrush />);
    // Transition defined → undefined flips `hasBrushHandler`, which
    // is in the brush-listener effect's deps. The cleanup path
    // detaches the old listener; no new one is bound.
    const finalRegs = eventListenerRegistrations('brushselected').length;
    const finalUnregs = eventListenerUnregistrations('brushselected').length;
    expect(finalRegs - finalUnregs).toBe(0); // net 0 active subscription
    expect(finalUnregs).toBeGreaterThan(initialUnregs); // an off() was added
  });
});

// vi import imported via the test runtime; the wiring tests above use
// `vi.fn` through this scope.
import { vi } from 'vitest';
