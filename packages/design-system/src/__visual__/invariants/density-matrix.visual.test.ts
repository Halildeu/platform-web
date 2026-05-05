import { test, expect } from '@playwright/test';

/**
 * L4 invariant — density matrix snapshot (PR-3, Codex thread 019df8eb).
 *
 * Three snapshots: compact + comfortable + spacious. Asserts that
 * `data-density` token cascade produces visually distinct, consistent
 * spacing across primitives. A regression in density-axis tokens
 * produces three diffs (one per density step) so direction is obvious.
 */

const STORYBOOK_BASE = 'http://127.0.0.1:6007';

const STORIES = [
  {
    storyId: 'visual-invariants-densitymatrix--compact',
    snapshot: 'density-matrix-compact.png',
    label: 'density matrix — compact',
  },
  {
    storyId: 'visual-invariants-densitymatrix--comfortable',
    snapshot: 'density-matrix-comfortable.png',
    label: 'density matrix — comfortable',
  },
  {
    storyId: 'visual-invariants-densitymatrix--spacious',
    snapshot: 'density-matrix-spacious.png',
    label: 'density matrix — spacious',
  },
] as const;

for (const { storyId, snapshot, label } of STORIES) {
  test(`${label}`, async ({ page }) => {
    await page.goto(`${STORYBOOK_BASE}/iframe.html?id=${storyId}&viewMode=story`);

    const matrix = page.getByTestId('matrix-root');
    await expect(matrix).toBeVisible({ timeout: 30_000 });

    await expect(matrix).toHaveScreenshot(snapshot, {
      maxDiffPixelRatio: 0.01,
    });
  });
}
