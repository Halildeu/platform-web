// @vitest-environment jsdom
/**
 * WordCloudChart — Codex thread 019e4351 AGREE_WITH_REVISIONS — lazy
 * gate, normalization, deterministic colors, click payload, a11y.
 *
 * Covers (Codex iter-1 spec):
 *
 *   1.  Empty normalized data renders `wordcloud-chart-empty`; no
 *       option dispatch.
 *   2.  Lazy gate `unsupported` → sentinel + `data-reason`.
 *   3.  Lazy gate `loading` → sentinel; no option dispatch.
 *   4.  Lazy gate `ready` → ChartA11yShell mounts.
 *   5.  Loading → ready rerender dispatches the wordCloud series.
 *   6.  Series type is `'wordCloud'`.
 *   7.  Shape enum branches (7 shapes).
 *   8.  Default + custom `sizeRange` / `rotationRange` / `rotationStep`
 *       / `gridSize` / `drawOutOfBound` / `shrinkToFit` passthrough.
 *   9.  Normalize: empty name drops.
 *   10. Normalize: NaN / Infinity / non-positive value drops.
 *   11. Normalize: desc sort by value.
 *   12. Normalize: `maxWords` cap (default 100, clamp `[1, 200]`).
 *   13. CSS-var colors resolve into the deterministic palette
 *       callback.
 *   14. Color callback returns `palette[dataIndex % palette.length]`
 *       — deterministic, not random.
 *   15. `fontFamily` flows into `series.textStyle.fontFamily`.
 *   16. Tooltip formatter renders `word: value` with HTML escape.
 *   17. `valueFormatter` drives tooltip + a11y value column.
 *   18. Click payload `{ word, value, label, dataIndex }`,
 *       `value=value`, `label=word`.
 *   19. Unsupported aria-label suffixes the reason banner.
 *   20. Loading aria-label suffixes the loading message.
 *   21. `normalizeWordCloudData` pure helper covers boundary cases.
 *   22. A11y row label uses the word + formatted value (Turkish
 *       characters intact).
 */
import {
  lastDispatchedOption,
  resetEChartsMock,
  clickListenerRegistrations,
} from './fixtures/echarts-mock';
import { installJsdomPolyfills, restoreJsdomPolyfills } from './fixtures/jsdom-polyfills';

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('../renderers/wordcloud', async () => {
  const actual =
    await vi.importActual<typeof import('../renderers/wordcloud')>('../renderers/wordcloud');
  return {
    ...actual,
    useRequiredEChartsWordCloud: vi.fn(() => ({ status: 'ready' })),
    describeEChartsWordCloudReason: actual.describeEChartsWordCloudReason,
  };
});

import { WordCloudChart, normalizeWordCloudData, type WordCloudDatum } from '../WordCloudChart';
import { useRequiredEChartsWordCloud } from '../renderers/wordcloud';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const turkishData = (): WordCloudDatum[] => [
  { name: 'Yazılım Geliştirici', value: 120 },
  { name: 'Kıdemli Analist', value: 96 },
  { name: 'Proje Müdürü', value: 82 },
  { name: 'İnsan Kaynakları Uzmanı', value: 74 },
  { name: 'Satış Temsilcisi', value: 68 },
];

const series = (): Array<Record<string, unknown>> =>
  (lastDispatchedOption()?.series as Array<Record<string, unknown>> | undefined) ?? [];

const tooltipFormatter = (): ((params: unknown) => string) | undefined =>
  (lastDispatchedOption()?.tooltip as { formatter?: (p: unknown) => string } | undefined)
    ?.formatter;

beforeEach(() => {
  resetEChartsMock();
  installJsdomPolyfills();
  (useRequiredEChartsWordCloud as ReturnType<typeof vi.fn>).mockReturnValue({ status: 'ready' });
});
afterEach(() => {
  restoreJsdomPolyfills();
});

/* ------------------------------------------------------------------ */
/*  Lazy gate lifecycle                                                */
/* ------------------------------------------------------------------ */

