import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ATS_ROUTE = '/admin/interview-evidence';

function seriousOrCriticalViolations(
  violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations'],
) {
  return violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );
}

test.describe('Full ATS authorized product access', () => {
  test('desktop keeps navigation, role discovery and safe preview usable when remote is off', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/home', { waitUntil: 'domcontentloaded' });

    const navigationLink = page.getByRole('link', { name: /Interview Evidence/ });
    await expect(navigationLink).toBeVisible();
    await expect(navigationLink).toHaveAttribute('href', ATS_ROUTE);

    await page.getByRole('button', { name: /^(Ara|Search)$/ }).click();
    const commandPalette = page.getByRole('dialog');
    await expect(commandPalette).toBeVisible();
    await commandPalette.getByRole('textbox', { name: 'Command search' }).fill('mülakat');
    await commandPalette
      .getByRole('button', { name: /Interview Evidence/ })
      .first()
      .click();

    const productSurface = page.getByTestId('ats-product-availability');
    await expect(productSurface).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${ATS_ROUTE}/?$`));
    await expect(page.locator('main')).toHaveCount(1);
    await expect(productSurface.getByRole('heading', { name: 'ATS ürün alanı' })).toBeVisible();
    await expect(productSurface).toContainText('Menü ve adresiniz hazır; yetkiniz korunuyor.');
    await expect(productSurface.locator('article')).toHaveCount(8);

    const candidateFilter = productSurface.getByRole('button', { name: 'Aday', exact: true });
    await candidateFilter.focus();
    await page.keyboard.press('Enter');
    await expect(candidateFilter).toHaveAttribute('aria-pressed', 'true');
    await expect(productSurface).toContainText('2 özellik gösteriliyor');
    await expect(productSurface.locator('article')).toHaveCount(2);

    const preview = productSurface.getByText('Güvenli örneği incele').first();
    await preview.focus();
    await page.keyboard.press('Enter');
    await expect(productSurface).toContainText('Talep gönderilmez');

    for (const forbiddenAction of [
      'Adayı reddet',
      'Adayı işe al',
      'Adayı sırala',
      'Üretime uygula',
    ]) {
      await expect(productSurface.getByRole('button', { name: forbiddenAction })).toHaveCount(0);
    }

    const accessibility = await new AxeBuilder({ page })
      .include('[data-testid="ats-product-availability"]')
      .analyze();
    expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);

    await testInfo.attach('fullats-access-desktop', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });

  test('exact 390px preserves filters, boundaries and zero horizontal overflow', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/home', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Menüyü aç|Open menu/ }).click();
    await page.getByRole('button', { name: /^(İK|HR|Personal|RRHH)$/ }).click();
    await page.getByRole('button', { name: /Interview Evidence/ }).click();
    const productSurface = page.getByTestId('ats-product-availability');
    await expect(productSurface).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${ATS_ROUTE}/?$`));

    const auditorFilter = productSurface.getByRole('button', { name: 'Denetçi', exact: true });
    await auditorFilter.focus();
    await page.keyboard.press('Enter');
    await expect(auditorFilter).toHaveAttribute('aria-pressed', 'true');
    await expect(productSurface).toContainText('Bu sayfanın açmadığı kapılar');
    await expect(productSurface).toContainText('otomatik eleme veya sıralama');

    const preview = productSurface.getByText('Güvenli örneği incele').first();
    await preview.focus();
    await page.keyboard.press('Enter');
    await expect(productSurface).toContainText('üretim kaydı kullanılmaz');

    const overflow = await page.evaluate(() => {
      const surface = document.querySelector<HTMLElement>(
        '[data-testid="ats-product-availability"]',
      );
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        surfaceClientWidth: surface?.clientWidth ?? 0,
        surfaceScrollWidth: surface?.scrollWidth ?? 0,
      };
    });
    expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth);
    expect(overflow.surfaceScrollWidth).toBeLessThanOrEqual(overflow.surfaceClientWidth);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const boundary = productSurface.getByTestId('ats-product-boundary');
    const mobileNavigation = page.getByRole('navigation', { name: 'Bottom navigation' });
    await expect(boundary).toBeVisible();
    await expect(mobileNavigation).toBeVisible();
    const boundaryBox = await boundary.boundingBox();
    const mobileNavigationBox = await mobileNavigation.boundingBox();
    expect(boundaryBox, 'product safety boundary must have a rendered box').not.toBeNull();
    expect(mobileNavigationBox, 'mobile navigation must have a rendered box').not.toBeNull();
    expect(boundaryBox!.y + boundaryBox!.height).toBeLessThanOrEqual(mobileNavigationBox!.y);

    const accessibility = await new AxeBuilder({ page })
      .include('[data-testid="ats-product-availability"]')
      .analyze();
    expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);

    await testInfo.attach('fullats-access-390px', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });
});
