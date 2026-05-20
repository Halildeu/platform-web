// @vitest-environment jsdom
/**
 * LiquidFillChart — Codex thread 019e4301 AGREE_WITH_REVISIONS — option
 * shape, lazy-load gate lifecycle, value clamp, click payload + a11y.
 *
 * Covers (Codex iter-1 spec):
 *
 *   1.  Empty value (NaN/Infinity/non-number) renders the
 *       `liquidfill-chart-empty` sentinel; no GL import, no option.
 *   2.  Lazy gate unsupported → `liquidfill-chart-unsupported` +
 *       `data-reason`.
 *   3.  Lazy gate loading → `liquidfill-chart-loading`; no option.
 *   4.  Lazy gate ready → ChartA11yShell mounts; option dispatches.
 *   5.  Loading → ready rerender dispatches the liquidFill series
 *       after the gate flips (renderer enabled-gate regression).
 *   6.  Series type is `'liquidFill'`.
 *   7.  `value` clamps to `[0, 1]` (-0.5 → 0, 1.5 → 1).
 *   8.  Non-finite (NaN, Infinity) `value` → 0.
 *   9.  `secondaryValues` order — primary first, then clamped extras.
 *   10. Shape enum branches (circle / rect / roundRect / triangle /
 *       diamond / pin / arrow).
 *   11. `radius` string + number passthrough.
 *   12. `amplitude` + `waveLength` passthrough.
 *   13. `colors` CSS-var resolves into `series.color`.
 *   14. `outlineColor` CSS-var resolves into `series.outline.itemStyle.borderColor`.
 *   15. `waveAnimation` defaults true; explicit false flips it.
 *   16. `prefers-reduced-motion: reduce` forces waveAnimation=false
 *       regardless of caller (vestibular safety).
 *   17. `showOutline` defaults true; false flips `series.outline.show`.
 *   18. Tooltip + label formatter use `valueFormatter`.
 *   19. Click payload — `{ value, fillRatio, label }` canonical shape.
 *   20. Unsupported aria-label suffixes the reason banner.
 *   21. Loading aria-label suffixes the loading message.
 *   22. `clampFillRatio` pure helper covers boundary cases.
 *   23. `buildLiquidFillData` pure helper covers primary-only,
 *       undefined-secondary, empty-array-secondary, multi-layer cases.
 *   24. A11y row label is the title (or 'Liquid fill') with formatted
 *       value.
 */
import {
  lastDispatchedOption,
  resetEChartsMock,
  clickListenerRegistrations,
} from './fixtures/echarts-mock'; // side-effect import: vi.mock hoisted
import { installJsdomPolyfills, restoreJsdomPolyfills } from './fixtures/jsdom-polyfills';

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

// Mock the lazy gate so the wrapper believes the package is ready in
// jsdom. Individual tests override the mock return value for the
// unsupported / loading branches.
vi.mock('../renderers/liquidfill', async () => {
  const actual =
    await vi.importActual<typeof import('../renderers/liquidfill')>('../renderers/liquidfill');
  return {
    ...actual,
    useRequiredEChartsLiquidFill: vi.fn(() => ({ status: 'ready' })),
    describeEChartsLiquidFillReason: actual.describeEChartsLiquidFillReason,
  };
});

import { LiquidFillChart, clampFillRatio, buildLiquidFillData } from '../LiquidFillChart';
import { useRequiredEChartsLiquidFill } from '../renderers/liquidfill';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const series = (): Array<Record<string, unknown>> =>
  (lastDispatchedOption()?.series as Array<Record<string, unknown>> | undefined) ?? [];

const tooltipFormatter = (): ((params: unknown) => string) | undefined =>
  (lastDispatchedOption()?.tooltip as { formatter?: (p: unknown) => string } | undefined)
    ?.formatter;

beforeEach(() => {
  resetEChartsMock();
  installJsdomPolyfills();
  (useRequiredEChartsLiquidFill as ReturnType<typeof vi.fn>).mockReturnValue({ status: 'ready' });
});
afterEach(() => {
  restoreJsdomPolyfills();
});