describe('WordCloudChart — lazy gate lifecycle', () => {
  it('empty data renders wordcloud-chart-empty and no option dispatch', () => {
    const { getByTestId } = render(<WordCloudChart data={[]} />);
    expect(getByTestId('wordcloud-chart-empty')).toBeTruthy();
    expect(lastDispatchedOption()).toBeNull();
  });

  it('all-invalid data normalises to empty and renders the empty sentinel', () => {
    const { getByTestId } = render(
      <WordCloudChart
        data={[
          { name: '', value: 100 },
          { name: 'Valid', value: 0 },
          { name: 'NegativeValue', value: -5 },
        ]}
      />,
    );
    expect(getByTestId('wordcloud-chart-empty')).toBeTruthy();
  });

  it('unsupported state renders wordcloud-chart-unsupported with reason', () => {
    (useRequiredEChartsWordCloud as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'unsupported',
      reason: 'wordcloud-import-failed',
    });
    const { getByTestId } = render(<WordCloudChart data={turkishData()} />);
    const el = getByTestId('wordcloud-chart-unsupported');
    expect(el.getAttribute('data-reason')).toBe('wordcloud-import-failed');
    expect(lastDispatchedOption()).toBeNull();
  });

  it('loading state renders wordcloud-chart-loading and no option dispatch', () => {
    (useRequiredEChartsWordCloud as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'loading',
    });
    const { getByTestId } = render(<WordCloudChart data={turkishData()} />);
    expect(getByTestId('wordcloud-chart-loading')).toBeTruthy();
    expect(lastDispatchedOption()).toBeNull();
  });

  it('ready state mounts ChartA11yShell and dispatches the option', () => {
    const { getByTestId } = render(<WordCloudChart data={turkishData()} animate={false} />);
    expect(getByTestId('wordcloud-chart')).toBeTruthy();
    expect(lastDispatchedOption()).not.toBeNull();
  });

  it('loading → ready rerender dispatches the wordCloud series after the gate flips', () => {
    (useRequiredEChartsWordCloud as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'loading',
    });
    const { getByTestId, rerender } = render(
      <WordCloudChart data={turkishData()} animate={false} />,
    );
    expect(getByTestId('wordcloud-chart-loading')).toBeTruthy();
    expect(lastDispatchedOption()).toBeNull();
    (useRequiredEChartsWordCloud as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'ready',
    });
    rerender(<WordCloudChart data={turkishData()} animate={false} />);
    expect(getByTestId('wordcloud-chart')).toBeTruthy();
    expect(series()[0].type).toBe('wordCloud');
  });

  it('unsupported aria-label suffixes the reason banner', () => {
    (useRequiredEChartsWordCloud as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'unsupported',
      reason: 'wordcloud-import-failed',
    });
    const { getByTestId } = render(<WordCloudChart data={turkishData()} title="Pozisyon Bulutu" />);
    const aria = getByTestId('wordcloud-chart-unsupported').getAttribute('aria-label') ?? '';
    expect(aria).toContain('Pozisyon Bulutu');
    expect(aria).toContain('yüklenemedi');
  });

  it('loading aria-label suffixes the loading message', () => {
    (useRequiredEChartsWordCloud as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'loading',
    });
    const { getByTestId } = render(<WordCloudChart data={turkishData()} title="Pozisyon Bulutu" />);
    const aria = getByTestId('wordcloud-chart-loading').getAttribute('aria-label') ?? '';
    expect(aria).toContain('Pozisyon Bulutu');
    expect(aria).toContain('yükleniyor');
  });
});

/* ------------------------------------------------------------------ */
/*  Series + passthrough                                               */
/* ------------------------------------------------------------------ */

