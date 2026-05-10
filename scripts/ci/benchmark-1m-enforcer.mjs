#!/usr/bin/env node
/**
 * benchmark-1m-enforcer.mjs — Faz 21.11 PR-A1.6c hard KPI gate.
 *
 * Consumed by `.github/workflows/benchmark-1m.yml` after the
 * Playwright job uploads its `benchmark-1m-artifact.json`. Loads the
 * artifact, compares each measured-row median against
 * `benchmark-thresholds.json`, fetches the latest `main` baseline via
 * `gh api`, computes regression deltas, and exits non-zero on any
 * hard-fail signal so the workflow check turns red.
 *
 * Why a separate script (vs inline in the workflow):
 *   - Synthetic fixtures can drive every branch (pass / regression /
 *     missing baseline / runner mismatch / schema mismatch / settled-
 *     timeout leak) in seconds via Vitest. Inline shell logic in a
 *     workflow can't be unit-tested.
 *   - The same script can run locally during development to debug an
 *     artifact before pushing.
 *
 * Hard-fail signals (PR mode):
 *   - artifact schemaVersion mismatch
 *   - environment.runner.profile != requiredRunnerProfile (per case)
 *   - WebGL case with `webglSupported === false`
 *   - WebGL case with `aborted === true` (any abortReason)
 *   - WebGL case with `settledSource !== 'finished'` (route-level
 *     fallback would corrupt the median — already guarded inside
 *     BenchmarkRoute, but the enforcer double-checks)
 *   - Less than the expected `measured` count for the tier
 *   - median > medianRenderMsMax
 *   - median > (baseline median * (1 + baselineRegressionMaxPct/100))
 *   - baseline missing in PR mode
 *
 * Soft signals (reported but non-fatal):
 *   - jitter `(max-min) / median > 0.5`
 *   - GPU renderer / Chrome version mismatch vs baseline
 *   - baseline missing in workflow_dispatch mode (absolute-only)
 *
 * CLI:
 *   node scripts/ci/benchmark-1m-enforcer.mjs \
 *       --artifact <path-to-benchmark-1m-artifact.json> \
 *       --baseline <path-to-baseline.json | --no-baseline> \
 *       --thresholds <path-to-benchmark-thresholds.json> \
 *       --mode <pr | workflow_dispatch> \
 *       [--summary-out <path>]      # markdown for PR comment
 *       [--json-out <path>]         # machine-readable verdict
 *
 * Exit codes:
 *   0 — all cases within threshold (or missing baseline + workflow_dispatch)
 *   1 — at least one case failed
 *   2 — CLI / IO / parse error
 */

import { readFileSync, writeFileSync } from 'node:fs';

