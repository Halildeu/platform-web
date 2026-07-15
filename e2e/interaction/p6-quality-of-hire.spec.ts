import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const MFE_URL = 'http://127.0.0.1:3011/';

async function openQualityOfHirePanel(page: Page) {
  await page.goto(MFE_URL, { waitUntil: 'networkidle' });
  const capability = page.getByTestId('intelligence-capability-QUALITY_OF_HIRE');
  await expect(capability).toBeVisible();
  await capability.focus();
  await page.keyboard.press('Enter');
  await expect(capability).toHaveAttribute('aria-pressed', 'true');
  const panel = page.getByTestId('quality-of-hire-evidence-panel');
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

test.describe('P6.0 Quality-of-Hire evidence browser acceptance', () => {
  test('desktop windows, outcome lineage, privacy controls and activation ceiling', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    const panel = await openQualityOfHirePanel(page);

    await expect(panel).toContainText('Quality-of-Hire Evidence Loop (P6.0)');
    await expect(panel).toContainText('SENTETİK');
    await expect(panel).toContainText('AGGREGATE ONLY');
    await expect(panel).toContainText('REAL ACTIVATION · FALSE');
    await expect(
      page.getByTestId('qoh-cohort-windows').locator('[data-testid^="qoh-window-"]'),
    ).toHaveCount(2);
    await expect(page.getByTestId('qoh-window-DAY_90')).toContainText(
      'Eligible 200 · Observed 160',
    );
    await expect(page.getByTestId('qoh-window-DAY_180')).toContainText('Missing 20 · Censored 20');
    await expect(page.getByTestId('qoh-window-DAY_180')).toContainText(
      'Outcome category 100 · 62.5%',
    );

    const day90Dimensions = panel.getByRole('group', {
      name: '90 gün Quality-of-Hire outcome boyutları',
    });
    const day180Dimensions = panel.getByRole('group', {
      name: '180 gün Quality-of-Hire outcome boyutları',
    });
    await expect(day90Dimensions.getByRole('button')).toHaveCount(4);
    await expect(day180Dimensions.getByRole('button')).toHaveCount(4);
    await expect(day90Dimensions).toContainText('Retention');
    await expect(day90Dimensions).toContainText('Yapılandırılmış ramp milestone');
    await expect(day90Dimensions).toContainText('Yönetici rubric outcome');
    await expect(day90Dimensions).toContainText('Yeni çalışan deneyimi');

    const managerOutcome = day90Dimensions.getByRole('button', {
      name: /Yönetici rubric outcome/,
    });
    await managerOutcome.focus();
    await page.keyboard.press('Enter');
    const detail = page.getByTestId('qoh-dimension-detail');
    await expect(managerOutcome).toHaveAttribute('aria-pressed', 'true');
    await expect(detail).toBeFocused();
    await expect(detail).toContainText('CONTESTABLE ASSOCIATION INPUT');
    await expect(detail).toContainText('category_3333333333333333');
    await expect(detail).toContainText('Wilson %95 0.548–0.696');

    await expect(page.getByTestId('qoh-decision-boundary')).toContainText('TEK QoH SKORU YOK');
    await expect(page.getByTestId('qoh-decision-boundary')).toContainText(
      'KORELASYON · NEDENSELLİK DEĞİL',
    );
    await expect(page.getByTestId('qoh-decision-boundary')).toContainText(
      'MODEL EĞİTİMİ / OPTİMİZASYON YOK',
    );
    await expect(page.getByTestId('qoh-measurement-privacy')).toContainText(
      'İstatistik minimumu 30 · disclosure minimumu 20',
    );
    await expect(page.getByTestId('qoh-measurement-privacy')).toContainText(
      'differencing-control:qoh:synthetic:v1',
    );
    await expect(page.getByTestId('qoh-outcome-lineage')).toContainText(
      'evidence-aggregate:hiring:synthetic:v1',
    );
    await expect(page.getByTestId('qoh-governance-lineage')).toContainText(
      'correction:qoh:synthetic:v1',
    );
    await expect(page.getByTestId('qoh-governance-lineage')).toContainText(
      'erasure:qoh:propagation:v1',
    );
    await expect(page.getByTestId('qoh-governance-lineage')).toContainText(
      'yalnız ORIGINAL receipt gösterir',
    );
    await expect(page.getByTestId('qoh-governance-lineage')).toContainText(
      'doğrulanmış previous receipt chain olmadan fail-closed reddedilir',
    );

    const gates = page.getByTestId('qoh-activation-gates');
    await expect(gates).toContainText('SYNTHETIC_EVIDENCE_ONLY');
    await expect(gates.getByText('NOT_MET', { exact: true })).toHaveCount(4);
    await expect(gates).toContainText('Customer controller');
    await expect(page.getByTestId('qoh-activate-button')).toBeDisabled();
    await expect(panel.getByRole('button', { name: 'Düzeltme isteği oluştur' })).toBeDisabled();
    await expect(
      panel.getByRole('button', { name: 'Aggregate evidence dışa aktar' }),
    ).toBeDisabled();

    for (const forbiddenName of [
      'Adayı sırala',
      'Adayı puanla',
      'Adayı reddet',
      'Adayı işe al',
      'Çalışanı puanla',
      'Performans aksiyonu oluştur',
      'Seçim modelini eğit',
      'Modeli optimize et',
    ]) {
      await expect(panel.getByRole('button', { name: forbiddenName })).toHaveCount(0);
    }

    const accessibility = await new AxeBuilder({ page })
      .include('[data-testid="intelligence-governance-lab"]')
      .analyze();
    expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);

    await testInfo.attach('p6-qoh-desktop', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });

  test('390px long refs wrap, windows remain visible and no horizontal overflow', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const panel = await openQualityOfHirePanel(page);

    await expect(page.getByTestId('qoh-window-DAY_90')).toBeVisible();
    await expect(page.getByTestId('qoh-window-DAY_180')).toBeVisible();
    await expect(page.getByTestId('qoh-window-DAY_180')).toContainText('Censored 20');
    await expect(page.getByTestId('qoh-outcome-lineage')).toContainText(
      'sha256:b554cc5e38989be32e69841d554276272d7e72d1aeebf8cb30316e19610c6855',
    );
    await expect(page.getByTestId('qoh-action-block-reason')).toContainText(
      'müşteri-controller ve owner gate olmadan',
    );
    await expect(page.getByTestId('qoh-activate-button')).toBeDisabled();

    const dimensions = panel.getByRole('group', {
      name: '180 gün Quality-of-Hire outcome boyutları',
    });
    const experience = dimensions.getByRole('button', { name: /Yeni çalışan deneyimi/ });
    await experience.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('qoh-dimension-detail')).toBeFocused();
    await expect(page.getByTestId('qoh-dimension-detail')).toContainText(
      'category_4444444444444444',
    );

    const overflow = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      panelClientWidth: document.querySelector<HTMLElement>(
        '[data-testid="quality-of-hire-evidence-panel"]',
      )?.clientWidth,
      panelScrollWidth: document.querySelector<HTMLElement>(
        '[data-testid="quality-of-hire-evidence-panel"]',
      )?.scrollWidth,
    }));
    expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth);
    expect(overflow.panelScrollWidth).toBeLessThanOrEqual(overflow.panelClientWidth ?? 0);

    const accessibility = await new AxeBuilder({ page })
      .include('[data-testid="quality-of-hire-evidence-panel"]')
      .analyze();
    expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);

    await testInfo.attach('p6-qoh-390px', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });
});
