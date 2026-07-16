import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('Faz 25 public candidate journey', () => {
  test('discovers a job and runs the editable local-only flow at 390px without auth, data requests or a11y violations', async ({
    page,
    baseURL,
  }) => {
    const dataRequests: string[] = [];
    const externalRemoteEntries: string[] = [];
    const previewOrigin = new URL(baseURL ?? 'http://127.0.0.1:3000').origin;
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/') || !['localhost', '127.0.0.1'].includes(url.hostname)) {
        dataRequests.push(`${request.method()} ${url.origin}${url.pathname}`);
      }
      if (url.pathname.endsWith('/remoteEntry.js') && url.origin !== previewOrigin) {
        externalRemoteEntries.push(`${url.origin}${url.pathname}`);
      }
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseURL ?? 'http://127.0.0.1:3000'}/jobs`, {
      waitUntil: 'networkidle',
    });

    await expect(page.getByTestId('public-jobs-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Açık pozisyonları keşfedin' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ürün Yöneticisi' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Senior Frontend Developer' })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    const jobsOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(jobsOverflow).toBeLessThanOrEqual(1);

    await page.getByRole('link', { name: 'Ürün Yöneticisi rolüne başvur' }).click();
    await expect(page.getByTestId('candidate-application-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ürün Yöneticisi' })).toBeVisible();
    await expect(page.getByText(/oturum açmanız gerekmez/i)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    const configuredBasePath = new URL(baseURL ?? 'http://127.0.0.1:3000').pathname.replace(
      /\/$/,
      '',
    );
    await expect(page).toHaveURL(new RegExp(`${configuredBasePath}/jobs/urun-yoneticisi/apply/?$`));
    await page.getByRole('link', { name: 'Açık Kariyer ilan listesi' }).click();
    await expect(page).toHaveURL(new RegExp(`${configuredBasePath}/jobs/?$`));
    await page.getByRole('link', { name: 'Ürün Yöneticisi rolüne başvur' }).click();

    await page.getByTestId('candidate-resume').setInputFiles({
      name: 'ornek-cv.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('synthetic-pdf'),
    });
    await expect(page.getByTestId('candidate-resume-meta')).toContainText('yalnız bu cihazda');
    await page.getByTestId('fill-synthetic-resume').click();
    await page.getByTestId('candidate-fullName').fill('Düzenlenmiş Demo Adayı');
    await page.getByRole('button', { name: 'Başvuruyu önizle' }).click();

    await expect(page.getByTestId('candidate-application-preview')).toContainText(
      'Düzenlenmiş Demo Adayı',
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    for (const confirmation of await page.getByRole('checkbox').all()) {
      await confirmation.check();
    }
    await page.getByTestId('create-local-application-receipt').click();

    await expect(page.getByTestId('candidate-application-receipt')).toContainText(
      'Form akışı başarıyla denendi',
    );
    await expect(page.getByTestId('candidate-receipt-id')).toHaveText(/^DEMO-[A-Z0-9]{6}$/);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(dataRequests).toEqual([]);
    expect(externalRemoteEntries).toEqual([]);
    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(horizontalOverflow).toBeLessThanOrEqual(1);
  });

  test('invalidates prior confirmations when the applicant returns to edit', async ({
    page,
    baseURL,
  }) => {
    await page.goto(`${baseURL ?? 'http://127.0.0.1:3000'}/jobs/urun-yoneticisi/apply/`);
    await expect(page.getByRole('heading', { name: 'Ürün Yöneticisi' })).toBeVisible();
    await page.getByTestId('fill-synthetic-resume').click();
    await page.getByRole('button', { name: 'Başvuruyu önizle' }).click();
    for (const confirmation of await page.getByRole('checkbox').all()) {
      await confirmation.check();
    }
    await expect(page.getByTestId('create-local-application-receipt')).toBeEnabled();

    await page.getByRole('button', { name: 'Bilgileri düzenle' }).click();
    await page.getByTestId('candidate-fullName').fill('Yeniden Düzenlenmiş Demo Adayı');
    await page.getByRole('button', { name: 'Başvuruyu önizle' }).click();

    await expect(page.getByTestId('create-local-application-receipt')).toBeDisabled();
    for (const confirmation of await page.getByRole('checkbox').all()) {
      await expect(confirmation).not.toBeChecked();
    }
  });
});
