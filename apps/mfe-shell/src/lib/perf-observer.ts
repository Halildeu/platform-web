/**
 * PERF-INIT-V2 PR-M1: PerformanceObserver harness.
 *
 * Wraps native PerformanceObserver to collect Web Vitals + custom marks +
 * resource summary. Exposes metrics via two sinks:
 *   - reportSink (default): Sentry transaction.setMeasurement + OTel span event
 *   - jsonSink: emit a serialisable summary for Playwright route-budget runner
 *
 * Designed to be:
 *   - Bootstrap-time installable (call setupPerformanceObservers() once)
 *   - Cleanup-safe (returns disposer)
 *   - Low-overhead (no long task on the boot path — verified in PMD §4.5
 *     PR-B3e audit if main-thread cost exceeds 50ms)
 *
 * Covers PMD §2.1 KPI matrix metrics:
 *   LCP, FCP, INP, CLS, FID (legacy), TBT (long-task derived),
 *   custom marks: auth:sso:start/end, shell:mounted, home:first-content,
 *                 route:interactive
 *   resource summary: transfer/decoded/jsDecoded/cssDecoded, resourceCount,
 *                     cacheHitCount, protocol histogram, heap, navigation timing
 */

export interface WebVitalEntry {
  name: 'LCP' | 'FCP' | 'INP' | 'CLS' | 'FID' | 'TTFB' | 'TBT';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  unit: 'millisecond' | 'count' | 'unitless';
  id: string;
  ts: number;
}

export interface LongTaskEntry {
  duration: number;
  startTime: number;
  attribution?: string;
}

export interface CustomMark {
  name: string;
  startTime: number;
  detail?: unknown;
}

export interface ResourceSummary {
  resourceCount: number;
  totalTransferKB: number;
  totalDecodedKB: number;
  jsTransferKB: number;
  jsDecodedKB: number;
  cssTransferKB: number;
  cssDecodedKB: number;
  cacheHitCount: number;
  protocolHistogram: Record<string, number>;
  navigationTtfbMs: number;
  navigationDclMs: number;
  navigationLoadMs: number;
  heapUsedMB?: number;
}

export interface PerfSnapshot {
  url: string;
  ts: number;
  vitals: Partial<Record<WebVitalEntry['name'], WebVitalEntry>>;
  longTasks: LongTaskEntry[];
  longTaskCount: number;
  longTaskTotalMs: number;
  tbtMs: number; // sum(max(0, duration-50)) over long tasks
  customMarks: CustomMark[];
  resources: ResourceSummary;
  unsupported: string[];
}

export interface Sink {
  report(entry: WebVitalEntry): void;
  longTask?(entry: LongTaskEntry): void;
  mark?(entry: CustomMark): void;
  snapshot?(snap: PerfSnapshot): void;
}

const THRESHOLDS: Record<WebVitalEntry['name'], { good: number; poor: number }> = {
  LCP: { good: 2500, poor: 4000 },
  FCP: { good: 1800, poor: 3000 },
  INP: { good: 200, poor: 500 },
  CLS: { good: 0.1, poor: 0.25 },
  FID: { good: 100, poor: 300 },
  TTFB: { good: 800, poor: 1800 },
  TBT: { good: 200, poor: 600 },
};

function rate(name: WebVitalEntry['name'], value: number): WebVitalEntry['rating'] {
  const t = THRESHOLDS[name];
  if (!t) return 'good';
  if (value <= t.good) return 'good';
  if (value <= t.poor) return 'needs-improvement';
  return 'poor';
}

function makeEntry(
  name: WebVitalEntry['name'],
  value: number,
  unit: WebVitalEntry['unit'] = 'millisecond',
): WebVitalEntry {
  return {
    name,
    value,
    rating: rate(name, value),
    unit,
    id: `${name.toLowerCase()}-${Date.now()}`,
    ts: Date.now(),
  };
}

interface ObserverState {
  observers: PerformanceObserver[];
  customMarks: CustomMark[];
  longTasks: LongTaskEntry[];
  vitals: Partial<Record<WebVitalEntry['name'], WebVitalEntry>>;
  clsValue: number;
  inpValue: number;
  unsupported: string[];
  sinks: Sink[];
}

let _state: ObserverState | null = null;

