import { test, expect } from '@playwright/test';

/**
 * L4 invariant — theme matrix snapshot (PR-3, Codex thread 019df8eb).
 *
 * Two snapshots: light mode + dark mode.
 *
 * Each story renders the shared MatrixCanvas with mode={light|dark} on
 * `data-mode` and snapshots the entire matrix root as ONE image. A
 * token rename or theme switch regression produces ONE diff per story,
 * not one diff per primitive.
 */

const STORYBOOK_BASE = 'http://127.0.0.1:6007';

const STORIES = [
  {
    storyId: 'visual-invariants-themematrix--light',
    snapshot: 'theme-matrix-light.png',
    label: 'theme matrix — light',
  },
  {
    storyId: 'visual-invariants-themematrix--dark',
    snapshot: 'theme-matrix-dark.png',
    label: 'theme matrix — dark',
  },
] as const;

for (const { storyId, snapshot, label } of STORIES) {
  test(`${label}`, async ({ page }) => {
    await page.goto(`${STORYBOOK_BASE}/iframe.html?id=${storyId}&viewMode=story`);

    // Matrix root is rendered with `data-testid="matrix-root"` to give
    // the snapshot a stable, deterministic locator (instead of relying
    // on full-page screenshot, which varies by Storybook chrome).
    const matrix = page.getByTestId('matrix-root');
    await expect(matrix).toBeVisible({ timeout: 30_000 });

    await expect(matrix).toHaveScreenshot(snapshot, {
      maxDiffPixelRatio: 0.01,
    });
  });
}
