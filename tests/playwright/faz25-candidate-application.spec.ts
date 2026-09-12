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
  const proposalValues: Record<string, string> = {
    fullName: 'Deniz Yilmaz',
    email: 'deniz.yilmaz@example.test',
    phone: '+90 555 000 00 00',
    city: 'Istanbul',
    summary: 'Kullanici ihtiyacini urune donusturen urun profesyoneli.',
    experience: 'Urun Uzmani - Ornek Teknoloji - 2022-2026',
    education: 'Yonetim Bilisim Sistemleri - Ornek Universitesi - 2020',
    skills: 'Urun kesfi, kullanici arastirmasi, analitik',
  };
  const buildProposals = () =>
    Object.entries(proposalValues).map(([field, proposedValue]) => ({
      field,
      proposedValue,
      candidateValue: null,
      state: 'UNREVIEWED',
      version: 0,
      provenance: {
        page: 1,
        x: 48,
        y: 120,
        width: 240,
        height: 14,
        confidence: 0.96,
        parserVersion: 'pdfbox-resume-v1',
      },
    }));
  let resumeImport: Record<string, any> = {
    importId: 'ri_abcdefghijklmnopqrstuvwx',
    jobSlug: JOB.slug,
    state: 'ACTIVE',
    version: 0,
    documentVersion: 0,
    noticeVersion: 'candidate-resume-import-v1',
    noticeAcceptedAt: '2026-07-18T06:00:00Z',
    uploadExpiresAt: '2026-07-18T06:15:00Z',
    firstUploadAt: null,
    expiresAt: null,
    parserVersion: null,
    protectedSuppressed: 0,
    unsupportedOutput: 0,
    createdAt: '2026-07-18T06:00:00Z',
    updatedAt: '2026-07-18T06:00:00Z',
    purgedAt: null,
    proposals: [],
  };
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
    if (request.method() === 'POST' && path.endsWith(`/jobs/${JOB.slug}/resume-imports`)) {
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      resumeImport = { ...resumeImport, noticeAcceptedAt: body.noticeAcceptedAt };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(resumeImport),
      });
      return;
    }
    if (
      request.method() === 'PUT' &&
      path.endsWith(`/candidate/resume-imports/${resumeImport.importId}/document`)
    ) {
      resumeImport = {
        ...resumeImport,
        version: resumeImport.version + 1,
        documentVersion: resumeImport.documentVersion || 1,
        firstUploadAt: resumeImport.firstUploadAt ?? '2026-07-18T06:01:00Z',
        expiresAt: '2026-07-19T06:01:00Z',
        parserVersion: 'pdfbox-resume-v1',
        protectedSuppressed: 1,
        proposals: buildProposals(),
      };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(resumeImport),
      });
      return;
    }
    if (
      request.method() === 'GET' &&
      path.endsWith(`/candidate/resume-imports/${resumeImport.importId}`)
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(resumeImport),
      });
      return;
    }
    const fieldMatch = path.match(/\/candidate\/resume-imports\/[^/]+\/fields\/([^/]+)$/u);
    if (request.method() === 'PUT' && fieldMatch) {
      const body = JSON.parse(request.postData() ?? '{}') as {
        state: string;
        editedValue?: string;
      };
      resumeImport = {
        ...resumeImport,
        version: resumeImport.version + 1,
        proposals: resumeImport.proposals.map((proposal: Record<string, unknown>) =>
          proposal.field === fieldMatch[1]
            ? {
                ...proposal,
                state: body.state,
                candidateValue: body.state === 'EDITED' ? body.editedValue : null,
                version: Number(proposal.version) + 1,
              }
            : proposal,
        ),
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(resumeImport),
      });
      return;
    }
    if (
      request.method() === 'POST' &&
      path.endsWith(`/candidate/resume-imports/${resumeImport.importId}/confirm`)
    ) {
      const fields = Object.fromEntries(
        resumeImport.proposals
          .filter((proposal: Record<string, unknown>) =>
            ['ACCEPTED', 'EDITED'].includes(String(proposal.state)),
          )
          .map((proposal: Record<string, unknown>) => [
            proposal.field,
            proposal.state === 'EDITED' ? proposal.candidateValue : proposal.proposedValue,
          ]),
      );
      resumeImport = {
        ...resumeImport,
        state: 'CONFIRMED',
        version: resumeImport.version + 1,
        proposals: [],
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          resumeImport,
          draft: {
            draftId: '11111111-1111-1111-1111-111111111111',
            importId: resumeImport.importId,
            version: 0,
            fields,
            createdAt: '2026-07-18T06:02:00Z',
          },
        }),
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
  for (const width of [320, 390, 1280]) {
    test(`maximum-length summary reflows in preview at ${width}px`, async ({
      page,
      baseURL,
    }, testInfo) => {
      const submissions: Array<Record<string, unknown>> = [];
      await installAtsApi(page, submissions);
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${baseURL}/careers/acik/jobs/${JOB.slug}/apply`);
      await page.getByTestId('fill-synthetic-resume').click();
      const summary = 'a'.repeat(4000);
      await page.getByTestId('candidate-summary').fill(summary);
      await page.getByRole('button', { name: 'Başvuruyu kontrol et' }).click();
      const preview = page.getByTestId('candidate-application-preview');
      await expect(preview).toBeVisible();
      await expect(preview.getByText(summary, { exact: true })).toHaveText(summary);
      await expect(page.getByRole('heading', { name: 'Başvuru önizlemesi' })).toBeFocused();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(1);
      await expect(page.getByTestId('create-application-receipt')).toBeDisabled();
      expect(submissions).toHaveLength(0);
      await preview.getByText(summary, { exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`summary-preview-${width}.png`) });
      await page.getByRole('button', { name: 'Bilgileri düzenle' }).click();
      await expect(page.getByTestId('candidate-summary')).toHaveValue(summary);
    });
  }

  for (const width of [390, 1280]) {
    test(`summary validation preserves edits and blocks invalid preview at ${width}px`, async ({
      page,
      baseURL,
    }, testInfo) => {
      const submissions: Array<Record<string, unknown>> = [];
      await installAtsApi(page, submissions);
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${baseURL}/careers/acik/jobs/${JOB.slug}/apply`);
      await page.getByTestId('fill-synthetic-resume').click();
      const summary = page.getByTestId('candidate-summary');
      for (const value of ['abc', 'x'.repeat(4001)]) {
        await summary.fill(value);
        await page.getByRole('button', { name: 'Başvuruyu kontrol et' }).click();
        await expect(page.getByTestId('candidate-application-preview')).toHaveCount(0);
        await expect(summary).toHaveValue(value);
        await expect(summary).toBeFocused();
        await expect(summary).toHaveAttribute('aria-invalid', 'true');
        await expect(summary).toHaveAccessibleDescription(
          'Profesyonel özet 10 ile 4000 karakter arasında olmalıdır.',
        );
      }
      expect(submissions).toHaveLength(0);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath(`summary-error-${width}.png`) });
      await summary.fill('Urun gelistirme deneyimine sahip sentetik aday.');
      await expect(summary).not.toHaveAttribute('aria-invalid', 'true');
      await page.getByRole('button', { name: 'Başvuruyu kontrol et' }).click();
      await expect(page.getByTestId('candidate-application-preview')).toBeVisible();
      for (const confirmation of await page.getByRole('checkbox').all()) {
        await confirmation.check();
      }
      await page.getByTestId('create-application-receipt').click();
      await expect(page.getByTestId('candidate-application-receipt')).toBeVisible();
      expect(submissions).toHaveLength(1);
      expect(submissions[0].summary).toBe('Urun gelistirme deneyimine sahip sentetik aday.');
    });
  }

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
    await page.getByLabel(/CV içe aktarma aydınlatmasını okudum/i).check();
    await page.getByTestId('candidate-resume').setInputFiles({
      name: 'ornek-cv.pdf',
      mimeType: 'application/pdf',
      buffer: buildSyntheticResumePdf(),
    });
    await expect(page.getByTestId('candidate-resume-review')).toBeVisible();
    await expect(page.getByTestId('candidate-email')).toHaveValue('');
    await page.getByRole('button', { name: 'Güvenli önerileri kabul et' }).click();
    await expect(
      page.getByRole('button', { name: /Seçtiğim alanları forma aktar \(8\)/ }),
    ).toBeEnabled();
    await page.getByRole('button', { name: /Seçtiğim alanları forma aktar/ }).click();
    await expect(page.getByTestId('candidate-resume-meta')).toContainText('8 alan forma aktarıldı');
    await expect(page.getByTestId('candidate-email')).toHaveValue('deniz.yilmaz@example.test');
    expect(authBootstrapLogs).toEqual([]);
  });

  test('discovers a job, imports a real PDF, preserves edits and submits only confirmed fields at 390px without auth or a11y violations', async ({
    page,
    baseURL,
  }, testInfo) => {
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

    await page.getByLabel(/CV içe aktarma aydınlatmasını okudum/i).check();
    await page.getByTestId('candidate-resume').setInputFiles({
      name: 'ornek-cv.pdf',
      mimeType: 'application/pdf',
      buffer: buildSyntheticResumePdf(),
    });
    await expect(page.getByTestId('candidate-resume-review')).toBeVisible();
    await expect(page.getByTestId('candidate-fullName')).toHaveValue('');
    await page.getByRole('button', { name: 'Güvenli önerileri kabul et' }).click();
    await expect(
      page.getByRole('button', { name: /Seçtiğim alanları forma aktar \(8\)/ }),
    ).toBeEnabled();
    await page.getByRole('button', { name: /Seçtiğim alanları forma aktar/ }).click();
    await expect(page.getByTestId('candidate-resume-meta')).toContainText('8 alan forma aktarıldı');
    await expect(page.getByTestId('candidate-fullName')).toHaveValue('Deniz Yilmaz');
    await expect(page.getByTestId('candidate-email')).toHaveValue('deniz.yilmaz@example.test');
    await expect(page.getByTestId('candidate-experience-0-description')).toHaveValue(
      'Urun Uzmani - Ornek Teknoloji - 2022-2026',
    );
    await expect(page.getByTestId('candidate-education-0-description')).toHaveValue(
      'Yonetim Bilisim Sistemleri - Ornek Universitesi - 2020',
    );
    await expect(page.getByTestId('candidate-resume-meta')).toContainText('ham PDF tutulmadı');
    await expect(page.getByTestId('candidate-resume-meta')).not.toContainText('ornek-cv.pdf');
    await expect(page.getByTestId('candidate-resume')).toHaveCount(0);
    await page.getByTestId('candidate-fullName').fill('Düzenlenmiş Demo Adayı');
    await page.getByTestId('candidate-linkedIn').fill('https://www.linkedin.com/in/deniz-demo');
    await page.getByTestId('candidate-portfolio').fill('https://portfolio.example.test/deniz');
    await page.getByTestId('candidate-note').fill('Urun odakli ekibinizle calismak istiyorum.');
    await page.getByTestId('candidate-experience-0-title').fill('Kidemli Urun Uzmani');
    await page.getByTestId('candidate-education-0-school').fill('Duzenlenmis Ornek Universitesi');
    await page.getByRole('button', { name: 'Başvuruyu kontrol et' }).click();

    await expect(page.getByTestId('candidate-application-preview')).toContainText(
      'Düzenlenmiş Demo Adayı',
    );
    await expect(page.getByTestId('candidate-application-preview')).toContainText(
      'Kidemli Urun Uzmani',
    );
    await expect(page.getByTestId('candidate-application-preview')).toContainText(
      'Duzenlenmis Ornek Universitesi',
    );
    await expect(page.getByTestId('create-application-receipt')).toBeDisabled();
    expect(submissions).toHaveLength(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('grouped-preview-390.png'), fullPage: true });
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
      linkedIn: 'https://www.linkedin.com/in/deniz-demo',
      portfolio: 'https://portfolio.example.test/deniz',
      note: 'Urun odakli ekibinizle calismak istiyorum.',
      experienceEntries: [
        {
          title: 'Kidemli Urun Uzmani',
          description: 'Urun Uzmani - Ornek Teknoloji - 2022-2026',
        },
      ],
      educationEntries: [
        {
          school: 'Duzenlenmis Ornek Universitesi',
          description: 'Yonetim Bilisim Sistemleri - Ornek Universitesi - 2020',
        },
      ],
    });
    expect(Object.keys(submissions[0]).sort()).toEqual(
      [
        'accuracyConfirmedAt',
        'city',
        'educationEntries',
        'email',
        'experienceEntries',
        'fullName',
        'linkedIn',
        'note',
        'noticeAcceptedAt',
        'noticeVersion',
        'phone',
        'portfolio',
        'skills',
        'summary',
        'resumeImportId',
        'resumeDraftVersion',
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
    await page.screenshot({
      path: testInfo.outputPath('submission-receipt-390.png'),
      fullPage: true,
    });
  });

  test('invalidates prior confirmations when the applicant returns to edit', async ({
    page,
    baseURL,
  }) => {
    const submissions: Array<Record<string, unknown>> = [];
    await installAtsApi(page, submissions);
    await page.goto(`${baseURL ?? 'http://127.0.0.1:3000'}/jobs/urun-yoneticisi/apply/`);
    await expect(page.getByRole('heading', { name: 'Ürün Yöneticisi' })).toBeVisible();
    await page.getByTestId('fill-synthetic-resume').click();
    await page.getByRole('button', { name: 'Başvuruyu kontrol et' }).click();
    for (const confirmation of await page.getByRole('checkbox').all()) {
      await confirmation.check();
    }
    await expect(page.getByTestId('create-application-receipt')).toBeEnabled();

    await page.getByRole('button', { name: 'Bilgileri düzenle' }).click();
    await page.getByTestId('candidate-fullName').fill('Yeniden Düzenlenmiş Demo Adayı');
    await page.getByRole('button', { name: 'Başvuruyu kontrol et' }).click();

    await expect(page.getByTestId('create-application-receipt')).toBeDisabled();
    for (const confirmation of await page.getByRole('checkbox').all()) {
      await expect(confirmation).not.toBeChecked();
    }
    expect(submissions).toHaveLength(0);
    for (const confirmation of await page.getByRole('checkbox').all()) {
      await confirmation.check();
    }
    await page.getByTestId('create-application-receipt').click();
    await expect(page.getByTestId('candidate-receipt-id')).toHaveText(
      'app_abcdefghijklmnopqrstuvwx',
    );
    expect(submissions).toHaveLength(1);
    expect(submissions[0].fullName).toBe('Yeniden Düzenlenmiş Demo Adayı');
  });
});

