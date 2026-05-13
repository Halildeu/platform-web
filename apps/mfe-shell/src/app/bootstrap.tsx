// frontend/mfe-shell/src/bootstrap.tsx
// AG Grid setup delegated to @mfe/design-system (single owner)

import React from 'react';
import { initRuntimeErrorMonitor } from './telemetry/runtime-error-monitor';

// 2026-05-10 stale-bundle deploy recovery: the actual install call
// happens in src/index.tsx BEFORE the dynamic import that loads
// this module — see Codex 019e1372 P1 absorb in PR #383. By the
// time bootstrap.tsx executes, listeners are already attached,
// so failures during initRuntimeErrorMonitor / Sentry init / MFE
// preload all benefit from the guard.

// 2026-04-25 Faz 19.11: Production console.warn suppress (Codex AGREE 019dc1ee)
// User bulgusu: tarayıcı F12'de yaratıcı console.warn spam'i (190 call site, 7 MFE).
// Pattern: API 401/403/network/parse fallback expected akışta console.warn.
// Strateji: Expected error'ları prod'da silent (Sentry zaten unexpected'leri yakalıyor).
// Migration path: packages/shared-http/apiLogger.ts (logExpected/logUnexpected helper).
// Bu shell-wide guard tüm MFE'lere yansır (module federation host).
if (typeof window !== 'undefined' && import.meta.env.PROD) {
  console.warn = () => {
    /* prod silent — expected fallback'ler için. Unexpected error'lar console.error + Sentry. */
  };
  // console.debug debug-only, prod'da gereksiz

  console.debug = () => {};
}

// Inject build-time env vars into window.__env__ so that
// design-system (separate chunk) can read them at runtime.
// Vite's define config replaces process.env with a JSON object.
if (typeof window !== 'undefined') {
  const w = window as unknown as { __env__?: Record<string, unknown> };
  w.__env__ = {
    ...(w.__env__ ?? {}),
    ...((typeof process !== 'undefined' && process.env) || {}),
  };
}

// PERF-INIT-V2 PR-B1a: AG Grid module registration moved OUT of shell
// bootstrap into each grid-using MFE bootstrap (mfe-users, mfe-access,
// mfe-reporting, mfe-audit) AND into the shell's design-lab ChartDetail
// page (component-level lazy import). Shell host no longer eager-loads
// the AG Grid Enterprise bundle (~6 MB) with /login or /home, so the
// chunk only appears when a grid actually renders.
//
// Previous comment said this was "SINGLE source of truth" — that holds at
// the design-system package level (setup.ts remains canonical), but the
// IMPORT POINT is now per-grid-consumer rather than shell-wide.

// Observability: init Sentry early, before React tree mounts
import { initSentry } from '../lib/sentry';
initSentry();

// RUM: Web Vitals collection after Sentry is ready
import { initRUM } from '../lib/rum';
import { setupPerformanceObservers, recordMark } from '../lib/perf-observer';
import { defaultSinks } from '../lib/rum-sinks';

// Legacy RUM (LCP/FID/CLS/TTFB only — backwards compatibility for existing
// Sentry transaction.setMeasurement consumers). Kept in parallel so this
// PR is non-breaking.
initRUM();

// PERF-INIT-V2 PR-M1: extended PerformanceObserver harness adds INP, FCP,
// long-task (TBT), custom marks, and resource summary. Installed once at
// bootstrap; exposes window.__perfSnapshot() for Playwright route-budget
// runner. See apps/mfe-shell/src/lib/perf-observer.ts + rum-sinks.ts.
setupPerformanceObservers(defaultSinks);
recordMark('shell:mounted');

// OpenTelemetry + Feature Flags (PERF-INIT-V2 PR-B3e: deferred to idle).
//   - initOtel() monkey-patches `fetch` for traceparent header injection.
//     It does NOT observe paint events.  React tree mounts BEFORE the
//     first protected API call, so deferring the patch to the next idle
//     window only risks losing trace headers on fetches that fire in the
//     first ~100ms (typical idle delay).  Worst case is bounded by the
//     1500ms timeout.
//   - initFeatureFlags() reads localStorage (dev only) and seeds an
//     in-memory Map.  No code path reads flags during the synchronous
//     bootstrap; route components query flags on demand AFTER React
//     mounts.
import { initOtel } from '../lib/otel';
import { initFeatureFlags } from '../lib/feature-flags';
import { scheduleOnIdle } from '../lib/idle-scheduler';

// Runtime browser error capture: early window errors + console.error +
// unhandled promise rejections are collected into a shell buffer and
// forwarded to shell telemetry when possible.  Stays eager so we catch
// failures from the very next tick of bootstrap.
initRuntimeErrorMonitor();

// Schedule the deferred inits AFTER initRuntimeErrorMonitor so source
// order mirrors the boundary matrix (Codex iter-1 P3 polish, thread
// 019e2088): eager observability/error capture first, then idle-batched
// non-paint inits.
scheduleOnIdle(
  () => {
    initOtel();
    initFeatureFlags();
  },
  { timeout: 1500 },
);

// Quiet-green: suppress known non-actionable console noise in development
if (process.env.NODE_ENV === 'development') {
  const KNOWN_NOISE = [
    'AG Grid:',
    'ag-grid',
    'Unknown event handler property',
    'onValueChange',
    'act(...)',
    'ReactDOM.render is no longer supported',
    'Vite CJS',
    // React 18.3 deprecation warning fired by 3rd-party libs (AG Grid, lucide-react)
    // that still use the old React.forwardRef((props) => ...) one-arg pattern.
    // Not actionable from our code; suppress in dev to reduce noise.
    'forwardRef render functions accept exactly two parameters',
  ];
  const origWarn = console.warn;
  const origError = console.error;
  console.warn = (...args: unknown[]) => {
    const msg = String(args[0] ?? '');
    if (KNOWN_NOISE.some((n) => msg.includes(n))) return;
    origWarn.apply(console, args);
  };
  console.error = (...args: unknown[]) => {
    const msg = String(args[0] ?? '');
    if (KNOWN_NOISE.some((n) => msg.includes(n))) return;
    origError.apply(console, args);
  };
}

import { createRoot } from 'react-dom/client';
import ShellApp from './ShellApp';

// PERF-INIT-V2 PR-B1a: AG Grid Enterprise license setter moved out of
// shell bootstrap. Each grid-using MFE (mfe-users/access/reporting/audit)
// now calls setupAgGridLicense() in its own bootstrap, so the license
// payload + module-federation share chain no longer eager-loads with
// shell. Shell's own design-lab ChartDetail page handles license at
// component-mount time.

const container = document.getElementById('root');
if (!container) {
  throw new Error('Uygulama baslatilamadi: root elementi bulunamadi.');
}
const root = createRoot(container);
root.render(<ShellApp />);
