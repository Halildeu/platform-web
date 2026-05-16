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

/**
 * Compact, JSON-serialisable rect. Native `DOMRectReadOnly` does not survive
 * the Playwright `page.evaluate` boundary, so layout-shift rects are flattened.
 */
export interface RectLite {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * One layout-shift source — the element that moved, with its before/after
 * rects. `node` is a readable selector-ish identifier (the live DOM Node
 * itself cannot cross the synthetic-harness JSON boundary).
 */
export interface LayoutShiftSource {
  node: string;
  previousRect: RectLite;
  currentRect: RectLite;
}

/**
 * One recorded layout-shift entry with per-shift source attribution. The CLS
 * metric (vitals.CLS) stays the Web Vitals session-window sum; `clsShifts` is
 * the orthogonal attribution channel — it answers "which element moved" so CLS
 * regressions can be diagnosed instead of merely measured.
 */
export interface ClsShiftRecord {
  value: number;
  startTime: number;
  sources: LayoutShiftSource[];
}

export interface PerfSnapshot {
  url: string;
  ts: number;
  vitals: Partial<Record<WebVitalEntry['name'], WebVitalEntry>>;
  /** Per-shift CLS source attribution (orthogonal to vitals.CLS). */
  clsShifts: ClsShiftRecord[];
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
  clsShifts: ClsShiftRecord[];
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

// --- CLS source attribution ------------------------------------------------

/**
 * A native `LayoutShift` attribution source. Typed locally because the DOM lib
 * does not ship `LayoutShift` / `LayoutShiftAttribution` in all TS configs.
 */
interface LayoutShiftAttribution {
  node?: Node | null;
  previousRect: DOMRectReadOnly;
  currentRect: DOMRectReadOnly;
}

// Bound memory on long synthetic runs. A 15-30s route capture rarely emits
// more than ~30 shifts; the cap is a defensive ceiling, and eviction keeps the
// largest-value shifts (the attribution-relevant ones).
const MAX_CLS_SHIFTS = 60;
const MAX_SOURCES_PER_SHIFT = 5;

/** Flatten a DOMRect to a compact, JSON-serialisable rect. */
export function rectLite(r: DOMRectReadOnly | undefined | null): RectLite {
  return {
    x: Math.round(r?.x ?? 0),
    y: Math.round(r?.y ?? 0),
    width: Math.round(r?.width ?? 0),
    height: Math.round(r?.height ?? 0),
  };
}

// Cap on an attribute token's length before it enters a CI log / the
// last-run.json artifact.
const ATTR_TOKEN_MAX_LEN = 40;

/**
 * Redact dynamic-looking fragments from a DOM attribute value before it enters
 * an attribution string. Layout-shift sources can be list rows etc. whose
 * id / data-testid embed record keys; emails, UUIDs and long digit runs are
 * redacted and the token is length-capped so the channel stays structural.
 */
export function sanitizeToken(raw: string): string {
  let v = raw
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[uuid]')
    .replace(/\d{5,}/g, '[n]');
  if (v.length > ATTR_TOKEN_MAX_LEN) v = `${v.slice(0, ATTR_TOKEN_MAX_LEN)}…`;
  return v;
}

/**
 * Produce a readable identifier for a layout-shift source node:
 * `parentTag#parentId > tag#id.firstClass[data-testid]`. Text nodes resolve to
 * their parent element; a detached/absent node yields a sentinel string.
 *
 * The identifier carries NO element text content, and every attribute value
 * (id / class / data-testid) is passed through `sanitizeToken` — emails,
 * UUIDs and long digit runs redacted, length capped. This is a text-free +
 * pattern-redacted channel, NOT a hard PII guarantee: a static attribute value
 * embedding sensitive text in another shape is still surfaced.
 */
export function describeNode(node: Node | null | undefined): string {
  if (!node) return '(detached)';
  const el: Element | null = node.nodeType === 1 ? (node as Element) : (node.parentElement ?? null);
  if (!el) return '(non-element)';
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${sanitizeToken(el.id)}` : '';
  const cls = el.classList && el.classList.length > 0 ? `.${sanitizeToken(el.classList[0])}` : '';
  const testId = el.getAttribute('data-testid');
  const tid = testId ? `[data-testid="${sanitizeToken(testId)}"]` : '';
  const parent = el.parentElement;
  const parentId = parent && parent.id ? `#${sanitizeToken(parent.id)}` : '';
  const parentDesc = parent ? `${parent.tagName.toLowerCase()}${parentId} > ` : '';
  return `${parentDesc}${tag}${id}${cls}${tid}`;
}

/**
 * Record one layout-shift entry's source attribution into observer state.
 * Orthogonal to the CLS metric computation — never mutates `clsValue`.
 */
function recordClsShift(
  value: number,
  startTime: number,
  sources: LayoutShiftAttribution[] | undefined,
): void {
  if (!_state) return;
  const mapped: LayoutShiftSource[] = (sources ?? []).slice(0, MAX_SOURCES_PER_SHIFT).map((s) => ({
    node: describeNode(s.node),
    previousRect: rectLite(s.previousRect),
    currentRect: rectLite(s.currentRect),
  }));
  _state.clsShifts.push({ value, startTime: Math.round(startTime), sources: mapped });
  if (_state.clsShifts.length > MAX_CLS_SHIFTS) {
    // Evict the smallest-value shift so dominant shifts survive the cap.
    let minIdx = 0;
    for (let i = 1; i < _state.clsShifts.length; i += 1) {
      if (_state.clsShifts[i].value < _state.clsShifts[minIdx].value) minIdx = i;
    }
    _state.clsShifts.splice(minIdx, 1);
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
    clsShifts: [],
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

  // INP — max event duration proxy. NOTE: Web Vitals INP spec requires
  // interactionId grouping + P98 across all interactions; this implementation
  // is a simpler max-duration approximation. Synthetic runners that do NOT
  // generate user interactions (e.g. PR-M1 default) will produce undefined
  // INP. Real INP requires interaction injection in PR-G1.
  // durationThreshold filters out trivial events to reduce noise.
  try {
    if (_state) {
      const obs = new PerformanceObserver((list) => {
        if (!_state) return;
        for (const entry of list.getEntries() as PerformanceEventTiming[]) {
          const duration = entry.duration;
          if (duration > _state.inpValue) {
            _state.inpValue = duration;
            dispatchVital(makeEntry('INP', duration));
          }
        }
      });
      obs.observe({
        type: 'event',
        buffered: true,
        durationThreshold: 16,
      } as PerformanceObserverInit);
      _state.observers.push(obs);
    }
  } catch {
    if (_state) _state.unsupported.push('event');
  }

  // FID — legacy, kept for backward compatibility
  tryObserve('first-input', (list) => {
    for (const entry of list.getEntries() as PerformanceEventTiming[]) {
      const fid = entry.processingStart - entry.startTime;
      dispatchVital(makeEntry('FID', fid));
    }
  });

  // CLS — Web Vitals session window algorithm
  // Spec: session window = 5 seconds total OR 1 second between shifts.
  // Reported value = max session window sum across all sessions.
  // Implementation tracks current window + best window seen so far.
  let sessionValue = 0;
  let sessionEntries: { startTime: number; value: number }[] = [];
  tryObserve('layout-shift', (list) => {
    if (!_state) return;
    for (const e of list.getEntries() as (PerformanceEntry & {
      value: number;
      hadRecentInput: boolean;
      sources?: LayoutShiftAttribution[];
    })[]) {
      if (e.hadRecentInput) continue;
      // Attribution channel: record which element(s) moved. Hard-isolated in a
      // try/catch — attribution must NEVER throw into the CLS metric path
      // (session-window sum + dispatchVital) below.
      try {
        recordClsShift(e.value, e.startTime, e.sources);
      } catch {
        /* attribution failure must not affect CLS metric computation */
      }
      const firstEntry = sessionEntries[0];
      const lastEntry = sessionEntries[sessionEntries.length - 1];
      // Continue session if within 1s of last entry AND within 5s of first.
      if (
        sessionEntries.length === 0 ||
        (e.startTime - (lastEntry?.startTime ?? 0) < 1000 &&
          e.startTime - (firstEntry?.startTime ?? e.startTime) < 5000)
      ) {
        sessionValue += e.value;
        sessionEntries.push({ startTime: e.startTime, value: e.value });
      } else {
        // Start a new window
        sessionValue = e.value;
        sessionEntries = [{ startTime: e.startTime, value: e.value }];
      }
      if (sessionValue > _state.clsValue) {
        _state.clsValue = sessionValue;
        dispatchVital({ ...makeEntry('CLS', _state.clsValue, 'unitless') });
      }
    }
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
    clsShifts: _state?.clsShifts ?? [],
    longTasks,
    longTaskCount: longTasks.length,
    longTaskTotalMs: Math.round(longTaskTotalMs),
    tbtMs: Math.round(tbtMs),
    customMarks: _state?.customMarks ?? [],
    resources: computeResourceSummary(),
    unsupported: _state?.unsupported ?? [],
  };
}

// Expose to window for Playwright/browser-side capture. Production builds
// disable the global by default; three opt-in paths:
//   1. Runtime: `window.__PERF_OBSERVER_ENABLE = 1` before bootstrap
//      (set by Playwright/synthetic harness via `addInitScript`).
//   2. Build-time: `VITE_PERF_OBSERVER_EXPOSE=1` env injected at build
//      (Vite `define` constant — see `apps/mfe-shell/vite.config.ts`).
//   3. Implicit dev: `NODE_ENV !== 'production'` (DX convenience).
//
// PERF-INIT-V2 PR-B5c-lite (Codex thread 019e20fa iter-2 finding):
// before B5c-lite the build-time path existed only as a code comment;
// no `define` constant nor any reader matched `VITE_PERF_OBSERVER_EXPOSE`.
// Now the build-time constant is wired so the doc and the implementation
// agree.
//
// Security note (Codex thread 019e1e1b finding 6): exposing this global
// in production lowers the bar for same-origin XSS to exfiltrate timing
// metadata, custom mark detail payloads, and resource URL lists. Raw
// PerformanceAPI is already same-origin readable; this just normalises
// it. Off-by-default in prod is the conservative choice.

declare const __PERF_OBSERVER_EXPOSE__: string | boolean | undefined;

export function shouldExposeGlobal(): boolean {
  if (typeof window === 'undefined') return false;
  // Runtime opt-in: synthetic harness sets this flag before bootstrap.
  const opted = (window as unknown as { __PERF_OBSERVER_ENABLE?: unknown }).__PERF_OBSERVER_ENABLE;
  if (opted === 1 || opted === '1' || opted === true) return true;
  // Build-time opt-in: `__PERF_OBSERVER_EXPOSE__` is defined by Vite's
  // `define` config from `VITE_PERF_OBSERVER_EXPOSE` env. When unset the
  // constant evaluates to `false`. When set to '1' or true, expose.
  // The `typeof` guard protects environments where the constant was not
  // injected (unit-test jsdom without Vite define).
  try {
    if (
      typeof __PERF_OBSERVER_EXPOSE__ !== 'undefined' &&
      (__PERF_OBSERVER_EXPOSE__ === '1' || __PERF_OBSERVER_EXPOSE__ === true)
    ) {
      return true;
    }
  } catch {
    // ReferenceError in environments without the define injection — fall
    // through to the NODE_ENV check.
  }
  // In dev (Vite serves NODE_ENV=development), expose by default for DX.
  if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production') {
    return true;
  }
  return false;
}

if (shouldExposeGlobal()) {
  (window as unknown as { __perfSnapshot?: () => PerfSnapshot }).__perfSnapshot = captureSnapshot;
  (window as unknown as { __perfMark?: (name: string, detail?: unknown) => void }).__perfMark =
    recordMark;
}
