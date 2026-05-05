import { test, expect } from '@playwright/test';

/**
 * L4 invariant — focus matrix snapshot (PR-3, Codex thread 019df8eb).
 *
 * Two snapshots: focus ring rendered on the first interactive element
 * in light + dark mode. Asserts that the focus token resolves
 * consistently across appearance modes — token rename or
 * `--focus-ring` regression produces a single diff per mode.
 */

const STORYBOOK_BASE = 'http://127.0.0.1:6007';

const STORIES = [
  {
    storyId: 'visual-invariants-focusmatrix--light',
    snapshot: 'focus-matrix-light.png',
    label: 'focus matrix — light',
  },
  {
    storyId: 'visual-invariants-focusmatrix--dark',
    snapshot: 'focus-matrix-dark.png',
    label: 'focus matrix — dark',
  },
] as const;

for (const { storyId, snapshot, label } of STORIES) {
  test(`${label}`, async ({ page }) => {
    await page.goto(`${STORYBOOK_BASE}/iframe.html?id=${storyId}&viewMode=story`);

    const matrix = page.getByTestId('matrix-root');
    await expect(matrix).toBeVisible({ timeout: 30_000 });

    // Focus is auto-applied by the FocusMatrix story (focusFirst: true).
    // Wait for the focus state to settle before screenshotting; the
    // ring fires on focus-visible, not raw focus, so we move to the
    // page first via an explicit `page.keyboard.press('Tab')` no-op
    // would actually steal focus. Just ensure the button has it.
    await page.waitForFunction(
      () => {
        const btn = document.activeElement as HTMLElement | null;
        return btn?.tagName === 'BUTTON';
      },
      undefined,
      { timeout: 5_000 },
    );

    await expect(matrix).toHaveScreenshot(snapshot, {
      maxDiffPixelRatio: 0.01,
    });
  });
}