function tryObserve(type: string, cb: (list: PerformanceObserverEntryList) => void): void {
  if (!_state) return;
  try {
    const obs = new PerformanceObserver((list) => cb(list));
    obs.observe({ type, buffered: true });
    _state.observers.push(obs);
  } catch {
    _state.unsupported.push(type);
  }
}

function dispatchVital(entry: WebVitalEntry): void {
  if (!_state) return;
  _state.vitals[entry.name] = entry;
  for (const s of _state.sinks) {
    try {
      s.report(entry);
    } catch {
      /* sink error must not propagate */
    }
  }
}

function dispatchLongTask(lt: LongTaskEntry): void {
  if (!_state) return;
  _state.longTasks.push(lt);
  for (const s of _state.sinks) {
    if (s.longTask) {
      try {
        s.longTask(lt);
      } catch {
        /* swallow */
      }
    }
  }
}

function dispatchMark(m: CustomMark): void {
  if (!_state) return;
  _state.customMarks.push(m);
  for (const s of _state.sinks) {
    if (s.mark) {
      try {
        s.mark(m);
      } catch {
        /* swallow */
      }
    }
  }
}

/**
 * Setup all PerformanceObservers. Returns a disposer that unobserves and
 * tears down state. Safe to call once at bootstrap.
 *
 * @param sinks one or more sinks; missing sinks default to console-only in dev.
 */
export function setupPerformanceObservers(sinks: Sink[] = []): () => void {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
    return () => undefined;
  }

  if (_state) {
    // Already initialised; return existing disposer
    return () => disposePerformanceObservers();
  }

  _state = {
    observers: [],
    customMarks: [],
    longTasks: [],
    vitals: {},
    clsValue: 0,
    inpValue: 0,
    unsupported: [],
    sinks,
  };

  // LCP — last entry wins
  tryObserve('largest-contentful-paint', (list) => {
    const entries = list.getEntries();
    const last = entries[entries.length - 1];
    if (last) dispatchVital(makeEntry('LCP', last.startTime));
  });

  // FCP via paint observer
  tryObserve('paint', (list) => {
    for (const e of list.getEntries()) {
      if (e.name === 'first-contentful-paint') {
        dispatchVital(makeEntry('FCP', e.startTime));
      }
    }
  });

  // INP — max event duration (modern; replaces FID)
  tryObserve('event', (list) => {
    if (!_state) return;
    for (const entry of list.getEntries() as PerformanceEventTiming[]) {
      const duration = entry.duration;
      if (duration > _state.inpValue) {
        _state.inpValue = duration;
        dispatchVital(makeEntry('INP', duration));
      }
    }
  });

  // FID — legacy, kept for backward compatibility
  tryObserve('first-input', (list) => {
    for (const entry of list.getEntries() as PerformanceEventTiming[]) {
      const fid = entry.processingStart - entry.startTime;
      dispatchVital(makeEntry('FID', fid));
    }
  });

  // CLS — cumulative
  tryObserve('layout-shift', (list) => {
    if (!_state) return;
    for (const entry of list.getEntries() as PerformanceEntry[] &
      { value: number; hadRecentInput: boolean }[]) {
      if (!entry.hadRecentInput) {
        _state.clsValue += entry.value;
      }
    }
    dispatchVital({ ...makeEntry('CLS', _state.clsValue, 'unitless') });
  });

  // Long tasks — TBT proxy (sum of duration > 50ms)
  tryObserve('longtask', (list) => {
    for (const entry of list.getEntries()) {
      dispatchLongTask({
        duration: entry.duration,
        startTime: entry.startTime,
        attribution: (entry as unknown as { attribution?: { name: string }[] }).attribution?.[0]
          ?.name,
      });
    }
  });

  // TTFB from navigation timing
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (nav) {
      dispatchVital(makeEntry('TTFB', nav.responseStart));
    }
  } catch {
    _state.unsupported.push('navigation');
  }

  return () => disposePerformanceObservers();
}

export function disposePerformanceObservers(): void {
  if (!_state) return;
  for (const obs of _state.observers) {
    try {
      obs.disconnect();
    } catch {
      /* ignore */
    }
  }
  _state = null;
}

// --- Custom marks API ------------------------------------------------------

