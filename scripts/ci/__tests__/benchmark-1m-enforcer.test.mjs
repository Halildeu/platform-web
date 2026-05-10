/**
 * benchmark-1m-enforcer.mjs synthetic fixtures — Faz 21.11 PR-A1.6c.
 *
 * Drives every branch of the pure `evaluateBenchmarkArtifact` so the
 * production enforcer can be trusted to fail-closed on the right
 * inputs without spinning up Playwright. Fixture shapes match the
 * `design-lab-scatter-benchmark.v2` contract emitted by
 * `apps/mfe-shell/src/pages/admin/design-lab/pages/BenchmarkRoute.tsx`.
 *
 * Runs with `node --test` (the same runner the rest of `scripts/`
 * uses — see `package.json scripts.tokens:test`). Plain `assert`
 * invariants, no vitest, no jsdom.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBenchmarkArtifact, buildSummaryMarkdown } from '../benchmark-1m-enforcer.mjs';

const SCHEMA_VERSION = 'design-lab-scatter-benchmark.v2';

const RUN_COUNTS = {
  medium: { warmup: 1, measured: 3 },
  large: { warmup: 1, measured: 3 },
  million: { warmup: 2, measured: 5 },
};

const THRESHOLDS = {
  [SCHEMA_VERSION]: {
    cases: {
      'uniform/million/webgl': {
        medianRenderMsMax: 1500,
        baselineRegressionMaxPct: 10,
        requiredRunnerProfile: 'self-hosted-gpu',
      },
      'uniform/million/canvas-lttb': {
        medianRenderMsMax: 800,
        baselineRegressionMaxPct: 15,
        requiredRunnerProfile: 'self-hosted-gpu',
      },
    },
  },
};

function makeRow(overrides = {}) {
  return {
    runId: 'r1',
    runIndex: 1,
    fixture: 'uniform',
    tier: 'million',
    backend: 'webgl',
    sourceCount: 1_000_000,
    renderedCount: 1_000_000,
    prepMs: 0,
    renderMs: 1200,
    fpsAvg: 60,
    fpsP95DropPct: 0,
    heapBeforeMB: 100,
    heapAfterMB: 200,
    memoryAvailable: true,
    browser: 'chrome',
    viewport: '1280x800',
    timestamp: '2026-05-10T00:00:00Z',
    settledSource: 'finished',
    fixtureGenerateMs: 250,
    fixtureCacheHit: false,
    routeRenderMs: 1300,
    glImportStatus: 'already-registered',
    glImportMs: 0,
    webglSupported: true,
    ...overrides,
  };
}

function makeArtifact(rows, envOverrides = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    runId: 'r1',
    environment: {
      browser: 'chrome',
      userAgent: 'mock',
      viewport: '1280x800',
      memoryApi: 'chromium-performance-memory',
      route: '/admin/design-lab/benchmark',
      measurementMode: 'echarts-finished-2raf',
      runCounts: RUN_COUNTS,
      notes: [],
      runner: { profile: 'self-hosted-gpu', gpuRenderer: 'NVIDIA A10G', chromeVersion: '125' },
      ...envOverrides,
    },
    summary: {
      medianRenderMsByCase: {},
      bestRenderMsByCase: {},
    },
    results: rows,
  };
}

function fillCase(rows, overrides = {}) {
  for (let i = 1; i <= 5; i++) {
    rows.push(makeRow({ ...overrides, runIndex: i }));
  }
}

test('evaluateBenchmarkArtifact: pass when median sits under cap and runner matches (workflow_dispatch + missing baseline)', () => {
  const rows = [];
  fillCase(rows, { renderMs: 1200 });
  fillCase(rows, { backend: 'canvas-lttb', renderMs: 600 });
  const artifact = makeArtifact(rows);
  const v = evaluateBenchmarkArtifact({
    artifact,
    baseline: null,
    thresholds: THRESHOLDS,
    mode: 'workflow_dispatch',
  });
  assert.equal(v.ok, true);
  const webgl = v.cases.find((c) => c.case === 'uniform/million/webgl');
  assert.equal(webgl.verdict, 'warn'); // baseline missing → warn
  assert.ok(Math.abs(webgl.medianMs - 1200) < 0.001);
});

test('evaluateBenchmarkArtifact: fail when WebGL median exceeds the absolute hard cap', () => {
  const rows = [];
  fillCase(rows, { renderMs: 1700 });
  fillCase(rows, { backend: 'canvas-lttb', renderMs: 600 });
  const artifact = makeArtifact(rows);
  const v = evaluateBenchmarkArtifact({
    artifact,
    baseline: null,
    thresholds: THRESHOLDS,
    mode: 'workflow_dispatch',
  });
  assert.equal(v.ok, false);
  assert.match(v.reason, /uniform\/million\/webgl/);
});

test('evaluateBenchmarkArtifact: fail when regression vs main baseline exceeds the configured max percent', () => {
  const rows = [];
  fillCase(rows, { renderMs: 1200 });
  fillCase(rows, { backend: 'canvas-lttb', renderMs: 600 });
  const artifact = makeArtifact(rows);
  const baseline = {
    schemaVersion: SCHEMA_VERSION,
    summary: {
      medianRenderMsByCase: {
        'uniform/million/webgl': 1000,
        'uniform/million/canvas-lttb': 500,
      },
    },
    environment: artifact.environment,
  };
  // 1200 vs baseline 1000 → 20% regression > 10% cap.
  const v = evaluateBenchmarkArtifact({
    artifact,
    baseline,
    thresholds: THRESHOLDS,
    mode: 'pr',
  });
  assert.equal(v.ok, false);
  const webgl = v.cases.find((c) => c.case === 'uniform/million/webgl');
  assert.ok(Math.abs(webgl.regressionPct - 20) < 0.5);
  assert.match(webgl.reasons.join(' '), /effective threshold/);
});

test('evaluateBenchmarkArtifact: PR mode fail-closes when baseline is missing', () => {
  const rows = [];
  fillCase(rows, { renderMs: 1200 });
  fillCase(rows, { backend: 'canvas-lttb', renderMs: 600 });
  const artifact = makeArtifact(rows);
  const v = evaluateBenchmarkArtifact({
    artifact,
    baseline: null,
    thresholds: THRESHOLDS,
    mode: 'pr',
  });
  assert.equal(v.ok, false);
  const webgl = v.cases.find((c) => c.case === 'uniform/million/webgl');
  assert.match(webgl.reasons.join(' '), /baseline artifact missing/);
});

test('evaluateBenchmarkArtifact: workflow_dispatch keeps running when baseline is missing (absolute-only)', () => {
  const rows = [];
  fillCase(rows, { renderMs: 1400 });
  fillCase(rows, { backend: 'canvas-lttb', renderMs: 600 });
  const artifact = makeArtifact(rows);
  const v = evaluateBenchmarkArtifact({
    artifact,
    baseline: null,
    thresholds: THRESHOLDS,
    mode: 'workflow_dispatch',
  });
  assert.equal(v.ok, true);
  const webgl = v.cases.find((c) => c.case === 'uniform/million/webgl');
  assert.equal(webgl.verdict, 'warn');
  assert.match(webgl.notes.join(' '), /absolute-only/);
});

test('evaluateBenchmarkArtifact: fail when runner profile does not match the required profile', () => {
  const rows = [];
  fillCase(rows, { renderMs: 1200 });
  fillCase(rows, { backend: 'canvas-lttb', renderMs: 600 });
  const artifact = makeArtifact(rows, {
    runner: { profile: 'github-hosted-trend', gpuRenderer: 'SwiftShader', chromeVersion: '125' },
  });
  const v = evaluateBenchmarkArtifact({
    artifact,
    baseline: null,
    thresholds: THRESHOLDS,
    mode: 'workflow_dispatch',
  });
  assert.equal(v.ok, false);
  assert.match(v.reason, /runner profile mismatch/);
});

test('evaluateBenchmarkArtifact: fail when artifact schemaVersion is wrong', () => {
  const artifact = makeArtifact([]);
  artifact.schemaVersion = 'design-lab-scatter-benchmark.v1';
  const v = evaluateBenchmarkArtifact({
    artifact,
    baseline: null,
    thresholds: THRESHOLDS,
    mode: 'workflow_dispatch',
  });
  assert.equal(v.ok, false);
  assert.match(v.reason, /schemaVersion mismatch/);
});

test('evaluateBenchmarkArtifact: fail when a measured row carries settledSource=route-level', () => {
  const rows = [];
  fillCase(rows, { renderMs: 1200, settledSource: 'route-level' });
  fillCase(rows, { backend: 'canvas-lttb', renderMs: 600 });
  const artifact = makeArtifact(rows);
  const v = evaluateBenchmarkArtifact({
    artifact,
    baseline: null,
    thresholds: THRESHOLDS,
    mode: 'workflow_dispatch',
  });
  assert.equal(v.ok, false);
  assert.match(v.reason, /route-level fallback/);
});

test('evaluateBenchmarkArtifact: fail when a WebGL row aborted (e.g. webgl-unavailable)', () => {
  const rows = [];
  for (let i = 1; i <= 5; i++) {
    rows.push(
      makeRow({
        runIndex: i,
        renderMs: 1200,
        aborted: i === 1 ? true : undefined,
        abortReason: i === 1 ? 'webgl-unavailable' : undefined,
        webglSupported: i === 1 ? false : true,
      }),
    );
  }
  fillCase(rows, { backend: 'canvas-lttb', renderMs: 600 });
  const artifact = makeArtifact(rows);
  const v = evaluateBenchmarkArtifact({
    artifact,
    baseline: null,
    thresholds: THRESHOLDS,
    mode: 'workflow_dispatch',
  });
  assert.equal(v.ok, false);
  assert.match(v.reason, /aborted|webglSupported=false/);
});

test('evaluateBenchmarkArtifact: fail when measured row count is below the tier-required count', () => {
  const rows = [];
  for (let i = 1; i <= 3; i++) rows.push(makeRow({ runIndex: i, renderMs: 1200 })); // only 3 / 5
  fillCase(rows, { backend: 'canvas-lttb', renderMs: 600 });
  const artifact = makeArtifact(rows);
  const v = evaluateBenchmarkArtifact({
    artifact,
    baseline: null,
    thresholds: THRESHOLDS,
    mode: 'workflow_dispatch',
  });
  assert.equal(v.ok, false);
  assert.match(v.reason, /measured row count 3 < expected 5/);
});

test('evaluateBenchmarkArtifact: warn (not fail) on gpuRenderer drift vs baseline', () => {
  const rows = [];
  fillCase(rows, { renderMs: 1200 });
  fillCase(rows, { backend: 'canvas-lttb', renderMs: 600 });
  const artifact = makeArtifact(rows);
  const baseline = {
    schemaVersion: SCHEMA_VERSION,
    summary: {
      medianRenderMsByCase: {
        'uniform/million/webgl': 1190,
        'uniform/million/canvas-lttb': 590,
      },
    },
    environment: {
      ...artifact.environment,
      runner: { profile: 'self-hosted-gpu', gpuRenderer: 'NVIDIA A100', chromeVersion: '124' },
    },
  };
  const v = evaluateBenchmarkArtifact({
    artifact,
    baseline,
    thresholds: THRESHOLDS,
    mode: 'pr',
  });
  assert.equal(v.ok, true);
  const webgl = v.cases.find((c) => c.case === 'uniform/million/webgl');
  assert.match(webgl.notes.join(' '), /gpuRenderer drift|chromeVersion drift/);
});

test('evaluateBenchmarkArtifact: PR mode fail-closes when baseline schemaVersion is wrong (baseline unusable)', () => {
  const rows = [];
  fillCase(rows, { renderMs: 1200 });
  fillCase(rows, { backend: 'canvas-lttb', renderMs: 600 });
  const artifact = makeArtifact(rows);
  const baseline = {
    schemaVersion: 'design-lab-scatter-benchmark.v1', // wrong
    summary: {
      medianRenderMsByCase: {
        'uniform/million/webgl': 1100,
        'uniform/million/canvas-lttb': 600,
      },
    },
    environment: artifact.environment,
  };
  const v = evaluateBenchmarkArtifact({
    artifact,
    baseline,
    thresholds: THRESHOLDS,
    mode: 'pr',
  });
  assert.equal(v.ok, false);
  const webgl = v.cases.find((c) => c.case === 'uniform/million/webgl');
  assert.match(webgl.reasons.join(' '), /baseline.*schemaVersion/);
});

test('evaluateBenchmarkArtifact: PR mode fail-closes when baseline runner profile mismatches', () => {
  const rows = [];
  fillCase(rows, { renderMs: 1200 });
  fillCase(rows, { backend: 'canvas-lttb', renderMs: 600 });
  const artifact = makeArtifact(rows);
  const baseline = {
    schemaVersion: SCHEMA_VERSION,
    summary: {
      medianRenderMsByCase: {
        'uniform/million/webgl': 1100,
        'uniform/million/canvas-lttb': 600,
      },
    },
    environment: {
      ...artifact.environment,
      runner: { profile: 'github-hosted-trend', gpuRenderer: 'SwiftShader', chromeVersion: '125' },
    },
  };
  const v = evaluateBenchmarkArtifact({
    artifact,
    baseline,
    thresholds: THRESHOLDS,
    mode: 'pr',
  });
  assert.equal(v.ok, false);
  const webgl = v.cases.find((c) => c.case === 'uniform/million/webgl');
  assert.match(webgl.reasons.join(' '), /cross-profile diff/);
});

test('evaluateBenchmarkArtifact: workflow_dispatch keeps running with unusable baseline (absolute-only warn)', () => {
  const rows = [];
  fillCase(rows, { renderMs: 1400 });
  fillCase(rows, { backend: 'canvas-lttb', renderMs: 600 });
  const artifact = makeArtifact(rows);
  const baseline = {
    schemaVersion: 'design-lab-scatter-benchmark.v1',
    summary: { medianRenderMsByCase: {} },
    environment: artifact.environment,
  };
  const v = evaluateBenchmarkArtifact({
    artifact,
    baseline,
    thresholds: THRESHOLDS,
    mode: 'workflow_dispatch',
  });
  assert.equal(v.ok, true);
  const webgl = v.cases.find((c) => c.case === 'uniform/million/webgl');
  assert.equal(webgl.verdict, 'warn');
  assert.match(webgl.notes.join(' '), /baseline ignored.*schemaVersion/);
});

test('buildSummaryMarkdown: produces sticky-comment markers + verdict cell', () => {
  const verdict = {
    ok: false,
    reason: 'fake fail',
    cases: [
      {
        case: 'uniform/million/webgl',
        verdict: 'fail',
        medianMs: 1700,
        bestMs: 1650,
        maxMs: 1800,
        jitterPct: 8.8,
        thresholdMs: 1500,
        baselineMedianMs: 1100,
        regressionPct: 54.5,
        reasons: ['median 1700ms > absolute cap 1500ms'],
        notes: [],
      },
    ],
    environment: {
      runner: {
        profile: 'self-hosted-gpu',
        gpuRenderer: 'NVIDIA A10G',
        chromeVersion: '125',
        headless: true,
      },
    },
  };
  const md = buildSummaryMarkdown(verdict, { mode: 'pr', runUrl: null });
  assert.match(md, /<!-- benchmark-1m:start -->/);
  assert.match(md, /<!-- benchmark-1m:end -->/);
  assert.match(md, /uniform\/million\/webgl/);
  assert.match(md, /❌ fail/);
});
