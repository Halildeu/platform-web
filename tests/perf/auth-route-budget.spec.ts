/**
 * PERF-INIT-V2.1 PR-V2.1-M2a1: Authenticated route 4-route × N≥3 budget measurement.
 *
 * Codex thread `019e2b00` round 3 AGREE — implementer Claude, reviewer Codex.
 *
 * Pattern (Codex Option B daraltılmış scope birebir):
 *   1. Runtime-generated storageState (committed fixture YOK)
 *   2. Real frontend OIDC client (`frontend` platform-test realm — discovery output)
 *   3. 4 route × N≥3 measurement matrix
 *   4. Rendered sentinel + BUILD_SHA + browser/cache metadata
 *   5. Sonuçlar iyi/kötü diye değil, **ölçüm zinciri kuruldu** diye kapat
 *
 * 4 routes (performance-budgets.json cold-authenticated entries):
 *   - /home                                       sentinel: h1, h2, [role="heading"]
 *   - /admin/users                                sentinel: h1, h2, [role="heading"]
 *   - /admin/access                               sentinel: h1, h2, [role="heading"]  (redirects to /access/roles)
 *   - /admin/reports/fin-muhasebe-detay           sentinel: .ag-root-wrapper, .ag-root
 *
 * Auth flow:
 *   - test.beforeAll: invokes scripts/perf/auth-storage-setup.mjs
 *     reads PERF_AUTH_PASSWORD from env (GHA secret), generates storageState
 *     into tests/perf/.auth-storage.json (gitignored)
 *   - test: invokes route-performance-budget runner with --auth-storage flag
 *
 * Env:
 *   PERF_AUTH_USERNAME       — default "perf-test"
 *   PERF_AUTH_PASSWORD       — required (GHA secret PERF_AUTH_PASSWORD)
 *   PERF_AUTH_REALM          — default "platform-test"
 *   PERF_AUTH_CLIENT_ID      — default "frontend"
 *   PERF_AUTH_KEYCLOAK_BASE  — default https://testai.acik.com
 *   PERF_AUTH_APP_ORIGIN     — default https://testai.acik.com
 *   PERF_TARGET              — default "testai"
 *   PERF_RUNS                — default "3" (M2a1 N≥3 minimum)
 *   PERF_WARN_ONLY           — default "1" (M2a1 ilk ölçüm warn-only baseline seed)
 *
 * Output:
 *   tests/perf/last-run.json   — per-route metrics + medians
 *   tests/perf/.auth-storage.json   — runtime storageState (gitignored)
 *
 * Cross-AI peer review HARD RULE:
 *   - Implementer AI: Claude (Anthropic)
 *   - Reviewer AI: Codex (OpenAI)
 *   - Thread: 019e2b00
 *   - Verdict: AGREE (round 3) — ready_to_merge: true
 */

import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const AUTH_STORAGE_PATH = resolve(ROOT, 'tests/perf/.auth-storage.json');

const M2A1_ROUTES = [
  '/home',
  '/admin/users',
  '/admin/access',
  '/admin/reports/fin-muhasebe-detay',
].join(',');

test.describe('PERF-INIT-V2.1 PR-V2.1-M2a1: authenticated route budget (4 route × N≥3)', () => {
  test.beforeAll(async () => {
    // Generate runtime storageState (no committed fixture)
    if (!process.env.PERF_AUTH_PASSWORD) {
      throw new Error(
        '[M2a1] PERF_AUTH_PASSWORD env not set. Inject test persona password ' +
          '(NOT user login) via GHA secret PERF_AUTH_PASSWORD or local override.',
      );
    }

    const setupArgv = ['scripts/perf/auth-storage-setup.mjs'];

    try {
      execFileSync('node', setupArgv, {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env, PERF_AUTH_OUTPUT: AUTH_STORAGE_PATH },
      });
    } catch (e) {
      throw new Error(
        `[M2a1] auth-storage-setup failed: ${(e as { message?: string }).message ?? e}`,
        {
          cause: e,
        },
      );
    }

    if (!existsSync(AUTH_STORAGE_PATH)) {
      throw new Error(`[M2a1] storageState not created at ${AUTH_STORAGE_PATH}`);
    }
  });

  test('authenticated 4 route × N≥3 measurement matrix', () => {
    test.setTimeout(15 * 60 * 1000); // 15 minutes (4 routes × N≥3 × cold load)

    const target = process.env.PERF_TARGET || 'testai';
    const runs = process.env.PERF_RUNS || '3'; // M2a1 N≥3 minimum

    const argv: string[] = [
      'scripts/ci/route-performance-budget.mjs',
      '--target',
      target,
      '--runs',
      runs,
      '--routes',
      M2A1_ROUTES,
      '--auth-storage',
      AUTH_STORAGE_PATH,
    ];

    if (process.env.PERF_WARN_ONLY === '1') argv.push('--warn-only');
    if (process.env.PERF_UPDATE_BASELINE === '1') argv.push('--update-baseline');

    let exitCode = 0;
    try {
      execFileSync('node', argv, { cwd: ROOT, stdio: 'inherit' });
    } catch (e) {
      exitCode = (e as { status?: number }).status ?? 1;
    }

    // Read last-run artifact for visibility
    const artifact = JSON.parse(readFileSync(join(ROOT, 'tests', 'perf', 'last-run.json'), 'utf8'));

    test.info().annotations.push({
      type: 'm2a1-budget-summary',
      description:
        `target=${artifact.target} runs=${artifact.runs} routes=${artifact.routes.length} ` +
        `phase=warn-only-baseline-seed (PMD v9.1 §138 M2a1 ilk ölçüm)`,
    });

    // Per PMD v9.1 §138 + Codex `019e2b00`: M2a1 ilk ölçüm warn-only baseline seed.
    // "Sonuçlar iyi/kötü diye değil, ölçüm zincirini ve route baseline'ı başlatmak."
    // Exit code 0 expected when --warn-only set; budget breaches recorded but not blocking.
    expect(exitCode).toBe(0);
  });
});