describe('WordCloudChart — series + passthrough', () => {
  it('series type is wordCloud', () => {
    render(<WordCloudChart data={turkishData()} animate={false} />);
    expect(series()[0].type).toBe('wordCloud');
  });

  it.each([
    'circle',
    'cardioid',
    'diamond',
    'triangle-forward',
    'triangle',
    'pentagon',
    'star',
  ] as const)('shape "%s" flows to series.shape', (shape) => {
    render(<WordCloudChart data={turkishData()} shape={shape} animate={false} />);
    expect(series()[0].shape).toBe(shape);
  });

  it('default sizeRange / rotationRange / rotationStep / gridSize / drawOutOfBound / shrinkToFit', () => {
    render(<WordCloudChart data={turkishData()} animate={false} />);
    const s = series()[0];
    expect(s.sizeRange).toEqual([12, 60]);
    expect(s.rotationRange).toEqual([-90, 90]);
    expect(s.rotationStep).toBe(45);
    expect(s.gridSize).toBe(8);
    expect(s.drawOutOfBound).toBe(false);
    expect(s.shrinkToFit).toBe(true);
  });

  it('custom sizeRange / rotationRange / rotationStep / gridSize / drawOutOfBound / shrinkToFit pass through', () => {
    render(
      <WordCloudChart
        data={turkishData()}
        sizeRange={[16, 80]}
        rotationRange={[0, 0]}
        rotationStep={15}
        gridSize={4}
        drawOutOfBound
        shrinkToFit={false}
        animate={false}
      />,
    );
    const s = series()[0];
    expect(s.sizeRange).toEqual([16, 80]);
    expect(s.rotationRange).toEqual([0, 0]);
    expect(s.rotationStep).toBe(15);
    expect(s.gridSize).toBe(4);
    expect(s.drawOutOfBound).toBe(true);
    expect(s.shrinkToFit).toBe(false);
  });

  it('fontFamily flows into series.textStyle.fontFamily', () => {
    render(<WordCloudChart data={turkishData()} fontFamily="Inter, system-ui" animate={false} />);
    const ts = series()[0].textStyle as { fontFamily?: string };
    expect(ts.fontFamily).toBe('Inter, system-ui');
  });
});

/* ------------------------------------------------------------------ */
/*  Deterministic color callback                                       */
/* ------------------------------------------------------------------ */

describe('WordCloudChart — deterministic color palette', () => {
  it('colors callback returns palette[dataIndex % palette.length] — NOT random (Codex iter-1)', () => {
    render(
      <WordCloudChart
        data={turkishData()}
        colors={['#111111', '#222222', '#333333']}
        animate={false}
      />,
    );
    const ts = series()[0].textStyle as { color: (p: { dataIndex?: number }) => string };
    expect(typeof ts.color).toBe('function');
    expect(ts.color({ dataIndex: 0 })).toBe('#111111');
    expect(ts.color({ dataIndex: 1 })).toBe('#222222');
    expect(ts.color({ dataIndex: 2 })).toBe('#333333');
    // Cycles back after the palette length — deterministic, NOT random.
    expect(ts.color({ dataIndex: 3 })).toBe('#111111');
    expect(ts.color({ dataIndex: 4 })).toBe('#222222');
  });

  it('CSS var() colors resolve into the deterministic palette', () => {
    document.documentElement.style.setProperty('--wordcloud-test-color', '#abcdef');
    render(
      <WordCloudChart
        data={turkishData()}
        colors={['var(--wordcloud-test-color)', '#222222']}
        animate={false}
      />,
    );
    const ts = series()[0].textStyle as { color: (p: { dataIndex?: number }) => string };
    document.documentElement.style.removeProperty('--wordcloud-test-color');
    expect(ts.color({ dataIndex: 0 })).toBe('#abcdef');
    expect(ts.color({ dataIndex: 1 })).toBe('#222222');
  });

  it('colors callback survives a no-arg / undefined invocation (Codex iter-2 P2)', () => {
    // Codex iter-2 P2 hardening regression guard. Some echarts-wordcloud
    // code paths invoke style callbacks with no argument; the callback
    // must not crash and should fall back to palette[0].
    render(<WordCloudChart data={turkishData()} colors={['#111111', '#222222']} animate={false} />);
    const ts = series()[0].textStyle as { color: (p?: unknown) => string };
    expect(ts.color(undefined)).toBe('#111111');
    expect(ts.color(null)).toBe('#111111');
    expect(ts.color('not-an-object')).toBe('#111111');
  });
});

/* ------------------------------------------------------------------ */
/*  Tooltip + click                                                    */
/* ------------------------------------------------------------------ */

