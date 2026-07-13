import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const enabled = process.env.P5_DEPLOYMENT_READINESS_E2E === '1';

test.describe('Faz 25 P5 deployment readiness product surface', () => {
  test.skip(!enabled, 'Set P5_DEPLOYMENT_READINESS_E2E=1 for the dedicated two-server harness.');

  test.beforeEach(async ({ page, baseURL }) => {
    await page.goto(`${baseURL ?? 'http://127.0.0.1:3000'}/admin/interview-evidence`, {
      waitUntil: 'networkidle',
    });
    await expect(page.getByTestId('deployment-readiness-console')).toBeVisible();
  });

  test('renders canonical 4x8 PRE-G0 contract without readiness scoring', async ({ page }) => {
    const console = page.getByTestId('deployment-readiness-console');
    const catalog = page.getByTestId('deployment-profile-catalog');
    const table = page.getByTestId('deployment-evidence-table');

    await expect(catalog.getByRole('button')).toHaveCount(4);
    await expect(table.getByRole('row')).toHaveCount(9);
    await expect(console).toContainText('SENTETİK · PRE-G0 · VIEW-ONLY');
    await expect(console).toContainText('Owner kabulü 0/8');
    await expect(console).toContainText('Tek yüzde / ortalama yok');
    await expect(console).not.toContainText(/\b\d+%/);
    await expect(page.getByTestId('deployment-action-status')).toContainText(
      'Verifier action: UNAVAILABLE',
    );
    await expect(page.getByTestId('deployment-action-status')).toContainText(
      'Release action: UNAVAILABLE',
    );
    await expect(console.getByRole('button', { name: /verifier/i })).toHaveCount(0);
    await expect(console.getByRole('button', { name: /release/i })).toHaveCount(0);
  });

  test('keyboard profile selection keeps exact topology and profile-bound gates in sync', async ({
    page,
  }) => {
    const dedicated = page.getByTestId('deployment-profile-DEDICATED');
    await dedicated.focus();
    await page.keyboard.press('Space');

    await expect(dedicated).toHaveAttribute('aria-pressed', 'true');
    await expect(dedicated).toHaveAttribute('aria-controls', 'deployment-profile-evidence-panel');
    await expect(page.getByTestId('deployment-profile-detail')).toContainText('Dedicated Tenant');
    await expect(page.getByTestId('deployment-profile-detail')).toContainText('DEDICATED_TENANT');
    await expect(page.getByTestId('deployment-evidence-table').getByRole('row')).toHaveCount(9);

    const onPrem = page.getByTestId('deployment-profile-SOVEREIGN_ON_PREM');
    await onPrem.click();
    await expect(onPrem).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('deployment-profile-detail')).toContainText(
      'CUSTOMER_MANAGED_OFFLINE_KEYS',
    );
    await expect(page.getByTestId('deployment-profile-detail')).toContainText('0/2 · doğrulanmadı');
  });

  test('keeps responsibility, freshness, target-observed and P4/P6 boundaries visible', async ({
    page,
  }) => {
    await expect(page.getByTestId('deployment-responsibility-boundary')).toContainText(
      'OPERATIONAL_RESPONSIBILITY_NOT_PROVIDED',
    );
    await expect(page.getByTestId('deployment-responsibility-boundary')).toContainText(
      'inference yasak',
    );
    await expect(page.getByTestId('deployment-freshness-boundary')).toContainText(
      'POLICY_NOT_DEFINED',
    );
    await expect(page.getByTestId('deployment-recovery-summary')).toContainText('RPO target');
    await expect(page.getByTestId('deployment-recovery-summary')).toContainText('Ölçülmedi');
    await expect(page.getByTestId('deployment-activation-boundary')).toContainText(
      'Connector: P4 ayrı gate',
    );
    await expect(page.getByTestId('deployment-activation-boundary')).toContainText(
      'AI capability: P6 ayrı gate',
    );
  });

  test('390px viewport contains overflow and preserves an operable evidence table', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId('deployment-readiness-console').scrollIntoViewIfNeeded();

    await expect(page.getByTestId('deployment-profile-catalog').getByRole('button')).toHaveCount(4);
    await expect(page.getByRole('region', { name: /kanıt kapıları/ })).toBeVisible();
    await expect(page.getByTestId('deployment-table-scroll-hint')).toBeVisible();
    const viewportOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(viewportOverflow).toBeLessThanOrEqual(1);
  });

  test('keeps exact readiness tokens intact at 390px and 400% reflow-equivalent width', async ({
    page,
  }) => {
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.getByTestId('deployment-readiness-console').scrollIntoViewIfNeeded();

      const compactBadges = page.locator('[data-readiness-density="compact"]');
      const fullBadges = page.locator('[data-readiness-density="full"]');
      await expect(compactBadges.first()).toBeVisible();
      await expect(fullBadges.first()).toBeVisible();

      const compactLayout = await compactBadges.evaluateAll((badges) =>
        badges.map((badge) => {
          const style = window.getComputedStyle(badge);
          return {
            semanticText: badge.textContent,
            visibleText: badge.querySelector('[data-readiness-visible="true"]')?.textContent,
            whiteSpace: style.whiteSpace,
            overflowWrap: style.overflowWrap,
            wordBreak: style.wordBreak,
            hyphens: style.hyphens,
            contained: badge.scrollWidth <= badge.clientWidth + 1,
          };
        }),
      );
      expect(compactLayout.length).toBeGreaterThan(0);
      for (const badge of compactLayout) {
        expect(badge.visibleText).toBe('NOT_CONFIGURED');
        expect(badge.semanticText).toBe('NOT_CONFIGURED: YAPILANDIRILMADI');
        expect(badge.whiteSpace).toBe('nowrap');
        expect(badge.overflowWrap).toBe('normal');
        expect(badge.wordBreak).toBe('normal');
        expect(badge.hyphens).toBe('none');
        expect(badge.contained).toBe(true);
      }

      const fullLayout = await fullBadges.first().evaluate((badge) => {
        const style = window.getComputedStyle(badge);
        return {
          whiteSpace: style.whiteSpace,
          overflowWrap: style.overflowWrap,
          wordBreak: style.wordBreak,
          hyphens: style.hyphens,
        };
      });
      expect(fullLayout).toEqual({
        whiteSpace: 'normal',
        overflowWrap: 'normal',
        wordBreak: 'normal',
        hyphens: 'none',
      });
      const accessibilitySnapshot = await compactBadges.first().ariaSnapshot();
      expect(accessibilitySnapshot).toContain('NOT_CONFIGURED');
      expect(accessibilitySnapshot).toContain('YAPILANDIRILMADI');

      const readinessOverflow = await page
        .getByTestId('deployment-readiness-console')
        .evaluate((console) => console.scrollWidth - console.clientWidth);
      expect(readinessOverflow).toBeLessThanOrEqual(1);

      // 390px remains the established whole-page mobile acceptance. At the
      // 320px/400%-reflow equivalent, this issue owns the P5 console; legacy
      // sibling panels are tracked separately and must not be hidden here.
      if (width === 390) {
        const viewportOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(viewportOverflow).toBeLessThanOrEqual(1);
      }
    }
  });

  test('has no serious or critical axe violations in the P5 console', async ({ page }) => {
    const results = await analyzeP5Console(page);
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    );

    expect(
      blocking.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => node.target),
      })),
    ).toEqual([]);
  });
});

async function analyzeP5Console(page: Page) {
  return new AxeBuilder({ page })
    .include('[data-testid="deployment-readiness-console"]')
    .withTags(['wcag2a', 'wcag2aa', 'best-practice'])
    .analyze();
}
