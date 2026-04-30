// @vitest-environment jsdom
/**
 * Deep functional tests for PerfUtilityDemoLive.
 *
 * Each helper is run for real (no mock) — they are pure functions, hooks,
 * or a class with deterministic semantics. Mutation discipline:
 *
 *   - "skip the click handler"          → result panel never populates
 *   - "wrong threshold semantics"       → LTTB output count is wrong
 *   - "drop progressive-render batch"   → progress never reaches 1
 *   - "weak intersection-observer ref"  → shouldRender stuck on false
 *   - "non-LRU eviction order"          → keys snapshot mismatches
 *   - "swallow unknown-type error"      → code-split error path missing
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import PerfUtilityDemoLive from '../PerfUtilityDemoLive';

/* ------------------------------------------------------------------ */
/*  IntersectionObserver polyfill (jsdom does not ship one)            */
/* ------------------------------------------------------------------ */

class IntersectionObserverPolyfill implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin = '0px';
  readonly thresholds: ReadonlyArray<number> = [0];

  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe = vi.fn((target: Element) => {
    // Synchronously fire the callback as if the element is intersecting.
    this.callback(
      [
        {
          isIntersecting: true,
          target,
          intersectionRatio: 1,
          time: 0,
          boundingClientRect: target.getBoundingClientRect(),
          intersectionRect: target.getBoundingClientRect(),
          rootBounds: null,
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    );
  });
  disconnect = vi.fn();
  unobserve = vi.fn();
  takeRecords = vi.fn(() => []);
}

const originalIntersectionObserver = (
  globalThis as { IntersectionObserver?: typeof IntersectionObserver }
).IntersectionObserver;

beforeEach(() => {
  (globalThis as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver =
    IntersectionObserverPolyfill as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  if (originalIntersectionObserver) {
    (globalThis as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver =
      originalIntersectionObserver;
  } else {
    delete (globalThis as { IntersectionObserver?: typeof IntersectionObserver })
      .IntersectionObserver;
  }
});

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('PerfUtilityDemoLive — lttb', () => {
  it('downsamples 1000 points to the configured threshold (100)', () => {
    render(<PerfUtilityDemoLive utilityId="lttb" />);
    fireEvent.click(screen.getByTestId('perf-lttb-run'));
    const text = screen.getByTestId('perf-lttb-result-text').textContent ?? '';
    expect(text).toMatch(/input:\s*1000/);
    expect(text).toMatch(/output:\s*100/);
  });

  it('threshold above input length passes data through unchanged', () => {
    render(<PerfUtilityDemoLive utilityId="lttb" />);
    fireEvent.change(screen.getByTestId('perf-lttb-input'), { target: { value: '50' } });
    fireEvent.change(screen.getByTestId('perf-lttb-threshold'), { target: { value: '200' } });
    fireEvent.click(screen.getByTestId('perf-lttb-run'));
    const text = screen.getByTestId('perf-lttb-result-text').textContent ?? '';
    expect(text).toMatch(/input:\s*50/);
    expect(text).toMatch(/output:\s*50/);
  });
});

describe('PerfUtilityDemoLive — progressive-render', () => {
  it('streams 1000 points until the rendered count reaches the source size', async () => {
    render(<PerfUtilityDemoLive utilityId="progressive-render" />);
    fireEvent.click(screen.getByTestId('perf-progressive-render-run'));

    // The hook is RAF-driven and will progress over a few frames in jsdom.
    await waitFor(
      () => {
        const rendered = screen.getByTestId('perf-progressive-render-rendered').textContent ?? '';
        expect(rendered).toMatch(/rendered:\s*1000\s*\/\s*1000/);
      },
      { timeout: 5_000 },
    );
    const progress = screen.getByTestId('perf-progressive-render-progress').textContent ?? '';
    expect(progress).toMatch(/progress:\s*100%/);
    expect(progress).toMatch(/isComplete:\s*true/);
  });
});

describe('PerfUtilityDemoLive — lazy-chart', () => {
  it('flips shouldRender to true once the container intersects the viewport', async () => {
    render(<PerfUtilityDemoLive utilityId="lazy-chart" />);
    await waitFor(() => {
      const state = screen.getByTestId('perf-lazy-chart-state').textContent ?? '';
      expect(state).toMatch(/shouldRender:\s*true/);
    });
  });
});

describe('PerfUtilityDemoLive — lru-cache', () => {
  it('respects max-size 3 and evicts the oldest key on overflow', () => {
    render(<PerfUtilityDemoLive utilityId="lru-cache" />);
    fireEvent.click(screen.getByTestId('perf-lru-cache-add-abc'));
    expect(screen.getByTestId('perf-lru-cache-keys')).toHaveTextContent('keys: [a, b, c]');

    fireEvent.click(screen.getByTestId('perf-lru-cache-add-d'));
    expect(screen.getByTestId('perf-lru-cache-keys')).toHaveTextContent('keys: [b, c, d]');

    fireEvent.click(screen.getByTestId('perf-lru-cache-lookup'));
    const lookup = screen.getByTestId('perf-lru-cache-lookup-result').textContent ?? '';
    expect(lookup).toMatch(/a=miss/);
    expect(lookup).toMatch(/b=2/);
    expect(lookup).toMatch(/c=3/);
    expect(lookup).toMatch(/d=4/);
  });
});

describe('PerfUtilityDemoLive — code-split', () => {
  it('lazyChartImport returns a React.lazy wrapper for a known chart type', () => {
    render(<PerfUtilityDemoLive utilityId="code-split" />);
    fireEvent.click(screen.getByTestId('perf-code-split-run'));
    expect(screen.getByTestId('perf-code-split-success')).toBeInTheDocument();
    expect(screen.queryByTestId('perf-code-split-error')).toBeNull();
  });

  it('throws and surfaces the error message when the chart type is unknown', () => {
    render(<PerfUtilityDemoLive utilityId="code-split" />);
    fireEvent.change(screen.getByTestId('perf-code-split-select'), {
      target: { value: 'bogus' },
    });
    fireEvent.click(screen.getByTestId('perf-code-split-run'));
    const error = screen.getByTestId('perf-code-split-error');
    expect(error.textContent).toMatch(/Unknown lazy chart type:\s*bogus/);
    expect(screen.queryByTestId('perf-code-split-success')).toBeNull();
  });
});
