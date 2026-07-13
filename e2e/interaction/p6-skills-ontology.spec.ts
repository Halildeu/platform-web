import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const MFE_URL = 'http://127.0.0.1:3011/';

async function openSkillsOntologyPanel(page: Page) {
  await page.goto(MFE_URL, { waitUntil: 'networkidle' });
  const capability = page.getByTestId('intelligence-capability-SKILLS_ONTOLOGY');
  await expect(capability).toBeVisible();
  await capability.click();
  const panel = page.getByTestId('skills-ontology-rediscovery-panel');
  await expect(panel).toBeVisible();
  return panel;
}

test.describe('P6.3 Skills Ontology browser acceptance', () => {
  test('desktop exact lineage, keyboard citation ve disabled action', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const panel = await openSkillsOntologyPanel(page);

    await expect(panel).toContainText('PROPOSAL ONLY');
    await expect(panel).toContainText('UNORDERED · RANKING YOK');
    await expect(page.getByTestId('skills-release-lineage')).toContainText(
      'release_2222222222222222 · ontology:skills:v2',
    );
    await expect(page.getByTestId('skills-binding-status')).toContainText(
      'REDISCOVERY EXACT TRACE BOUND',
    );
    await expect(page.getByTestId('skills-apply-button')).toBeDisabled();

    const incidentConcept = page.getByRole('button', {
      name: /Olay müdahalesi ve geri dönüş/,
    });
    await incidentConcept.focus();
    await page.keyboard.press('Enter');
    await expect(incidentConcept).toHaveAttribute('aria-pressed', 'true');

    const citation = page.getByRole('button', { name: 'Citation aç · work_sample' });
    await citation.focus();
    await page.keyboard.press('Enter');
    const detail = page.getByTestId('skills-citation-detail');
    await expect(detail).toBeFocused();
    await expect(detail).toContainText('evidence_bbbbbbbbbbbbbbbb');
    await expect(detail).toContainText('concept_bbbbbbbbbbbbbbbb');

    await testInfo.attach('p6-skills-desktop', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });

  test('390px no-overflow, tombstone ayrimi ve consent gorunurlugu', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const panel = await openSkillsOntologyPanel(page);

    await expect(page.getByTestId('skills-consent-purpose')).toContainText(
      'consent:rediscovery:synthetic:v1',
    );
    await expect(page.getByTestId('skills-rediscovery-results')).toContainText(
      '1 CURRENT · DISPLAY ORDER UNSPECIFIED',
    );
    await expect(page.getByTestId('skills-rediscovery-results')).not.toContainText(
      'subject_2222222222222222',
    );
    await expect(page.getByTestId('skills-tombstone-audit')).toContainText(
      'TRACE INVALIDATED BY TOMBSTONE',
    );

    const overflow = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      panelClientWidth: document.querySelector<HTMLElement>(
        '[data-testid="skills-ontology-rediscovery-panel"]',
      )?.clientWidth,
      panelScrollWidth: document.querySelector<HTMLElement>(
        '[data-testid="skills-ontology-rediscovery-panel"]',
      )?.scrollWidth,
    }));
    expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth);
    expect(overflow.panelScrollWidth).toBeLessThanOrEqual(overflow.panelClientWidth ?? 0);

    await expect(panel).toBeVisible();
    await testInfo.attach('p6-skills-390px', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });
});
