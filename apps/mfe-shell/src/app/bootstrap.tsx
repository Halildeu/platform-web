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

// Side-effect import: registers all AG Grid modules + license
// This is the SINGLE source of truth for module registration.
// Do NOT register AG Grid modules anywhere else in the monorepo.
import '@mfe/design-system/advanced/data-grid/setup';

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

// OpenTelemetry: distributed trace context propagation
import { initOtel } from '../lib/otel';
initOtel();

// Feature flags: runtime kill switches for safe rollout
import { initFeatureFlags } from '../lib/feature-flags';
initFeatureFlags();

// Runtime browser error capture: early window errors + console.error +
// unhandled promise rejections are collected into a shell buffer and
// forwarded to shell telemetry when possible.
initRuntimeErrorMonitor();

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
import { setupAgGridLicense } from '@mfe/design-system';
import ShellApp from './ShellApp';

// AG Grid lisansını MFE'ler yüklenmeden önce set et
setupAgGridLicense();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Uygulama baslatilamadi: root elementi bulunamadi.');
}
const root = createRoot(container);
root.render(<ShellApp />);