/* ------------------------------------------------------------------ */
/*  CLI parsing                                                        */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const out = {
    artifactPath: null,
    baselinePath: null,
    noBaseline: false,
    thresholdsPath: null,
    mode: null,
    summaryOut: null,
    jsonOut: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--artifact') out.artifactPath = argv[++i];
    else if (a === '--baseline') out.baselinePath = argv[++i];
    else if (a === '--no-baseline') out.noBaseline = true;
    else if (a === '--thresholds') out.thresholdsPath = argv[++i];
    else if (a === '--mode') out.mode = argv[++i];
    else if (a === '--summary-out') out.summaryOut = argv[++i];
    else if (a === '--json-out') out.jsonOut = argv[++i];
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Pure evaluator (test seam)                                         */
/* ------------------------------------------------------------------ */

const SCHEMA_VERSION = 'design-lab-scatter-benchmark.v2';

/**
 * @typedef {object} EnforceInput
 * @property {object} artifact   — design-lab-scatter-benchmark.v2 artifact JSON
 * @property {object|null} baseline — same shape, from `main` (or null)
 * @property {object} thresholds — full benchmark-thresholds.json contents
 * @property {'pr'|'workflow_dispatch'} mode
 *
 * @typedef {object} CaseVerdict
 * @property {string} case
 * @property {'pass'|'fail'|'warn'} verdict
 * @property {number} medianMs
 * @property {number|null} bestMs
 * @property {number|null} maxMs
 * @property {number|null} jitterPct
 * @property {number} thresholdMs
 * @property {number|null} baselineMedianMs
 * @property {number|null} regressionPct
 * @property {string[]} reasons       — hard-fail messages
 * @property {string[]} notes         — soft / advisory messages
 *
 * @typedef {object} EnforceVerdict
 * @property {boolean} ok             — true when no case is `fail`
 * @property {string} reason
 * @property {CaseVerdict[]} cases
 * @property {object} environment
 */

/**
 * Pull all measured rows for the given case key out of an artifact.
 */
function rowsForCase(artifact, key) {
  if (!artifact || !Array.isArray(artifact.results)) return [];
  return artifact.results.filter((r) => `${r.fixture}/${r.tier}/${r.backend}` === key);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function expectedMeasuredCount(artifact, tier) {
  const rc = artifact?.environment?.runCounts?.[tier];
  if (rc && typeof rc.measured === 'number') return rc.measured;
  // Sensible defaults match RUN_COUNTS_BY_TIER in BenchmarkRoute.tsx.
  if (tier === 'million') return 5;
  return 3;
}

/**
 * Pure evaluator. Used by both the CLI and the unit tests so every
 * branch is exercised without spinning up Playwright.
 *
 * @param {EnforceInput} input
 * @returns {EnforceVerdict}
 */
export function evaluateBenchmarkArtifact(input) {
  const { artifact, baseline, thresholds, mode } = input;
  const cases = [];
  const errors = [];

  if (!artifact || typeof artifact !== 'object') {
    return {
      ok: false,
      reason: 'artifact is missing or not an object',
      cases: [],
      environment: {},
    };
  }
  if (artifact.schemaVersion !== SCHEMA_VERSION) {
    return {
      ok: false,
      reason: `schemaVersion mismatch: artifact=${artifact.schemaVersion}, expected=${SCHEMA_VERSION}`,
      cases: [],
      environment: artifact.environment ?? {},
    };
  }

  const cfg = thresholds?.[SCHEMA_VERSION];
  if (!cfg || !cfg.cases) {
    return {
      ok: false,
      reason: `benchmark-thresholds.json is missing the "${SCHEMA_VERSION}" namespace`,
      cases: [],
      environment: artifact.environment ?? {},
    };
  }

  // Baseline missing handling.
  // PR mode = fail-closed (we have nothing to regression-compare against).
  // workflow_dispatch mode = absolute-only — let the run continue but
  // tag every case so the comment is honest about the missing diff.
  const baselineMissing = !baseline;
  const baselineMissingFatal = baselineMissing && mode === 'pr';

  for (const [key, caseCfg] of Object.entries(cfg.cases)) {
    const rows = rowsForCase(artifact, key);
    const reasons = [];
    const notes = [];

    // Required runner profile
    const actualProfile = artifact.environment?.runner?.profile ?? 'unknown';
    if (caseCfg.requiredRunnerProfile && actualProfile !== caseCfg.requiredRunnerProfile) {
      reasons.push(
        `runner profile mismatch (artifact=${actualProfile}, required=${caseCfg.requiredRunnerProfile})`,
      );
    }

    if (rows.length === 0) {
      cases.push({
        case: key,
        verdict: 'fail',
        medianMs: 0,
        bestMs: null,
        maxMs: null,
        jitterPct: null,
        thresholdMs: caseCfg.medianRenderMsMax,
        baselineMedianMs: null,
        regressionPct: null,
        reasons: [...reasons, 'no measured rows for this case'],
        notes,
      });
      continue;
    }

    // Measured-count check
    const expected = expectedMeasuredCount(artifact, key.split('/')[1]);
    if (rows.length < expected) {
      reasons.push(`measured row count ${rows.length} < expected ${expected}`);
    }

    // Aborted / WebGL-fallback / settled-timeout invariants
    for (const r of rows) {
      if (r.aborted) reasons.push(`row aborted (${r.abortReason ?? 'unknown'})`);
      if (r.webglSupported === false)
        reasons.push('webglSupported=false on a row that was supposed to render WebGL');
      if (r.settledSource && r.settledSource !== 'finished') {
        reasons.push(`settledSource='${r.settledSource}' (route-level fallback corrupts median)`);
      }
    }

    const medianValues = rows.map((r) => r.renderMs);
    const medianMs = median(medianValues);
    const bestMs = Math.min(...medianValues);
    const maxMs = Math.max(...medianValues);
    const jitterPct = medianMs > 0 ? ((maxMs - bestMs) / medianMs) * 100 : 0;
    if (jitterPct > 50) notes.push(`high jitter ${jitterPct.toFixed(1)}%`);

    // Effective threshold: min(absolute cap, baseline * (1 + maxPct/100)).
    // `min` (not `max`) because a faster `main` baseline should TIGHTEN
    // the gate, not relax it. Without baseline the cap stands alone.
    const baselineMedianMs = baseline?.summary?.medianRenderMsByCase?.[key] ?? null;
    let regressionPct = null;
    let regressionThresholdMs = null;
    if (baselineMedianMs !== null && baselineMedianMs > 0) {
      regressionPct = ((medianMs - baselineMedianMs) / baselineMedianMs) * 100;
      regressionThresholdMs = baselineMedianMs * (1 + caseCfg.baselineRegressionMaxPct / 100);
    }
    const effectiveThreshold =
      regressionThresholdMs !== null
        ? Math.min(caseCfg.medianRenderMsMax, regressionThresholdMs)
        : caseCfg.medianRenderMsMax;

    if (medianMs > effectiveThreshold) {
      const detail =
        regressionThresholdMs !== null && regressionThresholdMs < caseCfg.medianRenderMsMax
          ? `median ${medianMs.toFixed(2)}ms > effective threshold ${effectiveThreshold.toFixed(2)}ms (baseline ${baselineMedianMs.toFixed(2)}ms × (1 + ${caseCfg.baselineRegressionMaxPct}%))`
          : `median ${medianMs.toFixed(2)}ms > absolute cap ${caseCfg.medianRenderMsMax.toFixed(2)}ms`;
      reasons.push(detail);
    }

    if (baselineMissing) {
      if (baselineMissingFatal) {
        reasons.push('baseline artifact missing on `main` (PR mode is fail-closed)');
      } else {
        notes.push('baseline missing — running in absolute-only mode (workflow_dispatch)');
      }
    }

    // GPU renderer / Chrome drift (advisory)
    if (baseline?.environment?.runner) {
      const a = artifact.environment?.runner ?? {};
      const b = baseline.environment.runner;
      if (a.gpuRenderer && b.gpuRenderer && a.gpuRenderer !== b.gpuRenderer) {
        notes.push(
          `gpuRenderer drift (artifact=${a.gpuRenderer}, baseline=${b.gpuRenderer}) — diff may be noisy`,
        );
      }
      if (a.chromeVersion && b.chromeVersion && a.chromeVersion !== b.chromeVersion) {
        notes.push(
          `chromeVersion drift (artifact=${a.chromeVersion}, baseline=${b.chromeVersion})`,
        );
      }
    }

    cases.push({
      case: key,
      verdict: reasons.length > 0 ? 'fail' : notes.length > 0 ? 'warn' : 'pass',
      medianMs,
      bestMs,
      maxMs,
      jitterPct,
      thresholdMs: effectiveThreshold,
      baselineMedianMs,
      regressionPct,
      reasons,
      notes,
    });

    if (reasons.length > 0) {
      errors.push(`${key}: ${reasons.join('; ')}`);
    }
  }

  return {
    ok: errors.length === 0,
    reason: errors.length === 0 ? 'all cases within threshold' : errors.join(' | '),
    cases,
    environment: artifact.environment ?? {},
  };
}

/* ------------------------------------------------------------------ */
/*  Markdown summary builder (sticky comment body)                     */
/* ------------------------------------------------------------------ */

/**
 * Marker tags so the GHA comment-update step can locate and replace
 * the previous comment body in place. Keeping the markers stable
 * across runs is what makes the comment "sticky".
 */
const MARKER_START = '<!-- benchmark-1m:start -->';
const MARKER_END = '<!-- benchmark-1m:end -->';

export function buildSummaryMarkdown(verdict, meta) {
  const lines = [];
  lines.push(MARKER_START);
  lines.push(`### Benchmark — \`${SCHEMA_VERSION}\``);
  const env = verdict.environment;
  lines.push('');
  lines.push(
    `Runner: \`${env?.runner?.profile ?? 'unknown'}\` · GPU: \`${env?.runner?.gpuRenderer ?? 'n/a'}\` · Chrome: \`${env?.runner?.chromeVersion ?? 'n/a'}\` · headless: \`${env?.runner?.headless ?? '?'}\``,
  );
  lines.push(`Mode: \`${meta?.mode ?? 'pr'}\` · Run: ${meta?.runUrl ?? '(local)'}`);
  lines.push('');
  lines.push('| Case | Verdict | Median ms | Best | Max | Jitter % | Threshold | Baseline | Δ % |');
  lines.push('|---|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const c of verdict.cases) {
    const verdictBadge =
      c.verdict === 'pass' ? '✅ pass' : c.verdict === 'warn' ? '⚠️ warn' : '❌ fail';
    const delta = c.regressionPct === null ? '—' : `${c.regressionPct.toFixed(1)}%`;
    const baseline = c.baselineMedianMs === null ? '—' : c.baselineMedianMs.toFixed(2);
    const jitter = c.jitterPct === null ? '—' : c.jitterPct.toFixed(1);
    lines.push(
      `| \`${c.case}\` | ${verdictBadge} | ${c.medianMs.toFixed(2)} | ${c.bestMs?.toFixed(2) ?? '—'} | ${c.maxMs?.toFixed(2) ?? '—'} | ${jitter} | ${c.thresholdMs.toFixed(2)} | ${baseline} | ${delta} |`,
    );
  }
  // Detail lines for failures/notes
  for (const c of verdict.cases) {
    if (c.reasons.length || c.notes.length) {
      lines.push('');
      lines.push(`**\`${c.case}\`**`);
      for (const r of c.reasons) lines.push(`- ❌ ${r}`);
      for (const n of c.notes) lines.push(`- ⚠️ ${n}`);
    }
  }
  lines.push('');
  lines.push(`Verdict: ${verdict.ok ? '✅ pass' : '❌ fail'} — ${verdict.reason}`);
  lines.push(MARKER_END);
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  CLI                                                                */
/* ------------------------------------------------------------------ */

function loadJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (err) {
    console.error(`[enforcer] Failed to read ${label} at ${path}: ${err.message}`);
    process.exit(2);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.artifactPath || !args.thresholdsPath || !args.mode) {
    console.error(
      '[enforcer] Required: --artifact <path> --thresholds <path> --mode <pr|workflow_dispatch>',
    );
    process.exit(2);
  }
  const artifact = loadJson(args.artifactPath, 'artifact');
  const thresholds = loadJson(args.thresholdsPath, 'thresholds');
  const baseline =
    args.noBaseline || !args.baselinePath ? null : loadJson(args.baselinePath, 'baseline');

  const verdict = evaluateBenchmarkArtifact({
    artifact,
    baseline,
    thresholds,
    mode: args.mode,
  });

  const meta = {
    mode: args.mode,
    runUrl: process.env.GITHUB_SERVER_URL
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null,
  };

  const md = buildSummaryMarkdown(verdict, meta);
  if (args.summaryOut) writeFileSync(args.summaryOut, md, 'utf-8');
  else console.log(md);

  if (args.jsonOut) {
    writeFileSync(args.jsonOut, JSON.stringify(verdict, null, 2), 'utf-8');
  }

  process.exit(verdict.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
