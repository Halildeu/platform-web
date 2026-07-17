import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ATS_ROUTE = '/admin/ats';

const SYNTHETIC_RECRUITER_APPLICATION = {
  publicRef: 'app_abcdefghijklmnopqrstuvwx',
  jobSlug: 'frontend-developer',
  jobTitle: 'Senior Frontend Developer',
  fullName: 'Aday DEMO-207',
  email: 'demo-207@example.test',
  phone: '+905550000000',
  city: 'İstanbul',
  linkedIn: null,
  portfolio: null,
  summary: 'Yalnız tarayıcı kabul testinde kullanılan sentetik profesyonel özet.',
  experience: 'Sentetik erişilebilirlik deneyimi.',
  education: 'Sentetik eğitim kaydı.',
  skills: ['React', 'Erişilebilirlik'],
  note: null,
  status: 'SUBMITTED',
  version: 0,
  createdAt: '2026-07-16T10:00:00Z',
  updatedAt: '2026-07-16T10:00:00Z',
} as const;

function seriousOrCriticalViolationSummary(
  violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations'],
) {
  return violations
    .filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
    .map((violation) => ({
      rule: violation.id,
      impact: violation.impact,
      nodeCount: violation.nodes.length,
    }));
}

test.describe('Full ATS authorized product access', () => {
  test('desktop keeps navigation, role discovery and safe preview usable when remote is off', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/home', { waitUntil: 'domcontentloaded' });

    const navigationLink = page.getByRole('link', { name: /ATS Ürün Merkezi|ATS Product Hub/ });
    await expect(navigationLink).toBeVisible();
    await expect(navigationLink).toHaveAttribute('href', ATS_ROUTE);

    await page.getByRole('button', { name: /^(Ara|Search)$/ }).click();
    const commandPalette = page.getByRole('dialog');
    await expect(commandPalette).toBeVisible();
    const queryInput = commandPalette.getByRole('textbox', { name: 'Command search' });
    await queryInput.click();
    await queryInput.pressSequentially('mülakat');
    await expect(queryInput).toHaveValue('mülakat');
    await commandPalette
      .getByRole('button', { name: /ATS Ürün Merkezi|ATS Product Hub/ })
      .first()
      .click();

    const productSurface = page.getByTestId('ats-product-hub');
    await expect(productSurface).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${ATS_ROUTE}/?$`));
    await expect(page.locator('main')).toHaveCount(1);
    await expect(productSurface.getByRole('heading', { name: 'ATS Ürün Merkezi' })).toBeVisible();
    await expect(productSurface).toContainText('henüz açık değil');
    await expect(productSurface.locator('article[data-testid^="ats-capability-"]')).toHaveCount(9);
    await expect(productSurface.getByTestId('ats-candidate-portal-link')).toHaveAttribute(
      'href',
      '/candidate',
    );
    await expect(productSurface.getByTestId('ats-recruiter-workspace-link')).toHaveAttribute(
      'href',
      '/admin/ats/recruiter',
    );
    await expect(productSurface.getByTestId('ats-live-module-gated')).toBeVisible();

    const candidateFilter = productSurface.getByRole('button', { name: 'Aday', exact: true });
    await candidateFilter.focus();
    await page.keyboard.press('Enter');
    await expect(candidateFilter).toHaveAttribute('aria-pressed', 'true');
    await expect(productSurface).toContainText('3 özellik gösteriliyor');
    await expect(productSurface.locator('article[data-testid^="ats-capability-"]')).toHaveCount(3);
    await expect(productSurface.getByTestId('ats-candidate-role-boundary')).toContainText(
      'Bu yönetici adresi adaya verilmez',
    );
    await expect(
      productSurface.getByTestId('ats-capability-candidate-cv-pdf-import'),
    ).toContainText('gerçek CV/PII işlenmez');

    const cvImport = productSurface.getByTestId('ats-capability-candidate-cv-pdf-import');
    await expect(cvImport.locator('input[type="file"]')).toHaveCount(0);
    const cvDemo = cvImport.getByRole('button', { name: 'Sentetik PDF taslak akışını dene' });
    await cvDemo.focus();
    await page.keyboard.press('Enter');
    await expect(cvImport).toContainText('Dosya seçimi, gerçek PDF/PII');
    await cvImport.getByRole('button', { name: 'Sentetik PDF örneğini işle' }).click();
    await expect(cvImport.locator('[data-testid^="ats-resume-field-"]')).toHaveCount(5);
    const emailInput = cvImport.getByLabel('E-posta');
    await emailInput.selectText();
    await emailInput.pressSequentially('playwright@example.invalid');
    await expect(emailInput).toHaveValue('playwright@example.invalid');
    await expect(emailInput).not.toHaveAttribute('readonly', '');
    await cvImport.getByRole('button', { name: 'Deneyim alanını kabul et' }).click();
    await cvImport.getByRole('button', { name: 'Eğitim alanını reddet' }).click();
    await cvImport.getByTestId('ats-resume-transfer-selected').click();
    const localDraft = cvImport.getByTestId('ats-synthetic-resume-draft');
    await expect(localDraft).toContainText('playwright@example.invalid');
    await expect(localDraft).toContainText('Sentetik Ürün Uzmanı');
    await expect(localDraft).not.toContainText('Örnek Üniversite');
    await expect(localDraft).toContainText('başvuru gönderilmedi');
    await expect(cvImport.locator('input[type="file"]')).toHaveCount(0);

    const roleCapabilityCounts = [
      ['Aday', 3],
      ['İşe alım uzmanı', 8],
      ['İşe alım yöneticisi', 6],
      ['Mülakatçı', 3],
      ['Denetçi', 7],
      ['Yönetici', 6],
    ] as const;
    for (const [role, count] of roleCapabilityCounts) {
      await productSurface.getByRole('button', { name: role, exact: true }).click();
      await expect(productSurface.locator('article[data-testid^="ats-capability-"]')).toHaveCount(
        count,
      );
    }
    await productSurface.getByRole('button', { name: 'Tüm roller', exact: true }).click();
    await expect(productSurface.locator('article[data-testid^="ats-capability-"]')).toHaveCount(9);

    const coaching = productSurface.getByTestId('ats-capability-citation-backed-coaching');
    await coaching.getByRole('button', { name: 'Koçluk önerisini dene' }).click();
    await coaching.getByRole('button', { name: 'Sentetik çıktıyı üret' }).click();
    await expect(coaching).toContainText('Öneri uygulanamaz');
    await expect(coaching).toContainText('ağ isteği, kayıt, bildirim veya karar üretilmedi');

    const agentic = productSurface.getByTestId('ats-capability-agentic-screening');
    await agentic.getByRole('button', { name: 'Ajan önerisini güvenle dene' }).click();
    await agentic.getByRole('button', { name: 'Sentetik çıktıyı üret' }).click();
    await expect(agentic).toContainText('Mesaj gönderilmez');
    await expect(agentic).toContainText('red/teklif/sıralama üretilmez');
    await expect(agentic).toContainText('toplu onay yoktur');

    for (const forbiddenAction of [
      'Adayı reddet',
      'Adayı işe al',
      'Adayı sırala',
      'Üretime uygula',
    ]) {
      await expect(productSurface.getByRole('button', { name: forbiddenAction })).toHaveCount(0);
    }

    // The active ATS navigation is part of the customer journey, so scan the
    // complete rendered shell rather than only the product content region.
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(seriousOrCriticalViolationSummary(accessibility.violations)).toEqual([]);

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
    await page.getByRole('button', { name: /ATS Ürün Merkezi|ATS Product Hub/ }).click();
    const productSurface = page.getByTestId('ats-product-hub');
    await expect(productSurface).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${ATS_ROUTE}/?$`));

    const auditorFilter = productSurface.getByRole('button', { name: 'Denetçi', exact: true });
    await auditorFilter.focus();
    await page.keyboard.press('Enter');
    await expect(auditorFilter).toHaveAttribute('aria-pressed', 'true');
    await expect(productSurface).toContainText('Bu merkezin açmadığı kapılar');
    await expect(productSurface).toContainText('otomatik eleme veya sıralama');

    const correction = productSurface.getByTestId('ats-capability-candidate-review-and-appeal');
    const preview = correction.getByRole('button', { name: 'Düzeltme taslağını dene' });
    await preview.focus();
    await page.keyboard.press('Enter');
    await correction.getByRole('button', { name: 'Sentetik çıktıyı üret' }).click();
    await expect(correction).toContainText('üretim kaydı kullanılmaz');

    const overflow = await page.evaluate(() => {
      const surface = document.querySelector<HTMLElement>('[data-testid="ats-product-hub"]');
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
      .include('[data-testid="ats-product-hub"]')
      .analyze();
    expect(seriousOrCriticalViolationSummary(accessibility.violations)).toEqual([]);

    await testInfo.attach('fullats-access-390px', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });

  test('public candidate portal stays usable at exact 390px without auth or data requests', async ({
    page,
  }, testInfo) => {
    const dataRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/') || !['GET', 'HEAD'].includes(request.method())) {
        dataRequests.push(`${request.method()} ${url.pathname}`);
      }
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/candidate', { waitUntil: 'networkidle' });

    const candidatePortal = page.getByTestId('candidate-portal-page');
    await expect(candidatePortal).toBeVisible();
    await expect(
      candidatePortal.getByRole('heading', { name: 'Başvurunuzun durumunu izleyin' }),
    ).toBeVisible();
    await expect(
      candidatePortal.getByRole('heading', { name: 'Bu sekmede takip edilen başvuru yok' }),
    ).toBeVisible();
    await expect(
      candidatePortal.getByText(
        'takip anahtarı yalnız başvuruyu gönderdiğiniz tarayıcı sekmesinde',
        {
          exact: false,
        },
      ),
    ).toBeVisible();
    await expect(
      candidatePortal.getByRole('link', { name: 'Açık pozisyonlara git' }),
    ).toHaveAttribute('href', '/jobs');
    expect(dataRequests).toEqual([]);

    const overflow = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth);

    const accessibility = await new AxeBuilder({ page })
      .include('[data-testid="candidate-portal-page"]')
      .analyze();
    expect(seriousOrCriticalViolationSummary(accessibility.violations)).toEqual([]);

    await testInfo.attach('fullats-candidate-portal-390px', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });

  test('ATS hub candidate link leaves the protected shell and re-enters the public bootstrap', async ({
    page,
  }) => {
    const dataRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/') || !['GET', 'HEAD'].includes(request.method())) {
        dataRequests.push(`${request.method()} ${url.pathname}`);
      }
    });

    await page.goto('/admin/ats', { waitUntil: 'networkidle' });
    const candidateLink = page.getByTestId('ats-candidate-portal-link');
    await expect(candidateLink).toBeVisible();
    dataRequests.length = 0;

    await candidateLink.click();
    await expect(page).toHaveURL(/\/candidate\/?$/);
    await expect(page.getByTestId('candidate-portal-page')).toBeVisible();
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: 'Bottom navigation' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^(Ara|Search)$/ })).toHaveCount(0);
    expect(dataRequests).toEqual([]);
  });

  test('authorized recruiter workspace exposes a tenant inbox while irreversible actions stay closed', async ({
    page,
  }, testInfo) => {
    const dataRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/') || !['GET', 'HEAD'].includes(request.method())) {
        dataRequests.push(`${request.method()} ${url.pathname}`);
      }
    });
    await page.route('**/api/ats/v1/recruiter/applications?page=0&size=50', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [SYNTHETIC_RECRUITER_APPLICATION],
          page: 0,
          size: 50,
          total: 1,
        }),
      });
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/ats/recruiter', { waitUntil: 'networkidle' });

    const workspace = page.getByTestId('recruiter-workspace-page');
    await expect(workspace).toBeVisible();
    await expect(workspace.getByRole('heading', { name: 'İK Çalışma Alanı' })).toBeVisible();
    // Initial API access is fulfilled with the bounded synthetic tenant fixture.
    // Filtering and inspection from this point onward must stay browser-local.
    dataRequests.length = 0;
    await workspace.getByRole('combobox', { name: 'Pozisyon' }).selectOption('frontend-developer');
    await workspace.getByLabel('Aday, e-posta veya beceri ara').fill('erişilebilirlik');
    await expect(workspace.getByText('Aday DEMO-207')).toBeVisible();
    await workspace.getByRole('button', { name: 'Başvuruyu incele' }).click();
    await expect(workspace.getByRole('heading', { name: 'Aday bilgileri' })).toBeFocused();
    await expect(workspace.getByText('Sentetik erişilebilirlik deneyimi.')).toBeVisible();
    for (const action of ['Adaya mesaj gönder', 'Adayı reddet', 'Teklif gönder']) {
      await expect(workspace.getByRole('button', { name: new RegExp(action) })).toHaveCount(0);
    }
    expect(dataRequests).toEqual([]);

    const overflow = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth);

    const accessibility = await new AxeBuilder({ page })
      .include('[data-testid="recruiter-workspace-page"]')
      .analyze();
    expect(seriousOrCriticalViolationSummary(accessibility.violations)).toEqual([]);

    await testInfo.attach('fullats-recruiter-workspace-390px', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });
});
