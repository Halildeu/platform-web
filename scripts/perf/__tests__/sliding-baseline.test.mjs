#!/usr/bin/env node
/**
 * PERF-INIT-V2.1 PR-G2: Integration smoke for sliding-baseline-check.mjs.
 *
 * Plain node assertion suite (no test framework dependency) to keep CI fast
 * and dependency-free. Covers:
 *   1. median / percentile / stdDev primitives
 *   2. sliding window stats (insufficient + valid)
 *   3. variance band classification (inside vs outside)
 *   4. hard-fail activation eligibility evaluator
 *   5. flake budget counter (empty ledger + with entries)
 *   6. CLI scenario: warn-only fixture → exit 0
 *   7. CLI scenario: hard-fail active fixture → exit 1 (true regression)
 *   8. CLI scenario: hard-fail active + inside band → exit 0 (warn/rerun)
 *
 * Run: node scripts/perf/__tests__/sliding-baseline.test.mjs
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  median,
  percentile,
  stdDev,
  computeSlidingStats,
  countFalsePositives,
  evaluateFlakeBudget,
  outsideVarianceBand,
  isHardFailActive,
  checkRoute,
} from '../sliding-baseline-check.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPT = join(__dirname, '..', 'sliding-baseline-check.mjs');
const FIXTURES = join(__dirname, '..', '__fixtures__');

const tmp = mkdtempSync(join(tmpdir(), 'g2-test-'));
let passed = 0;
let failed = 0;

function it(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
    passed += 1;
  } catch (e) {
    failed += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${e.message}`);
  }
}

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

function runCli(args) {
  try {
    const out = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8' });
    return { code: 0, stdout: out };
  } catch (e) {
    return { code: e.status ?? 1, stdout: e.stdout?.toString() ?? '', stderr: e.stderr?.toString() ?? '' };
  }
}

/**
 * Rebase fixture history timestamps to "last N days" so the sliding window
 * keeps them in scope regardless of the wall-clock date. Returns path to
 * the rebased fixture in tmp dir.
 */