/* ------------------------------------------------------------------ */
/*  Lazy gate lifecycle                                                */
/* ------------------------------------------------------------------ */

describe('LiquidFillChart — lazy gate lifecycle', () => {
  it('empty value renders liquidfill-chart-empty and no option dispatch', () => {
    const { getByTestId } = render(<LiquidFillChart value={Number.NaN} />);
    expect(getByTestId('liquidfill-chart-empty')).toBeTruthy();
    expect(lastDispatchedOption()).toBeNull();
  });

  it('unsupported state renders liquidfill-chart-unsupported with reason', () => {
    (useRequiredEChartsLiquidFill as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'unsupported',
      reason: 'liquidfill-import-failed',
    });
    const { getByTestId } = render(<LiquidFillChart value={0.75} />);
    const el = getByTestId('liquidfill-chart-unsupported');
    expect(el.getAttribute('data-reason')).toBe('liquidfill-import-failed');
    expect(lastDispatchedOption()).toBeNull();
  });

  it('loading state renders liquidfill-chart-loading and no option dispatch', () => {
    (useRequiredEChartsLiquidFill as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'loading',
    });
    const { getByTestId } = render(<LiquidFillChart value={0.75} />);
    expect(getByTestId('liquidfill-chart-loading')).toBeTruthy();
    expect(lastDispatchedOption()).toBeNull();
  });

  it('ready state mounts ChartA11yShell and dispatches the option', () => {
    const { getByTestId } = render(<LiquidFillChart value={0.75} animate={false} />);
    expect(getByTestId('liquidfill-chart')).toBeTruthy();
    expect(lastDispatchedOption()).not.toBeNull();
  });

  it('loading → ready rerender dispatches the liquidFill series after the gate flips', () => {
    (useRequiredEChartsLiquidFill as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'loading',
    });
    const { getByTestId, rerender } = render(<LiquidFillChart value={0.75} animate={false} />);
    expect(getByTestId('liquidfill-chart-loading')).toBeTruthy();
    expect(lastDispatchedOption()).toBeNull();
    (useRequiredEChartsLiquidFill as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'ready',
    });
    rerender(<LiquidFillChart value={0.75} animate={false} />);
    expect(getByTestId('liquidfill-chart')).toBeTruthy();
    expect(lastDispatchedOption()).not.toBeNull();
    expect(series()[0].type).toBe('liquidFill');
  });

  it('unsupported aria-label suffixes the reason banner', () => {
    (useRequiredEChartsLiquidFill as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'unsupported',
      reason: 'liquidfill-import-failed',
    });
    const { getByTestId } = render(<LiquidFillChart value={0.75} title="Sprint Tamamlama" />);
    const aria = getByTestId('liquidfill-chart-unsupported').getAttribute('aria-label') ?? '';
    expect(aria).toContain('Sprint Tamamlama');
    expect(aria).toContain('yüklenemedi');
  });

  it('loading aria-label suffixes the loading message', () => {
    (useRequiredEChartsLiquidFill as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'loading',
    });
    const { getByTestId } = render(<LiquidFillChart value={0.75} title="Sprint Tamamlama" />);
    const aria = getByTestId('liquidfill-chart-loading').getAttribute('aria-label') ?? '';
    expect(aria).toContain('Sprint Tamamlama');
    expect(aria).toContain('yükleniyor');
  });
});

/* ------------------------------------------------------------------ */
/*  Series + value clamp                                               */
/* ------------------------------------------------------------------ */

