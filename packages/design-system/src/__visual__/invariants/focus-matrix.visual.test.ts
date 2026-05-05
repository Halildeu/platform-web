import { test, expect } from '@playwright/test';

/**
 * L4 invariant — focus matrix snapshot (PR-3, Codex thread 019df8eb).
 *
 * Two snapshots: focus ring rendered on the first interactive element
 * in light + dark mode. Asserts that the `--focus-ring` token resolves
 * consistently across appearance modes — token rename or focus-visible
 * regression produces a single diff per mode.
 *
 * Per Codex iter-3 (HIGH 2): focus is driven by a real Tab keystroke,
 * not by a programmatic `element.focus()` call. Programmatic focus in
 * Chromium does not guarantee `:focus-visible`, which is the selector
 * DS tokens key off. The test waits for `:focus-visible` to resolve
 * inside the matrix root before screenshotting.
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

    // Real Tab press ensures `:focus-visible` resolves. Storybook iframe
    // already has body focus by default, so a single Tab moves to the
    // first focusable inside MatrixCanvas — the primary Button.
    await page.keyboard.press('Tab');

    await page.waitForFunction(
      () => {
        const root = document.querySelector('[data-testid="matrix-root"]');
        if (!root) return false;
        const visible = root.querySelector(':focus-visible');
        return Boolean(visible);
      },
      undefined,
      { timeout: 5_000 },
    );

    await expect(matrix).toHaveScreenshot(snapshot, {
      maxDiffPixelRatio: 0.01,
    });
  });
}
