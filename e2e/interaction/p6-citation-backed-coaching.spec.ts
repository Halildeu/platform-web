import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const MFE_URL = 'http://127.0.0.1:3011/';

async function openCoachingPanel(page: Page) {
  await page.goto(MFE_URL, { waitUntil: 'networkidle' });
  const capability = page.getByTestId('intelligence-capability-INTERVIEWER_COACHING');
  await expect(capability).toBeVisible();
  await capability.focus();
  await page.keyboard.press('Enter');
  const panel = page.getByTestId('citation-backed-coaching-panel');
  await expect(panel).toBeVisible();
  return panel;
}

function seriousOrCriticalViolations(
  violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations'],
) {
  return violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );
}

test.describe('P6.2 citation-backed coaching browser acceptance', () => {
  test('desktop citation closure, keyboard detail and proposal-only actions', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const panel = await openCoachingPanel(page);

    await expect(panel).toContainText('PROPOSAL ONLY');
    await expect(panel).toContainText('AI_SUGGESTED');
    await expect(page.getByTestId('coaching-suggestion')).toHaveCount(2);
    await expect(
      page.getByTestId('coaching-suggestion-list').getByText('1 SUPPORTED citation', {
        exact: true,
      }),
    ).toHaveCount(2);
    await expect(page.getByTestId('coaching-suggestion-list')).toContainText(
      'criterion_aaaaaaaaaaaaaaaa',
    );
    await expect(page.getByTestId('coaching-suggestion-list')).toContainText(
      'criterion_bbbbbbbbbbbbbbbb',
    );
    await expect(page.getByTestId('coaching-quality-signals')).toContainText('GÖZLENDİ');
    await expect(page.getByTestId('coaching-quality-signals')).toContainText('KANIT YETERSİZ');
    await expect(page.getByTestId('coaching-apply-button')).toBeDisabled();
    await expect(panel.getByRole('button', { name: 'Düzeltme isteği oluştur' })).toBeDisabled();

    for (const forbiddenName of ['Adayı reddet', 'Adayı işe al', 'Adayı sırala', 'Puanla']) {
      await expect(panel.getByRole('button', { name: forbiddenName })).toHaveCount(0);
    }

    const detail = page.getByTestId('coaching-citation-detail');
    for (const evidenceType of ['interview_response', 'work_sample']) {
      const citation = panel.getByRole('button', { name: `Citation aç · ${evidenceType}` });
      await expect(citation).toHaveCount(1);
      await citation.focus();
      await page.keyboard.press('Enter');
      await expect(citation).toHaveAttribute('aria-pressed', 'true');
      await expect(detail).toBeFocused();
      await expect(detail).toContainText(evidenceType);
    }
    await expect(detail).toContainText('segment_bbbbbbbbbbbbbbbb');
    await expect(detail).toContainText('provenance:citation:b:v1');
    await expect(page.getByTestId('coaching-governance-lineage')).toContainText(
      'appeal:coaching:synthetic:v1',
    );
    await expect(page.getByTestId('coaching-governance-lineage')).toContainText(
      'correction-path:coaching:synthetic:v1',
    );
    await expect(page.getByTestId('coaching-governance-lineage')).toContainText(
      'audit:coaching:synthetic:v1',
    );

    const accessibility = await new AxeBuilder({ page })
      .include('[data-testid="intelligence-governance-lab"]')
      .analyze();
    expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);

    await testInfo.attach('p6-coaching-desktop', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });

  test('390px refs wrap, evidence remains visible and no horizontal overflow', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const panel = await openCoachingPanel(page);

    const citation = panel.getByRole('button', { name: 'Citation aç · work_sample' });
    await citation.click();
    await expect(page.getByTestId('coaching-citation-detail')).toContainText(
      'ölçülen kurtarma süresi belirtilmemiş',
    );
    await expect(page.getByTestId('coaching-governance-lineage')).toContainText(
      `sha256:${'7'.repeat(64)}`,
    );
    await expect(page.getByTestId('coaching-action-block-reason')).toContainText(
      'legal/audit/owner gate olmadan uygulanamaz',
    );
    await expect(page.getByTestId('coaching-apply-button')).toBeDisabled();

    const overflow = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      panelClientWidth: document.querySelector<HTMLElement>(
        '[data-testid="citation-backed-coaching-panel"]',
      )?.clientWidth,
      panelScrollWidth: document.querySelector<HTMLElement>(
        '[data-testid="citation-backed-coaching-panel"]',
      )?.scrollWidth,
    }));
    expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth);
    expect(overflow.panelScrollWidth).toBeLessThanOrEqual(overflow.panelClientWidth ?? 0);

    const accessibility = await new AxeBuilder({ page })
      .include('[data-testid="citation-backed-coaching-panel"]')
      .analyze();
    expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);

    await testInfo.attach('p6-coaching-390px', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });
});
