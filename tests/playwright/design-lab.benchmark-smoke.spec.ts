import { test, expect } from '@playwright/test';
import { authenticateAndNavigate } from './utils/auth';

/**
 * Design Lab benchmark route smoke — Faz 21.11 PR-A1.6a
 *
 * The route is gated behind `VITE_ENABLE_DESIGN_LAB_BENCHMARK` and is
 * only mounted in non-production Vite mode. The smoke spec is
 * defensive: it accepts EITHER outcome (route mounted vs. disabled
 * banner) so the spec keeps passing when the flag is intentionally
 * off in a build (e.g. production GHCR digest).
 *
 * When the flag IS on:
 *   - default config (uniform / medium / canvas-raw) runs
 *   - at least 1 measured row appears in the results table
 *   - JSON export downloads a payload whose `schemaVersion` matches
 *     `design-lab-scatter-benchmark.v1` and whose `results.length >= 1`
 *
 * No hard KPI is asserted here — the 1M tier + render-time threshold
 * lands in PR-A1.6b once we have a stable runner profile.
 */

const ROUTE = '/admin/design-lab/benchmark';
// Schema bumped to v2 in PR-A1.6b. v1 producers stopped emitting once
// that PR landed; the only artifact this spec sees today is v2 (or
// no artifact at all when the gate is closed).
const SCHEMA_VERSION = 'design-lab-scatter-benchmark.v2';

test.describe('Design Lab benchmark route smoke (PR-A1.6a + PR-A1.6b)', () => {
  test('benchmark route either mounts and produces an artifact, or shows the disabled banner', async ({
    page,
    baseURL,
  }) => {
    await authenticateAndNavigate(page, baseURL, ROUTE, ['DESIGN_LAB']);
    await page.waitForLoadState('networkidle');

    const route = page.getByTestId('benchmark-route');
    const disabled = page.getByTestId('benchmark-disabled');

    // Race the two terminal UI surfaces. The first one to appear wins.
    const winner = await Promise.race([
      route
        .waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => 'route' as const)
        .catch(() => 'route-timeout' as const),
      disabled
        .waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => 'disabled' as const)
        .catch(() => 'disabled-timeout' as const),
    ]);

    if (winner === 'disabled' || winner === 'route-timeout') {
      // Flag is off in this build — assert the disabled banner is
      // there and the test ends. Bundle invariant still holds because
      // the lazy chunk for the benchmark route was never loaded.
      await expect(disabled).toBeVisible();
      return;
    }

    // Flag is on — exercise the harness end-to-end with the default
    // config (uniform fixture, medium tier, canvas-raw backend).
    await expect(route).toBeVisible();

    const runButton = page.getByTestId('benchmark-run');
    await expect(runButton).toBeEnabled();
    await runButton.click();

    // Wait for the results table to materialise. The default
    // (uniform/medium/canvas-raw) is 100 points → fast even on the
    // slowest CI runner, but the runner walks 1 warmup + 3 measured
    // runs sequentially so we give it a generous ceiling.
    await expect(page.getByTestId('benchmark-results-table')).toBeVisible({
      timeout: 60_000,
    });

    // Wait for the run to actually complete. The runner re-enables
    // the "Run benchmark" button (with the original "Run benchmark"
    // label) when `isRunning` flips back to false. Waiting for this
    // signal is what guarantees the JSON export captures the FULL
    // matrix, not a partial snapshot mid-run.
    await expect(runButton).toBeEnabled({ timeout: 60_000 });
    await expect(runButton).toHaveText(/Run benchmark/, { timeout: 5_000 });

    // Trigger the JSON export and capture the downloaded blob.
    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
    await page.getByTestId('benchmark-export-json').click();
    const download = await downloadPromise;

    // Read the file content and parse the artifact.
    const path = await download.path();
    expect(path).toBeTruthy();
    if (!path) return; // type guard for the conditional above

    const fs = await import('node:fs/promises');
    const raw = await fs.readFile(path, 'utf-8');
    const artifact = JSON.parse(raw) as {
      schemaVersion: string;
      results: Array<{ fixture: string; tier: string; backend: string; renderMs: number }>;
      summary: {
        medianRenderMsByCase: Record<string, number>;
        bestRenderMsByCase: Record<string, number>;
      };
    };

    expect(artifact.schemaVersion).toBe(SCHEMA_VERSION);
    expect(artifact.results.length).toBeGreaterThanOrEqual(1);
    expect(artifact.summary.medianRenderMsByCase).toBeTruthy();

    // Sanity: every measured result row carries the expected fixture
    // / tier / backend triple and a positive renderMs. We do NOT
    // assert any KPI threshold here — that lands in PR-A1.6b.
    for (const row of artifact.results) {
      expect(row.fixture).toBe('uniform');
      expect(row.tier).toBe('medium');
      expect(row.backend).toBe('canvas-raw');
      expect(row.renderMs).toBeGreaterThan(0);
    }
  });
});
