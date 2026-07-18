import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const JOB = {
  slug: 'urun-yoneticisi',
  title: 'Ürün Yöneticisi',
  team: 'Ürün',
  location: 'İstanbul',
  mode: 'Hibrit',
  employmentType: 'Tam zamanlı',
  summary: 'Kullanıcı odaklı ürün geliştirme rolü',
  highlights: ['Ürün keşfi'],
  applicationFields: [
    'fullName',
    'email',
    'phone',
    'city',
    'linkedIn',
    'portfolio',
    'summary',
    'experience',
    'education',
    'skills',
    'note',
  ],
  noticeVersion: 'kvkk-application-v1',
};

const SECOND_JOB = {
  ...JOB,
  slug: 'senior-frontend-developer',
  title: 'Senior Frontend Developer',
  team: 'Mühendislik',
};

const installAtsApi = async (page: Page, submissions: Array<Record<string, unknown>> = []) => {
  await page.route('**/api/ats/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path.endsWith('/jobs')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([JOB, SECOND_JOB]),
      });
      return;
    }
    if (request.method() === 'GET' && path.endsWith(`/jobs/${JOB.slug}`)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(JOB),
      });
      return;
    }
    if (request.method() === 'POST' && path.endsWith(`/jobs/${JOB.slug}/applications`)) {
      submissions.push(JSON.parse(request.postData() ?? '{}') as Record<string, unknown>);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          publicRef: 'app_abcdefghijklmnopqrstuvwx',
          candidateAccessToken: 'A'.repeat(43),
          status: 'SUBMITTED',
          version: 0,
          submittedAt: '2026-07-18T06:00:00Z',
          replayed: false,
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
};

