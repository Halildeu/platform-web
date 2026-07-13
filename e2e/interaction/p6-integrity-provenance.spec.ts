import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const MFE_URL = 'http://127.0.0.1:3011/';

async function openIntegrityPanel(page: Page) {
  await page.goto(MFE_URL, { waitUntil: 'networkidle' });
  const capability = page.getByTestId('intelligence-capability-DEEPFAKE_PROVENANCE');
  await expect(capability).toBeVisible();
  await capability.click();
  const panel = page.getByTestId('integrity-provenance-review-panel');
  await expect(panel).toBeVisible();
  return panel;
}

test.describe('P6.4 Integrity and Provenance browser acceptance', () => {
  test('desktop status semantics, keyboard evidence drilldown and closed actions', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const panel = await openIntegrityPanel(page);

    await expect(panel).toContainText('SCREENING ONLY');
    await expect(page.getByTestId('integrity-surface-status')).toContainText(
      'ALL RECEIPT FIELD BINDINGS CONSISTENT',
    );
    await expect(page.getByTestId('integrity-surface-status')).toContainText(
      'REF / DIGEST REPLAY YOK',
    );
    await expect(page.getByTestId('integrity-apply-button')).toBeDisabled();
    await expect(panel.getByRole('button', { name: /reddet|fraud|deepfake doğrula/i })).toHaveCount(
      0,
    );

    const notPresent = panel.getByRole('button', { name: /MANIFEST BULUNAMADI/ });
    await notPresent.focus();
    await page.keyboard.press('Enter');
    await expect(notPresent).toHaveAttribute('aria-pressed', 'true');
    const lineage = page.getByTestId('integrity-receipt-lineage');
    await expect(lineage).toContainText('Yalnız manifest bulunamadığını gösterir');
    await expect(lineage).toContainText('NOT_PRESENT · null · null');

    const evidence = panel.getByRole('button', {
      name: 'Evidence aç · MANIFEST_NOT_PRESENT',
    });
    await evidence.focus();
    await page.keyboard.press('Enter');
    const detail = page.getByTestId('integrity-evidence-detail');
    await expect(detail).toBeFocused();
    await expect(detail).toContainText('snapshot_2222222222222222');

    await panel.getByRole('button', { name: /BINDING UYUŞMAZLIĞI/ }).click();
    const secondEvidence = panel.getByRole('button', {
      name: 'Evidence aç · ASSET_DIGEST_MISMATCH',
    });
    await secondEvidence.focus();
    expect(await detail.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('none');
    await page.keyboard.press('Enter');
    await expect(secondEvidence).toHaveAttribute('aria-pressed', 'true');
    await expect(detail).toBeFocused();
    expect(await detail.evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe('none');

    const accessibility = await new AxeBuilder({ page })
      .include('[data-testid="integrity-provenance-review-panel"]')
      .analyze();
    expect(
      accessibility.violations.filter(
        (violation) => violation.impact === 'critical' || violation.impact === 'serious',
      ),
    ).toEqual([]);

    await testInfo.attach('p6-integrity-desktop', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });

  test('390px no-overflow, transcode uncertainty, review path and gates', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const panel = await openIntegrityPanel(page);

    await panel.getByRole('button', { name: /BINDING UYUŞMAZLIĞI/ }).click();
    await expect(page.getByTestId('integrity-reason-evidence')).toContainText(
      'Accessibility transcode context receipt',
    );
    await expect(page.getByTestId('integrity-coverage')).toContainText(
      'SYNTHETIC_ONLY · BAĞIMSIZ KABUL YOK',
    );
    await expect(page.getByTestId('integrity-human-review')).toContainText('HUMAN REVIEW REQUIRED');
    await expect(page.getByTestId('integrity-activation-gates')).toContainText(
      'LEGAL GATE · NOT_MET',
    );

    const overflow = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      panelClientWidth: document.querySelector<HTMLElement>(
        '[data-testid="integrity-provenance-review-panel"]',
      )?.clientWidth,
      panelScrollWidth: document.querySelector<HTMLElement>(
        '[data-testid="integrity-provenance-review-panel"]',
      )?.scrollWidth,
    }));
    expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth);
    expect(overflow.panelScrollWidth).toBeLessThanOrEqual(overflow.panelClientWidth ?? 0);

    const accessibility = await new AxeBuilder({ page })
      .include('[data-testid="integrity-provenance-review-panel"]')
      .analyze();
    expect(
      accessibility.violations.filter(
        (violation) => violation.impact === 'critical' || violation.impact === 'serious',
      ),
    ).toEqual([]);

    await testInfo.attach('p6-integrity-390px', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });
});
