/**
 * PERF-INIT-V2 PR-M1: Playwright test entry for route budget evaluation.
 *
 * This is a thin wrapper that invokes the route-performance-budget runner
 * within the Playwright test harness so CI artifact + retry logic + HTML
 * report integration work uniformly. The actual measurement logic lives
 * in scripts/ci/route-performance-budget.mjs (re-usable from cron, manual
 * runs, etc.).
 *
 * Run:
 *   npm run perf:budget               # local target
 *   npm run perf:budget:testai        # against testai.acik.com
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

test.describe('PERF-INIT-V2 PR-M1: route performance budget scaffold', () => {
  test('collects route budget artifact (warn-only / advisory in scaffold)', () => {
    test.setTimeout(10 * 60 * 1000); // 10 minutes for full sweep across 7+ routes

    const target = process.env.PERF_TARGET || 'local';
    const runs = process.env.PERF_RUNS || '5';

    // Build argv as discrete array so paths/auth-storage are properly quoted
    // (Codex thread 019e1e1b round-2 finding 2: prevent shell interpolation
    // and surface env passthrough explicitly).
    const argv: string[] = [
      'scripts/ci/route-performance-budget.mjs',
      '--target',
      target,
      '--runs',
      runs,
    ];
    if (process.env.PERF_WARN_ONLY === '1') argv.push('--warn-only');
    if (process.env.PERF_UPDATE_BASELINE === '1') argv.push('--update-baseline');
    if (process.env.PERF_AUTH_STORAGE) {
      argv.push('--auth-storage', process.env.PERF_AUTH_STORAGE);
    }

    let exitCode = 0;
    try {
      execFileSync('node', argv, { cwd: ROOT, stdio: 'inherit' });
    } catch (e) {
      exitCode = (e as { status?: number }).status ?? 1;
    }

    // Always read and surface the last-run artifact for visibility in the test report
    const artifact = JSON.parse(readFileSync(join(ROOT, 'tests', 'perf', 'last-run.json'), 'utf8'));
    test.info().annotations.push({
      type: 'perf-budget-summary',
      description: `target=${artifact.target} runs=${artifact.runs} routes=${artifact.routes.length}`,
    });

    expect(exitCode).toBe(0);
  });
});