/**
 * Record a custom mark with optional detail payload.
 * Always uses performance.mark() for native tooling visibility + records
 * in our state for snapshot extraction.
 */
export function recordMark(name: string, detail?: unknown): void {
  if (typeof performance === 'undefined') return;
  try {
    performance.mark(
      name,
      detail !== undefined ? ({ detail } as unknown as PerformanceMarkOptions) : undefined,
    );
  } catch {
    /* native mark unavailable */
  }
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  dispatchMark({ name, startTime, detail });
}

// --- Snapshot ---------------------------------------------------------------

function computeResourceSummary(): ResourceSummary {
  const resources = (
    typeof performance !== 'undefined' ? performance.getEntriesByType('resource') : []
  ) as PerformanceResourceTiming[];

  let totalTransfer = 0;
  let totalDecoded = 0;
  let jsTransfer = 0;
  let jsDecoded = 0;
  let cssTransfer = 0;
  let cssDecoded = 0;
  let cacheHits = 0;
  const protocolHist: Record<string, number> = {};

  for (const r of resources) {
    totalTransfer += r.transferSize || 0;
    totalDecoded += r.decodedBodySize || 0;
    const isCacheHit = r.transferSize === 0 && (r.encodedBodySize || 0) > 0;
    if (isCacheHit) cacheHits += 1;

    const proto = r.nextHopProtocol || 'unknown';
    protocolHist[proto] = (protocolHist[proto] || 0) + 1;

    const url = r.name;
    if (/\.(m?js)(\?|$)/.test(url) || r.initiatorType === 'script') {
      jsTransfer += r.transferSize || 0;
      jsDecoded += r.decodedBodySize || 0;
    } else if (/\.css(\?|$)/.test(url) || r.initiatorType === 'link' || r.initiatorType === 'css') {
      cssTransfer += r.transferSize || 0;
      cssDecoded += r.decodedBodySize || 0;
    }
  }

  const nav =
    typeof performance !== 'undefined'
      ? (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)
      : undefined;

  const memory =
    typeof performance !== 'undefined'
      ? (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
      : undefined;

  return {
    resourceCount: resources.length,
    totalTransferKB: Math.round(totalTransfer / 1024),
    totalDecodedKB: Math.round(totalDecoded / 1024),
    jsTransferKB: Math.round(jsTransfer / 1024),
    jsDecodedKB: Math.round(jsDecoded / 1024),
    cssTransferKB: Math.round(cssTransfer / 1024),
    cssDecodedKB: Math.round(cssDecoded / 1024),
    cacheHitCount: cacheHits,
    protocolHistogram: protocolHist,
    navigationTtfbMs: nav ? Math.round(nav.responseStart - nav.requestStart) : 0,
    navigationDclMs: nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : 0,
    navigationLoadMs: nav ? Math.round(nav.loadEventEnd - nav.startTime) : 0,
    heapUsedMB: memory ? Math.round(memory.usedJSHeapSize / 1048576) : undefined,
  };
}

/**
 * Capture the current performance snapshot. Useful for Playwright route
 * budget runner — exposed to `window` as `__perfSnapshot()` for browser
 * automation harnesses.
 */
export function captureSnapshot(): PerfSnapshot {
  const longTasks = _state?.longTasks ?? [];
  const longTaskTotalMs = longTasks.reduce((s, t) => s + t.duration, 0);
  const tbtMs = longTasks.reduce((s, t) => s + Math.max(0, t.duration - 50), 0);

  return {
    url: typeof window !== 'undefined' ? window.location.href : '',
    ts: Date.now(),
    vitals: _state?.vitals ?? {},
    longTasks,
    longTaskCount: longTasks.length,
    longTaskTotalMs: Math.round(longTaskTotalMs),
    tbtMs: Math.round(tbtMs),
    customMarks: _state?.customMarks ?? [],
    resources: computeResourceSummary(),
    unsupported: _state?.unsupported ?? [],
  };
}

// Expose to window for Playwright/browser-side capture
if (typeof window !== 'undefined') {
  (window as unknown as { __perfSnapshot?: () => PerfSnapshot }).__perfSnapshot = captureSnapshot;
  (window as unknown as { __perfMark?: (name: string, detail?: unknown) => void }).__perfMark =
    recordMark;
}