describe('WordCloudChart — tooltip + click', () => {
  it('tooltip formatter renders "word: value" HTML-escaped', () => {
    render(
      <WordCloudChart
        data={[{ name: '<Eng>', value: 50 }]}
        valueFormatter={(v) => `${v}k`}
        animate={false}
      />,
    );
    const fmt = tooltipFormatter();
    const html = fmt!({ name: '<Eng>', value: 50 });
    expect(html).not.toContain('<Eng>');
    expect(html).toContain('&lt;Eng&gt;');
    expect(html).toContain('50k');
  });

  it('onDataPointClick emits canonical { word, value, label, dataIndex }', () => {
    const onClick = vi.fn();
    render(<WordCloudChart data={turkishData()} onDataPointClick={onClick} animate={false} />);
    const handlers = clickListenerRegistrations();
    expect(handlers.length).toBeGreaterThan(0);
    handlers[handlers.length - 1]({
      name: 'Yazılım Geliştirici',
      value: 120,
      dataIndex: 0,
    });
    expect(onClick).toHaveBeenCalledTimes(1);
    const event = onClick.mock.calls[0][0];
    expect(event.value).toBe(120);
    expect(event.label).toBe('Yazılım Geliştirici');
    expect(event.datum).toMatchObject({
      word: 'Yazılım Geliştirici',
      value: 120,
      label: 'Yazılım Geliştirici',
      dataIndex: 0,
    });
  });
});

/* ------------------------------------------------------------------ */
/*  A11y SR data table                                                 */
/* ------------------------------------------------------------------ */

describe('WordCloudChart — a11y SR data table', () => {
  it('renders one hidden table row per word with Turkish chars intact', () => {
    const { container } = render(
      <WordCloudChart data={turkishData()} valueFormatter={(v) => `${v} kişi`} animate={false} />,
    );
    const text = container.querySelector('table')?.textContent ?? '';
    expect(text).toContain('Yazılım Geliştirici');
    expect(text).toContain('120 kişi');
    expect(text).toContain('İnsan Kaynakları Uzmanı');
  });
});

/* ------------------------------------------------------------------ */
/*  normalizeWordCloudData pure helper                                 */
/* ------------------------------------------------------------------ */

describe('normalizeWordCloudData', () => {
  it('drops empty / whitespace-only names', () => {
    const out = normalizeWordCloudData([
      { name: '', value: 10 },
      { name: '   ', value: 20 },
      { name: 'Valid', value: 30 },
    ]);
    expect(out).toEqual([{ name: 'Valid', value: 30 }]);
  });

  it('drops NaN / Infinity / non-positive values', () => {
    const out = normalizeWordCloudData([
      { name: 'a', value: Number.NaN },
      { name: 'b', value: Number.POSITIVE_INFINITY },
      { name: 'c', value: 0 },
      { name: 'd', value: -5 },
      { name: 'e', value: 5 },
    ]);
    expect(out).toEqual([{ name: 'e', value: 5 }]);
  });

  it('sorts descending by value', () => {
    const out = normalizeWordCloudData([
      { name: 'low', value: 10 },
      { name: 'mid', value: 50 },
      { name: 'high', value: 100 },
    ]);
    expect(out.map((d) => d.name)).toEqual(['high', 'mid', 'low']);
  });

  it('caps at maxWords (default 100)', () => {
    const huge = Array.from({ length: 250 }, (_, i) => ({ name: `w${i}`, value: 250 - i }));
    const out = normalizeWordCloudData(huge);
    expect(out).toHaveLength(100);
  });

  it('clamps maxWords to [1, 200]', () => {
    const huge = Array.from({ length: 300 }, (_, i) => ({ name: `w${i}`, value: 300 - i }));
    expect(normalizeWordCloudData(huge, 0)).toHaveLength(1);
    expect(normalizeWordCloudData(huge, 9999)).toHaveLength(200);
    expect(normalizeWordCloudData(huge, 50)).toHaveLength(50);
  });

  it('trims whitespace around names', () => {
    const out = normalizeWordCloudData([{ name: '  Trim Me  ', value: 5 }]);
    expect(out).toEqual([{ name: 'Trim Me', value: 5 }]);
  });
});
