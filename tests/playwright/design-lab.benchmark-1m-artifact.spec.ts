import { test, expect } from '@playwright/test';
import { authenticateAndNavigate } from './utils/auth';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Design Lab benchmark 1M artifact spec — Faz 21.11 PR-A1.6b
 *
 * This spec is intentionally NOT included in the default Playwright
 * suite (`pw:ci` / `pw:nightly`). It runs ONLY via the dedicated
 * GitHub Actions workflow `.github/workflows/benchmark-1m.yml`,
 * which sets `RUN_DESIGN_LAB_BENCHMARK=1` and serves the route from
 * a non-production Vite dev server with the
 * `VITE_ENABLE_DESIGN_LAB_BENCHMARK` flag turned on.
 *
 * The spec exercises the 1M tier (the centrepiece of the PR-A1.6a /
 * A1.6b leadership claim) and writes the resulting artifact JSON to
 * the GHA outputs directory so a follow-up step can upload it as a
 * workflow artifact.
 *
 * No KPI threshold is asserted here — Codex thread `019e0f36`
 * iter-1 made the deliberate split that "GitHub-hosted runner +
 * SwiftShader can't carry a hard 1M WebGL gate". The threshold
 * lands in PR-A1.6c on a self-hosted GPU runner profile.
 */

const ROUTE = '/admin/design-lab/benchmark';
const SCHEMA_VERSION = 'design-lab-scatter-benchmark.v2';

// Skip outside the dedicated workflow so a stray `pw:ci` invocation
// doesn't try to serve a 1M run on the wrong env.
const RUN = process.env.RUN_DESIGN_LAB_BENCHMARK === '1';

test.describe('Design Lab benchmark 1M artifact (PR-A1.6b workflow_dispatch only)', () => {
  test.skip(!RUN, 'Skipped unless RUN_DESIGN_LAB_BENCHMARK=1 (workflow_dispatch only).');

  // The 1M run is heavy. Give Playwright generous slack: 2 warmup +
  // 5 measured per case × 2 cases (uniform/webgl + uniform/canvas-lttb)
  // can take up to ~3 minutes on a software-WebGL GHA runner.
  test.setTimeout(8 * 60 * 1000);

  test('captures the 1M artifact and writes it to the workflow outputs dir', async ({
    page,
    baseURL,
  }, testInfo) => {
    // Inject the runner metadata before the route mounts so it lands
    // in the artifact's `environment.runner` block. Mirror what the
    // benchmark-1m.yml workflow plumbs through env.
    await page.addInitScript(
      ({ runnerEnv }) => {
        (
          window as unknown as { __designLabBenchmarkRunner?: Record<string, unknown> }
        ).__designLabBenchmarkRunner = runnerEnv;
      },
      {
        runnerEnv: {
          profile: 'github-hosted-trend',
          githubRunId: process.env.GITHUB_RUN_ID,
          sha: process.env.GITHUB_SHA,
          ref: process.env.GITHUB_REF,
          os: process.env.RUNNER_OS,
          nodeVersion: process.versions.node,
          playwrightVersion: process.env.PLAYWRIGHT_VERSION,
          chromeVersion: process.env.CHROMIUM_VERSION,
          headless: true,
        },
      },
    );

    await authenticateAndNavigate(page, baseURL, ROUTE, ['DESIGN_LAB']);
    await page.waitForLoadState('networkidle');

    const route = page.getByTestId('benchmark-route');
    await expect(route).toBeVisible({ timeout: 30_000 });

    // Pick uniform / million / [canvas-lttb + webgl]. Canvas-raw is
    // the danger-only opt-in and stays off — we don't want a 5+s
    // tab-blocking pass to land in the trend artifact.
    //
    // Uncheck defaults first so the matrix is deterministic.
    const fixtures = page.locator('fieldset:has(legend:text("Fixtures")) input[type="checkbox"]');
    const tiers = page.locator('fieldset:has(legend:text("Tiers")) input[type="checkbox"]');
    const backends = page.locator('fieldset:has(legend:text("Backends")) input[type="checkbox"]');

    // Reset every checkbox to off, then turn the desired ones on.
    const reset = async (group: typeof fixtures) => {
      const count = await group.count();
      for (let i = 0; i < count; i++) {
        const cb = group.nth(i);
        if (await cb.isChecked()) await cb.uncheck();
      }
    };
    await reset(fixtures);
    await reset(tiers);
    await reset(backends);

    await page.locator('label:has-text("uniform") input[type="checkbox"]').first().check();
    await page.locator('label:has-text("million") input[type="checkbox"]').first().check();
    await page.locator('label:has-text("canvas-lttb") input[type="checkbox"]').first().check();
    await page.locator('label:has-text("webgl") input[type="checkbox"]').first().check();

    // Run the matrix.
    const runButton = page.getByTestId('benchmark-run');
    await expect(runButton).toBeEnabled();
    await runButton.click();

    // Wait for the runner to fully complete. The "Run benchmark"
    // label flips back from "Running…" once `isRunning` falls.
    await expect(runButton).toBeEnabled({ timeout: 7 * 60 * 1000 });
    await expect(runButton).toHaveText(/Run benchmark/, { timeout: 5_000 });

    // Pull the artifact off the well-known window hook (test-only
    // surface — see `BenchmarkRoute.useEffect`).
    const artifact = await page.evaluate(
      () =>
        (
          window as unknown as {
            __designLabBenchmarkArtifact?: unknown;
          }
        ).__designLabBenchmarkArtifact,
    );
    expect(artifact, 'window.__designLabBenchmarkArtifact must be populated').toBeTruthy();

    const typed = artifact as {
      schemaVersion: string;
      environment: { measurementMode: string; runner?: { profile: string } };
      results: Array<{
        fixture: string;
        tier: string;
        backend: string;
        renderMs: number;
        settledSource: string;
      }>;
      summary: {
        medianRenderMsByCase: Record<string, number>;
        bestRenderMsByCase: Record<string, number>;
      };
    };

    expect(typed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(typed.environment.measurementMode).toBe('echarts-finished-2raf');
    expect(typed.environment.runner?.profile).toBe('github-hosted-trend');
    expect(typed.results.length).toBeGreaterThan(0);
    // 1M uniform / canvas-lttb is the safe reference — it must show up.
    expect(typed.summary.medianRenderMsByCase['uniform/million/canvas-lttb']).toBeGreaterThan(0);
    // 1M uniform / webgl is the official KPI candidate.
    expect(typed.summary.medianRenderMsByCase['uniform/million/webgl']).toBeDefined();

    // Persist the artifact to the workflow outputs dir so the next
    // GHA step can upload it.
    const outPath = testInfo.outputPath('benchmark-1m-artifact.json');
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(typed, null, 2), 'utf-8');
    await testInfo.attach('benchmark-1m-artifact.json', {
      path: outPath,
      contentType: 'application/json',
    });
  });
});
