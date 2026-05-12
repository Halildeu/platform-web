/**
 * PERF-INIT-V2 PR-M1: RUM sinks (Sentry transaction + OTel span event +
 * dev console).
 *
 * Bridges PerformanceObserver entries to the Sentry/OTel instrumentation
 * already in place. Designed to NOT block boot path or generate long
 * tasks of its own (PMD §4.5 PR-B3e audit gate).
 */

import type { Sink, WebVitalEntry, LongTaskEntry, CustomMark, PerfSnapshot } from './perf-observer';

/**
 * Sentry sink — uses dynamic optional resolution to avoid breaking when
 * Sentry SDK is not bundled (e.g. in test/dev environments).
 *
 * The global `window.__SENTRY__` pattern is fragile but matches the existing
 * rum.ts contract; PMD §4.5 PR-B3e covers replacing this with a proper
 * Sentry SDK import once measurement gate is stable.
 */
export const sentrySink: Sink = {
  report(entry: WebVitalEntry): void {
    if (typeof window === 'undefined') return;
    const sentry = (
      window as unknown as {
        __SENTRY__?: { setMeasurement?: (name: string, value: number, unit: string) => void };
      }
    ).__SENTRY__;
    if (sentry?.setMeasurement) {
      try {
        sentry.setMeasurement(entry.name, entry.value, entry.unit);
      } catch {
        /* sentry contract changed; silent */
      }
    }
  },
  longTask(lt: LongTaskEntry): void {
    if (typeof window === 'undefined') return;
    const sentry = (window as unknown as { __SENTRY__?: { addBreadcrumb?: (b: unknown) => void } })
      .__SENTRY__;
    if (sentry?.addBreadcrumb) {
      try {
        sentry.addBreadcrumb({
          category: 'performance',
          message: `long-task ${Math.round(lt.duration)}ms`,
          data: { startTime: lt.startTime, attribution: lt.attribution },
          level: lt.duration > 200 ? 'warning' : 'info',
        });
      } catch {
        /* silent */
      }
    }
  },
  mark(m: CustomMark): void {
    if (typeof window === 'undefined') return;
    const sentry = (window as unknown as { __SENTRY__?: { addBreadcrumb?: (b: unknown) => void } })
      .__SENTRY__;
    if (sentry?.addBreadcrumb) {
      try {
        sentry.addBreadcrumb({
          category: 'perf.mark',
          message: m.name,
          data: { startTime: m.startTime, detail: m.detail },
          level: 'info',
        });
      } catch {
        /* silent */
      }
    }
  },
};

/**
 * OTel sink — emits span events on the current active span if OTel API
 * is bundled and the global tracer is reachable.
 */
export const otelSink: Sink = {
  report(entry: WebVitalEntry): void {
    if (typeof window === 'undefined') return;
    const trace = (
      window as unknown as {
        __otelTrace?: {
          getActiveSpan?: () => {
            addEvent?: (n: string, attrs: Record<string, unknown>) => void;
          } | null;
        };
      }
    ).__otelTrace;
    const span = trace?.getActiveSpan?.();
    if (span?.addEvent) {
      try {
        span.addEvent(`vital.${entry.name}`, {
          'metric.value': entry.value,
          'metric.unit': entry.unit,
          'metric.rating': entry.rating,
        });
      } catch {
        /* silent */
      }
    }
  },
};

/**
 * Dev console sink — colourised LCP/FCP/INP/CLS/FID/TTFB output. No-op in
 * production builds. Long tasks and marks only printed for explicit dev opt-in.
 */
export const devConsoleSink: Sink = {
  report(entry: WebVitalEntry): void {
    if (typeof process === 'undefined' || process.env.NODE_ENV !== 'development') return;
    const color = entry.rating === 'good' ? '32' : entry.rating === 'poor' ? '31' : '33';

    console.log(
      `[RUM] \x1b[${color}m${entry.name}: ${typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value} ${entry.unit} (${entry.rating})\x1b[0m`,
    );
  },
};

/**
 * Snapshot sink — keeps the last snapshot in memory and exposes it via
 * window.__perfSnapshotLast for retrieval by Playwright route-budget runner.
 * Designed for synthetic test contexts; not used in production RUM.
 */
export const snapshotSink: Sink = {
  report(): void {
    /* per-entry no-op; snapshot retrieved on demand */
  },
  snapshot(snap: PerfSnapshot): void {
    if (typeof window === 'undefined') return;
    (window as unknown as { __perfSnapshotLast?: PerfSnapshot }).__perfSnapshotLast = snap;
  },
};

/**
 * Default sink chain — what bootstrap.tsx wires up. Order matters only
 * for log readability (dev console last so timing reflects sink overhead).
 */
export const defaultSinks: Sink[] = [sentrySink, otelSink, snapshotSink, devConsoleSink];
