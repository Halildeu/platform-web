import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const MFE_URL = 'http://127.0.0.1:3011/';

test.describe('P4 canonical integration platform browser acceptance', () => {
  test('desktop surface is exact, view-only and keyboard operable', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(MFE_URL, { waitUntil: 'networkidle' });

    const workspace = page.getByTestId('integration-workspace');
    await expect(workspace).toBeVisible();
    await expect(page.getByTestId('integration-contract-status')).toContainText('CONTRACT VALID');
    await expect(page.getByTestId('integration-source-pin')).toContainText(
      '584fb1a407c926189fd8db7ee8b2028d5672d55a',
    );
    await expect(page.getByTestId('integration-source-pin')).toContainText(
      '71eface856d0b77c5d11130dae21032f3a44f5d71106751aad6c7b4060343d32',
    );
    await expect(page.getByTestId('connector-catalog').getByRole('button')).toHaveCount(6);
    await expect(page.getByTestId('synthetic-envelope-catalog').getByRole('listitem')).toHaveCount(
      3,
    );
    await expect(workspace).toContainText('PRE_G0_CONTRACT_ONLY');
    await expect(workspace).toContainText('OPAQUE_REF_ONLY');
    await expect(workspace.getByRole('button', { name: /bağlantıyı test et/i })).toHaveCount(0);
    await expect(workspace.getByRole('button', { name: /yazma yetkisini aç/i })).toHaveCount(0);
    await expect(workspace.getByRole('button', { name: /etkinleştir|aktive et/i })).toHaveCount(0);

    const search = page.getByLabel('Bağlayıcı ara');
    await search.fill('PORTABILITY');
    const portability = page.getByTestId('connector-open-portability-v1');
    await expect(portability).toBeVisible();
    await portability.focus();
    await page.keyboard.press('Enter');
    await expect(portability).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('connector-detail')).toContainText('SIGNED_WEBHOOK');
    await expect(page.getByTestId('connector-detail')).toContainText('300 saniye');

    const accessibility = await new AxeBuilder({ page })
      .include('[data-testid="integration-workspace"]')
      .analyze();
    expect(
      accessibility.violations.filter(
        (violation) => violation.impact === 'critical' || violation.impact === 'serious',
      ),
    ).toEqual([]);

    await testInfo.attach('p4-integration-platform-desktop', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });

  test('exact 390px wraps long immutable refs without page overflow', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(MFE_URL, { waitUntil: 'networkidle' });

    const workspace = page.getByTestId('integration-workspace');
    await expect(workspace).toBeVisible();
    const overflow = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('[data-testid="integration-workspace"]');
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        panelClientWidth: panel?.clientWidth ?? 0,
        panelScrollWidth: panel?.scrollWidth ?? 0,
      };
    });
    expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth);
    expect(overflow.panelScrollWidth).toBeLessThanOrEqual(overflow.panelClientWidth);

    const accessibility = await new AxeBuilder({ page })
      .include('[data-testid="integration-workspace"]')
      .analyze();
    expect(
      accessibility.violations.filter(
        (violation) => violation.impact === 'critical' || violation.impact === 'serious',
      ),
    ).toEqual([]);

    await testInfo.attach('p4-integration-platform-390px', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });
});