function rebaseFixture(fixturePath, daysAgoSpacing = 1) {
  const json = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const now = Date.now();
  for (const routeKey of Object.keys(json.routes ?? {})) {
    const route = json.routes[routeKey];
    if (Array.isArray(route.history)) {
      route.history = route.history.map((entry, idx) => ({
        ...entry,
        timestamp: now - (route.history.length - idx) * daysAgoSpacing * 86400000,
      }));
    }
  }
  json.timestamp = now;
  const out = join(tmp, `rebased-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(out, JSON.stringify(json, null, 2));
  return out;
}

describe('primitives', () => {
  it('median(odd)', () => assert.equal(median([1, 3, 5]), 3));
  it('median(even = low-mid average)', () => assert.equal(median([1, 2, 3, 4]), 2.5));
  it('median(empty)', () => assert.equal(median([]), undefined));
  it('median ignores NaN', () => assert.equal(median([NaN, 1, 2, 3]), 2));
  it('percentile(p95)', () => assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95), 10));
  it('percentile(single)', () => assert.equal(percentile([42], 0.95), 42));
  it('stdDev(<2)', () => assert.equal(stdDev([5]), 0));
  it('stdDev(known)', () => assert.ok(Math.abs(stdDev([2, 4, 4, 4, 5, 5, 7, 9]) - 2) < 0.0001));
});

describe('sliding stats', () => {
  it('insufficient history (<3)', () => {
    const stats = computeSlidingStats([
      { timestamp: Date.now() - 1000, metrics: { transferKB: 100 } },
      { timestamp: Date.now() - 2000, metrics: { transferKB: 110 } },
    ], 14);
    assert.equal(stats.insufficient, true);
    assert.equal(stats.count, 2);
  });

  it('window filter drops old entries', () => {
    const old = Date.now() - 30 * 86400000;
    const recent = Date.now() - 1 * 86400000;
    const stats = computeSlidingStats([
      { timestamp: old, metrics: { transferKB: 1000 } },
      { timestamp: recent, metrics: { transferKB: 100 } },
      { timestamp: recent, metrics: { transferKB: 110 } },
      { timestamp: recent, metrics: { transferKB: 105 } },
    ], 14);
    assert.equal(stats.insufficient, undefined);
    assert.equal(stats.count, 3);
    assert.equal(stats.median.transferKB, 105);
  });

  it('stats compute median + p95 + stdDev', () => {
    const now = Date.now();
    const history = Array.from({ length: 10 }, (_, i) => ({
      timestamp: now - i * 86400000,
      metrics: { transferKB: 100 + i },
    }));
    const stats = computeSlidingStats(history, 14);
    assert.ok(stats.median.transferKB);
    assert.ok(stats.p95.transferKB);
    assert.ok(stats.stdDev.transferKB > 0);
  });
});

describe('variance band', () => {
  const stats = { median: { transferKB: 100 }, p95: { transferKB: 110 }, stdDev: { transferKB: 5 } };
  it('inside band (median+2*stdDev not exceeded, below p95)', () => {
    assert.equal(outsideVarianceBand(105, stats, 'transferKB'), false);
  });
  it('outside band (above p95)', () => {
    assert.equal(outsideVarianceBand(115, stats, 'transferKB'), true);
  });
  it('outside band (above median + 2*stdDev)', () => {
    assert.equal(outsideVarianceBand(112, stats, 'transferKB'), true);
  });
});

describe('hard-fail activation', () => {
  it('warn-only phase → not active', () => {
    const res = isHardFailActive({ _phase: 'warn-only' }, {});
    assert.equal(res.active, false);
  });
  it('hard-fail phase missing eligibility date → not active', () => {
    const res = isHardFailActive({ _phase: 'hard-fail' }, {});
    assert.equal(res.active, false);
  });
  it('hard-fail phase pre-date → not active', () => {
    const future = new Date(Date.now() + 30 * 86400000).toISOString();
    const res = isHardFailActive({ _phase: 'hard-fail', _hardFailActivationDate: future }, {});
    assert.equal(res.active, false);
  });
  it('hard-fail phase with insufficient evidence → not active', () => {
    const past = new Date(Date.now() - 30 * 86400000).toISOString();
    const res = isHardFailActive({
      _phase: 'hard-fail',
      _hardFailActivationDate: past,
      _hardFailActivation: { windowsSatisfied: 2, comparableRuns: 30, flakeBudgetSatisfied: true, baselineReviewSha: 'x', activatedBy: 'y', activatedAt: 'z' },
    }, {});
    assert.equal(res.active, false);
    assert.match(res.reason, /windowsSatisfied/);
  });
  it('hard-fail phase with complete evidence → active', () => {
    const past = new Date(Date.now() - 30 * 86400000).toISOString();
    const res = isHardFailActive({
      _phase: 'hard-fail',
      _hardFailActivationDate: past,
      _hardFailActivation: { windowsSatisfied: 4, comparableRuns: 25, flakeBudgetSatisfied: true, baselineReviewSha: 'r', activatedBy: 'u', activatedAt: 'a' },
    }, {});
    assert.equal(res.active, true);
  });
  it('owner waiver in future → suppresses active', () => {
    const past = new Date(Date.now() - 30 * 86400000).toISOString();
    const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const res = isHardFailActive({
      _phase: 'hard-fail',
      _hardFailActivationDate: past,
      _hardFailActivation: { windowsSatisfied: 4, comparableRuns: 25, flakeBudgetSatisfied: true, baselineReviewSha: 'r', activatedBy: 'u', activatedAt: 'a' },
      _hardFailWaiver: { owner: 'Halil', reason: 'test', accepted_risk: 'x', waived_criteria: ['x'], expires_at: future },
    }, { acceptWaiver: true });
    assert.equal(res.active, false);
    assert.match(res.reason, /owner waiver/);
  });
});

describe('flake budget ledger', () => {
  const ledger = join(tmp, 'fp-ledger.jsonl');

  it('empty ledger → 0 FPs', () => {
    assert.equal(countFalsePositives(ledger, '/login::cold-anonymous', 20), 0);
    assert.equal(countFalsePositives(ledger, '/login::cold-anonymous', 100), 0);
  });

  it('appended entries → count within budget', () => {
    writeFileSync(ledger, [
      JSON.stringify({ timestamp: Date.now() - 1000, route: '/login', mode: 'cold-anonymous', authState: 'anonymous', confirmed_fp: true }),
      JSON.stringify({ timestamp: Date.now() - 2000, route: '/login', mode: 'cold-anonymous', authState: 'anonymous', confirmed_fp: true }),
      JSON.stringify({ timestamp: Date.now() - 3000, route: '/other', mode: 'cold-anonymous', authState: 'anonymous', confirmed_fp: true }),
    ].join('\n') + '\n');
    assert.equal(countFalsePositives(ledger, '/login::cold-anonymous', 20), 2);
    assert.equal(countFalsePositives(ledger, '/other::cold-anonymous', 20), 1);
  });

  it('flake budget evaluator: <=1/20 + <3/100 satisfied', () => {
    writeFileSync(ledger, JSON.stringify({ timestamp: Date.now(), route: '/login', mode: 'cold-anonymous', authState: 'anonymous', confirmed_fp: true }) + '\n');
    const result = evaluateFlakeBudget(ledger, '/login::cold-anonymous');
    assert.equal(result.satisfied, true);
    assert.equal(result.last20, 1);
  });

  it('flake budget evaluator: >1/20 fails', () => {
    const entries = Array.from({ length: 3 }, (_, i) =>
      JSON.stringify({ timestamp: Date.now() - i * 1000, route: '/login', mode: 'cold-anonymous', authState: 'anonymous', confirmed_fp: true }),
    );
    writeFileSync(ledger, entries.join('\n') + '\n');
    const result = evaluateFlakeBudget(ledger, '/login::cold-anonymous');
    assert.equal(result.satisfied, false);
    assert.equal(result.last20, 3);
  });
});

describe('CLI scenarios', () => {
  // Use empty ledger in tmp to avoid interference
  const ledger = join(tmp, 'fp-ledger-empty.jsonl');
  writeFileSync(ledger, '');

  it('warn-only baseline + drift → exit 0 (warn tag)', () => {
    const baseline = rebaseFixture(join(FIXTURES, 'baseline-warm-only.json'));
    const { code, stdout } = runCli([
      '--baseline', baseline,
      '--current', join(FIXTURES, 'current-drift.json'),
      '--ledger', ledger,
    ]);
    assert.equal(code, 0);
    assert.match(stdout, /WARN_ONLY {2}transferKB/);
    assert.match(stdout, /\[g2\] PASS/);
  });

  it('hard-fail active baseline + drift outside band → exit 1', () => {
    const baseline = rebaseFixture(join(FIXTURES, 'baseline-hard-fail-active.json'));
    const { code, stdout, stderr } = runCli([
      '--baseline', baseline,
      '--current', join(FIXTURES, 'current-drift.json'),
      '--ledger', ledger,
    ]);
    assert.equal(code, 1);
    assert.match(stdout, /HARD_FAIL {2}transferKB/);
  });

  it('hard-fail active + drift inside band → exit 0 (warn/rerun)', () => {
    const baseline = rebaseFixture(join(FIXTURES, 'baseline-hard-fail-wide.json'));
    const { code, stdout } = runCli([
      '--baseline', baseline,
      '--current', join(FIXTURES, 'current-inside-band.json'),
      '--ledger', ledger,
    ]);
    assert.equal(code, 0);
    assert.match(stdout, /WARN {2}transferKB/);
    assert.match(stdout, /inside_variance_band/);
  });

  it('warn-only + clean current → exit 0, no regressions', () => {
    const baseline = rebaseFixture(join(FIXTURES, 'baseline-warm-only.json'));
    const { code, stdout } = runCli([
      '--baseline', baseline,
      '--current', join(FIXTURES, 'current-clean.json'),
      '--ledger', ledger,
    ]);
    assert.equal(code, 0);
    assert.match(stdout, /\[g2\] PASS/);
  });

  it('insufficient baseline history → exit 0 + INSUFFICIENT_HISTORY decision', () => {
    const baseline = rebaseFixture(join(FIXTURES, 'baseline-insufficient.json'));
    const { code, stdout } = runCli([
      '--baseline', baseline,
      '--current', join(FIXTURES, 'current-drift.json'),
      '--ledger', ledger,
    ]);
    assert.equal(code, 0);
    assert.match(stdout, /INSUFFICIENT_HISTORY|insufficient_history/);
  });

  it('--append-history mutates fifo + writes baseline', () => {
    const baselineCopy = rebaseFixture(join(FIXTURES, 'baseline-warm-only.json'));
    const before = JSON.parse(readFileSync(baselineCopy, 'utf8')).routes['/login::cold-anonymous'].history.length;
    const { code } = runCli([
      '--baseline', baselineCopy,
      '--current', join(FIXTURES, 'current-clean.json'),
      '--ledger', ledger,
      '--append-history',
    ]);
    assert.equal(code, 0);
    const after = JSON.parse(readFileSync(baselineCopy, 'utf8')).routes['/login::cold-anonymous'].history.length;
    assert.equal(after, before + 1);
  });

  it('flake budget exceeded → exit 2', () => {
    const ledgerExceeded = join(tmp, 'fp-ledger-exceeded.jsonl');
    const entries = Array.from({ length: 4 }, (_, i) =>
      JSON.stringify({ timestamp: Date.now() - i * 1000, route: '/login', mode: 'cold-anonymous', authState: 'anonymous', confirmed_fp: true }),
    );
    writeFileSync(ledgerExceeded, entries.join('\n') + '\n');
    const baseline = rebaseFixture(join(FIXTURES, 'baseline-warm-only.json'));
    const { code, stderr } = runCli([
      '--baseline', baseline,
      '--current', join(FIXTURES, 'current-clean.json'),
      '--ledger', ledgerExceeded,
    ]);
    assert.equal(code, 2);
  });
});

// Summary + cleanup
console.log(`\n${passed} passed, ${failed} failed`);
rmSync(tmp, { recursive: true, force: true });
if (failed > 0) process.exit(1);
process.exit(0);