/**
 * ats#966 — GERÇEK TARAYICI regresyonları (sentetik).
 *
 * <p>jsdom bazı şeyleri kanıtlayamaz: gerçek olay döngüsü, gerçek input odağı ve
 * gerçekten GECİKEN bir ağ yanıtı. Bu blok tam olarak o boşluğu kapatır — özellikle
 * "ref'ler efekt akmadan bayat kalır mı" sorusunu, yapay bir jsdom kurgusuyla değil
 * gerçek Chromium'da ölçer.
 *
 * <p>ADLANDIRMA SINIRI: bu katman sentetik API mock'larıyla, yerel dev sunucusunda
 * koşar. Canlı TEST kabulü DEĞİLDİR — normal aday → düzeltme → gönderim → İK kalıcı
 * okuma kabulü ayrı bir hattır ve bu testlerle karşılanmaz.
 */
test.describe('ats#966 resume import sertleştirme (sentetik, gerçek tarayıcı)', () => {
  const gotoApply = async (page: Page, baseURL: string | undefined) => {
    await page.goto(`${baseURL ?? 'http://127.0.0.1:3000'}/careers/acik/jobs/${JOB.slug}/apply`, {
      waitUntil: 'domcontentloaded',
    });
  };

  const importEightFields = async (page: Page) => {
    await page.getByLabel(/CV içe aktarma aydınlatmasını okudum/i).check();
    await page.getByTestId('candidate-resume').setInputFiles({
      name: 'ornek-cv.pdf',
      mimeType: 'application/pdf',
      buffer: buildSyntheticResumePdf(),
    });
    await expect(page.getByTestId('candidate-resume-review')).toBeVisible();
    await page.getByRole('button', { name: 'Güvenli önerileri kabul et' }).click();
    await expect(
      page.getByRole('button', { name: /Seçtiğim alanları forma aktar \(8\)/ }),
    ).toBeEnabled();
  };

  test('gecikmeli confirm sırasında adayın yazdığı gerçek tarayıcıda korunur', async ({
    page,
    baseURL,
  }) => {
    await installAtsApi(page);
    // Confirm yanıtını BİLEREK geciktir: aday bu sürede yazmaya devam edecek.
    await page.route('**/candidate/resume-imports/*/confirm', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fallback();
    });

    await gotoApply(page, baseURL);
    await importEightFields(page);

    await page.getByRole('button', { name: /Seçtiğim alanları forma aktar/ }).click();
    // İstek uçuşta; aday telefonunu yazıyor.
    await page.getByTestId('candidate-phone').fill('0555 111 22 33');

    // Aktarımın tamamlandığını bekle. NOT: bu sayı ayırt edici DEĞİLDİR — ölçtüm,
    // kusurlu sürümde de 7 yazıyor. Yalnızca akışın bittiğini işaretler.
    await expect(page.getByTestId('candidate-resume-meta')).toContainText('7 alan forma aktarıldı');

    /*
     * ASIL REGRESYON SİNYALİ BURASI (negatif doğrulama ile ölçüldü).
     *
     * Kaynakta `valuesRef.current` yerine bayat `values` kapanışı kullanılacak şekilde
     * geçici geri alma yaptım ve bu testi koşturdum: telefon alanı `""` olarak geldi,
     * yani adayın uçuşta yazdığı numara siliniyor. Ref'i geri koyunca yeşil.
     *
     * Dolayısıyla bu satır sinyali gerçekten taşıyor; sayı satırı taşımıyor.
     */
    await expect(page.getByTestId('candidate-phone')).toHaveValue('0555 111 22 33');
  });

  test('aynı dosyanın retry yüklemesi aynı idempotency anahtarını kullanır', async ({
    page,
    baseURL,
  }) => {
    await installAtsApi(page);

    const uploadKeys: string[] = [];
    let firstAttempt = true;
    await page.route('**/candidate/resume-imports/*/document', async (route) => {
      uploadKeys.push(route.request().headers()['x-ats-idempotency-key'] ?? '');
      if (firstAttempt) {
        firstAttempt = false;
        // Belirsiz hata: istek sunucuya ULAŞMIŞ olabilir.
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
        return;
      }
      await route.fallback();
    });

    await gotoApply(page, baseURL);
    await page.getByLabel(/CV içe aktarma aydınlatmasını okudum/i).check();

    const pdf = {
      name: 'ornek-cv.pdf',
      mimeType: 'application/pdf',
      buffer: buildSyntheticResumePdf(),
    };
    await page.getByTestId('candidate-resume').setInputFiles(pdf);
    await expect.poll(() => uploadKeys.length).toBe(1);

    // Aday AYNI dosyayı yeniden seçiyor: yeni niyet değil, aynı isteğin tekrarı.
    await page.getByTestId('candidate-resume').setInputFiles(pdf);
    await expect.poll(() => uploadKeys.length).toBe(2);

    expect(uploadKeys[0]).not.toBe('');
    expect(uploadKeys[1]).toBe(uploadKeys[0]);
  });
});