const buildSyntheticResumePdf = () => {
  const lines = [
    'Ad Soyad: Deniz Yilmaz',
    'E-posta: deniz.yilmaz@example.test',
    'Telefon: +90 555 000 00 00',
    'Sehir: Istanbul',
    'LinkedIn: https://www.linkedin.com/in/deniz-demo',
    'Portfoy: https://portfolio.example.test/deniz',
    'Profesyonel Ozet',
    'Kullanici ihtiyacini urune donusturen urun profesyoneli.',
    'Is Deneyimi',
    'Urun Uzmani - Ornek Teknoloji - 2022-2026',
    'Egitim',
    'Yonetim Bilisim Sistemleri - Ornek Universitesi - 2020',
    'Beceriler',
    'Urun kesfi, kullanici arastirmasi, analitik',
    'Not',
    'Urun odakli ekibinizle calismak istiyorum.',
  ];
  const escape = (value: string) => value.replace(/([\\()])/g, '\\$1');
  const stream = `BT\n/F1 10 Tf\n48 760 Td\n14 TL\n${lines
    .map((line) => `(${escape(line)}) Tj T*`)
    .join('\n')}\nET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
};

test.describe('Faz 25 public candidate journey', () => {
  test('boots a canonical career-handle application directly without the authenticated shell and imports PDF fields', async ({
    page,
    baseURL,
  }) => {
    const authBootstrapLogs: string[] = [];
    await installAtsApi(page);
    page.on('console', (message) => {
      if (message.text().includes('[AuthBootstrapper]')) authBootstrapLogs.push(message.text());
    });

    await page.goto(`${baseURL ?? 'http://127.0.0.1:3000'}/careers/acik/jobs/${JOB.slug}/apply`, {
      waitUntil: 'networkidle',
    });
    await expect(page.getByTestId('candidate-application-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: JOB.title })).toBeVisible();
    await page.getByTestId('candidate-resume').setInputFiles({
      name: 'ornek-cv.pdf',
      mimeType: 'application/pdf',
      buffer: buildSyntheticResumePdf(),
    });

    await expect(page.getByTestId('candidate-resume-meta')).toContainText(
      '11 boş alan PDF’den dolduruldu',
    );
    await expect(page.getByTestId('candidate-email')).toHaveValue('deniz.yilmaz@example.test');
    expect(authBootstrapLogs).toEqual([]);
  });

  test('discovers a job, imports a real PDF, preserves edits and submits only confirmed fields at 390px without auth or a11y violations', async ({
    page,
    baseURL,
  }) => {
    const dataRequests: string[] = [];
    const externalRemoteEntries: string[] = [];
    const submissions: Array<Record<string, unknown>> = [];
    await installAtsApi(page, submissions);
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

    const jobDetailLink = page.getByRole('link', { name: 'Ürün Yöneticisi ilanını incele' });
    await expect(jobDetailLink).toHaveAttribute('href', '/jobs/urun-yoneticisi');
    await jobDetailLink.click();
    await expect(page.getByRole('heading', { name: 'Pozisyon hakkında' })).toBeVisible();
    await expect(page).toHaveURL(/\/jobs\/urun-yoneticisi\/?$/u);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('link', { name: 'Başvuru formuna geç' }).click();
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
    await page.getByRole('link', { name: 'Ürün Yöneticisi ilanını incele' }).click();
    await page.getByRole('link', { name: 'Başvuru formuna geç' }).click();

    await page.getByTestId('candidate-resume').setInputFiles({
      name: 'ornek-cv.pdf',
      mimeType: 'application/pdf',
      buffer: buildSyntheticResumePdf(),
    });
    await expect(page.getByTestId('candidate-resume-meta')).toContainText(
      '11 boş alan PDF’den dolduruldu',
    );
    await expect(page.getByTestId('candidate-fullName')).toHaveValue('Deniz Yilmaz');
    await expect(page.getByTestId('candidate-email')).toHaveValue('deniz.yilmaz@example.test');
    await expect(page.getByTestId('candidate-experience')).toHaveValue(
      'Urun Uzmani - Ornek Teknoloji - 2022-2026',
    );
    await expect(page.getByTestId('candidate-resume-meta')).toContainText('ham içerik tutulmaz');
    await expect(page.getByTestId('candidate-resume-meta')).not.toContainText('ornek-cv.pdf');
    expect(
      await page
        .getByTestId('candidate-resume')
        .evaluate((input: HTMLInputElement) => input.files?.length ?? -1),
    ).toBe(0);
    await page.getByTestId('candidate-fullName').fill('Düzenlenmiş Demo Adayı');
    await page.getByRole('button', { name: 'Başvuruyu önizle' }).click();

    await expect(page.getByTestId('candidate-application-preview')).toContainText(
      'Düzenlenmiş Demo Adayı',
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    for (const confirmation of await page.getByRole('checkbox').all()) {
      await confirmation.check();
    }
    await page.getByTestId('create-application-receipt').click();

    await expect(page.getByTestId('candidate-application-receipt')).toContainText(
      'Başvurunuz kaydedildi',
    );
    await expect(page.getByTestId('candidate-receipt-id')).toHaveText(
      'app_abcdefghijklmnopqrstuvwx',
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({
      fullName: 'Düzenlenmiş Demo Adayı',
      email: 'deniz.yilmaz@example.test',
      experience: 'Urun Uzmani - Ornek Teknoloji - 2022-2026',
    });
    expect(Object.keys(submissions[0]).sort()).toEqual(
      [
        'accuracyConfirmedAt',
        'city',
        'education',
        'email',
        'experience',
        'fullName',
        'linkedIn',
        'note',
        'noticeAcceptedAt',
        'noticeVersion',
        'phone',
        'portfolio',
        'skills',
        'summary',
      ].sort(),
    );
    const serializedSubmission = JSON.stringify(submissions[0]);
    expect(serializedSubmission).not.toContain('%PDF');
    expect(serializedSubmission).not.toContain('ornek-cv.pdf');
    expect(dataRequests.length).toBeGreaterThan(0);
    expect(dataRequests.every((entry) => entry.includes('/api/ats/v1/'))).toBe(true);
    expect(
      externalRemoteEntries.every((entry) =>
        ['localhost', '127.0.0.1'].includes(new URL(entry).hostname),
      ),
    ).toBe(true);
    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(horizontalOverflow).toBeLessThanOrEqual(1);
  });

  test('invalidates prior confirmations when the applicant returns to edit', async ({
    page,
    baseURL,
  }) => {
    await installAtsApi(page);
    await page.goto(`${baseURL ?? 'http://127.0.0.1:3000'}/jobs/urun-yoneticisi/apply/`);
    await expect(page.getByRole('heading', { name: 'Ürün Yöneticisi' })).toBeVisible();
    await page.getByTestId('fill-synthetic-resume').click();
    await page.getByRole('button', { name: 'Başvuruyu önizle' }).click();
    for (const confirmation of await page.getByRole('checkbox').all()) {
      await confirmation.check();
    }
    await expect(page.getByTestId('create-application-receipt')).toBeEnabled();

    await page.getByRole('button', { name: 'Bilgileri düzenle' }).click();
    await page.getByTestId('candidate-fullName').fill('Yeniden Düzenlenmiş Demo Adayı');
    await page.getByRole('button', { name: 'Başvuruyu önizle' }).click();

    await expect(page.getByTestId('create-application-receipt')).toBeDisabled();
    for (const confirmation of await page.getByRole('checkbox').all()) {
      await expect(confirmation).not.toBeChecked();
    }
  });
});
