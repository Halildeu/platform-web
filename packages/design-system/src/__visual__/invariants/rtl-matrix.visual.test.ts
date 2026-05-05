import { test, expect } from '@playwright/test';

/**
 * L4 invariant — RTL matrix snapshot (PR-3, Codex thread 019df8eb).
 *
 * Two snapshots: LTR + RTL. Asserts that direction-sensitive layout
 * (text alignment, icon mirroring, padding-start/end vs left/right)
 * produces visually consistent inversion. A regression in
 * direction-aware tokens produces a single diff per mode.
 */

const STORYBOOK_BASE = 'http://127.0.0.1:6007';

const STORIES = [
  {
    storyId: 'visual-invariants-rtlmatrix--ltr',
    snapshot: 'rtl-matrix-ltr.png',
    label: 'rtl matrix — ltr',
  },
  {
    storyId: 'visual-invariants-rtlmatrix--rtl',
    snapshot: 'rtl-matrix-rtl.png',
    label: 'rtl matrix — rtl',
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