describe('LiquidFillChart — series + value clamp', () => {
  it('series type is liquidFill', () => {
    render(<LiquidFillChart value={0.75} animate={false} />);
    expect(series()[0].type).toBe('liquidFill');
  });

  it('value clamps to [0, 1]', () => {
    const { rerender } = render(<LiquidFillChart value={-0.5} animate={false} />);
    expect((series()[0].data as number[])[0]).toBe(0);
    rerender(<LiquidFillChart value={1.5} animate={false} />);
    expect((series()[0].data as number[])[0]).toBe(1);
  });

  it('non-finite value collapses to empty branch (NaN treated as empty)', () => {
    const { getByTestId } = render(
      <LiquidFillChart value={Number.POSITIVE_INFINITY} animate={false} />,
    );
    // Infinity is finite=false → wrapper treats as empty (Codex iter-1
    // contract; clampFillRatio still works on direct numeric paths).
    expect(getByTestId('liquidfill-chart-empty')).toBeTruthy();
  });

  it('secondaryValues order — primary first, then clamped extras', () => {
    render(<LiquidFillChart value={0.6} secondaryValues={[0.5, 2, -1]} animate={false} />);
    expect(series()[0].data).toEqual([0.6, 0.5, 1, 0]);
  });

  it('undefined / empty secondaryValues renders a single layer', () => {
    const { rerender } = render(<LiquidFillChart value={0.4} animate={false} />);
    expect(series()[0].data).toEqual([0.4]);
    rerender(<LiquidFillChart value={0.4} secondaryValues={[]} animate={false} />);
    expect(series()[0].data).toEqual([0.4]);
  });

  it.each(['circle', 'rect', 'roundRect', 'triangle', 'diamond', 'pin', 'arrow'] as const)(
    'shape "%s" flows to series.shape',
    (shape) => {
      render(<LiquidFillChart value={0.5} shape={shape} animate={false} />);
      expect(series()[0].shape).toBe(shape);
    },
  );

  it('radius string + number pass through unchanged', () => {
    const { rerender } = render(<LiquidFillChart value={0.5} radius="60%" animate={false} />);
    expect(series()[0].radius).toBe('60%');
    rerender(<LiquidFillChart value={0.5} radius={120} animate={false} />);
    expect(series()[0].radius).toBe(120);
  });

  it('amplitude + waveLength pass through unchanged', () => {
    render(<LiquidFillChart value={0.5} amplitude="12%" waveLength="50%" animate={false} />);
    expect(series()[0].amplitude).toBe('12%');
    expect(series()[0].waveLength).toBe('50%');
  });

  it('colors CSS var resolves into series.color array', () => {
    document.documentElement.style.setProperty('--liquid-test-color', '#abcdef');
    render(
      <LiquidFillChart
        value={0.5}
        colors={['var(--liquid-test-color)', '#222222']}
        animate={false}
      />,
    );
    const color = series()[0].color as string[];
    document.documentElement.style.removeProperty('--liquid-test-color');
    expect(color[0]).toBe('#abcdef');
    expect(color[1]).toBe('#222222');
  });

  it('outlineColor CSS var resolves into series.outline.itemStyle.borderColor', () => {
    document.documentElement.style.setProperty('--liquid-outline', '#112233');
    render(<LiquidFillChart value={0.5} outlineColor="var(--liquid-outline)" animate={false} />);
    const outline = series()[0].outline as { itemStyle?: { borderColor?: string } };
    document.documentElement.style.removeProperty('--liquid-outline');
    expect(outline.itemStyle?.borderColor).toBe('#112233');
  });

  it('waveAnimation defaults true; explicit false flips it', () => {
    const { rerender } = render(<LiquidFillChart value={0.5} animate={false} />);
    expect(series()[0].waveAnimation).toBe(true);
    rerender(<LiquidFillChart value={0.5} waveAnimation={false} animate={false} />);
    expect(series()[0].waveAnimation).toBe(false);
  });

  it('prefers-reduced-motion forces waveAnimation off regardless of caller (vestibular safety)', () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as typeof window.matchMedia;
    try {
      render(<LiquidFillChart value={0.5} waveAnimation animate={false} />);
      expect(series()[0].waveAnimation).toBe(false);
    } finally {
      window.matchMedia = original;
    }
  });

  it('showOutline defaults true; false flips series.outline.show', () => {
    const { rerender } = render(<LiquidFillChart value={0.5} animate={false} />);
    expect((series()[0].outline as { show: boolean }).show).toBe(true);
    rerender(<LiquidFillChart value={0.5} showOutline={false} animate={false} />);
    expect((series()[0].outline as { show: boolean }).show).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Tooltip + label formatter                                          */
/* ------------------------------------------------------------------ */

describe('LiquidFillChart — formatter', () => {
  it('tooltip formatter uses the supplied valueFormatter', () => {
    render(
      <LiquidFillChart
        value={0.42}
        valueFormatter={(v) => `${(v * 100).toFixed(1)}%`}
        animate={false}
      />,
    );
    const fmt = tooltipFormatter();
    const html = fmt!({ value: 0.42 });
    expect(html).toContain('42.0%');
  });

  it('series.label.formatter calls the supplied valueFormatter on the primary fill ratio', () => {
    render(
      <LiquidFillChart
        value={0.42}
        valueFormatter={(v) => `${(v * 100).toFixed(0)}/100`}
        animate={false}
      />,
    );
    const label = series()[0].label as { formatter: () => string };
    expect(label.formatter()).toBe('42/100');
  });
});

/* ------------------------------------------------------------------ */
/*  Click payload                                                      */
/* ------------------------------------------------------------------ */

describe('LiquidFillChart — onDataPointClick', () => {
  it('emits canonical { value, fillRatio, label } payload', () => {
    const onClick = vi.fn();
    render(
      <LiquidFillChart
        value={0.6}
        title="Hedef Tamamlama"
        onDataPointClick={onClick}
        animate={false}
      />,
    );
    const handlers = clickListenerRegistrations();
    expect(handlers.length).toBeGreaterThan(0);
    handlers[handlers.length - 1]({ value: 0.6, name: 'liquidFill' });
    expect(onClick).toHaveBeenCalledTimes(1);
    const event = onClick.mock.calls[0][0];
    expect(event.value).toBe(0.6);
    expect(event.label).toBe('Hedef Tamamlama');
    expect(event.datum).toMatchObject({ value: 0.6, fillRatio: 0.6 });
  });

  it('clamps the click value to [0, 1] before emit', () => {
    const onClick = vi.fn();
    render(<LiquidFillChart value={0.5} onDataPointClick={onClick} animate={false} />);
    const handlers = clickListenerRegistrations();
    handlers[handlers.length - 1]({ value: 1.5 });
    expect(onClick.mock.calls[0][0].value).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/*  Pure helpers                                                       */
/* ------------------------------------------------------------------ */

describe('clampFillRatio', () => {
  it('clamps to [0, 1] and zeroes non-finite', () => {
    expect(clampFillRatio(-1)).toBe(0);
    expect(clampFillRatio(2)).toBe(1);
    expect(clampFillRatio(0.42)).toBe(0.42);
    expect(clampFillRatio(Number.NaN)).toBe(0);
    expect(clampFillRatio(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('buildLiquidFillData', () => {
  it('returns a single-layer array for omitted / empty secondaryValues', () => {
    expect(buildLiquidFillData(0.5)).toEqual([0.5]);
    expect(buildLiquidFillData(0.5, [])).toEqual([0.5]);
  });

  it('prepends the primary value before clamped secondaries', () => {
    expect(buildLiquidFillData(0.5, [0.3, 2, -1])).toEqual([0.5, 0.3, 1, 0]);
  });
});

/* ------------------------------------------------------------------ */
/*  A11y SR data table                                                 */
/* ------------------------------------------------------------------ */

describe('LiquidFillChart — a11y SR data table', () => {
  it('renders a single hidden table row with title + formatted value', () => {
    const { container } = render(
      <LiquidFillChart
        value={0.42}
        title="Sprint Tamamlama"
        valueFormatter={(v) => `${Math.round(v * 100)}%`}
        animate={false}
      />,
    );
    const text = container.querySelector('table')?.textContent ?? '';
    expect(text).toContain('Sprint Tamamlama');
    expect(text).toContain('42%');
  });
});
