import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { authenticateAndNavigate } from './utils/auth';

const PUBLIC_REF = 'app_abcdefghijklmnopqrstuvwx';

const installRecruiterApi = async (page: Page) => {
  const application = {
    publicRef: PUBLIC_REF,
    jobSlug: 'urun-yoneticisi',
    jobTitle: 'Ürün Yöneticisi',
    fullName: 'Deniz Sentetik',
    email: 'deniz@example.test',
    phone: '+905550000000',
    city: 'İstanbul',
    linkedIn: null,
    portfolio: null,
    summary: 'Sentetik profesyonel özet',
    experience: 'Sentetik işle ilgili deneyim',
    education: 'Sentetik eğitim',
    skills: ['Ürün keşfi', 'Araştırma'],
    note: 'Sentetik aday notu',
    status: 'SUBMITTED',
    version: 0,
    createdAt: '2026-07-18T06:00:00Z',
    updatedAt: '2026-07-18T06:00:00Z',
  };
  const history = [
    {
      eventId: 1,
      fromStatus: null,
      toStatus: 'SUBMITTED',
      actorRef: 'candidate:self',
      occurredAt: application.createdAt,
    },
  ];
  const evaluations: Array<Record<string, unknown>> = [];
  const mutations: Array<{ method: string; path: string; body: unknown; idempotency?: string }> =
    [];

  await page.route('**/api/ats/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (request.method() === 'GET' && path.endsWith('/recruiter/jobs')) {
      await json([]);
      return;
    }
    if (request.method() === 'GET' && path.endsWith('/recruiter/applications')) {
      const {
        phone: _phone,
        linkedIn: _linkedIn,
        portfolio: _portfolio,
        summary: _summary,
        experience: _experience,
        education: _education,
        note: _note,
        ...summary
      } = application;
      await json({ items: [summary], page: 0, size: 50, total: 1 });
      return;
    }
    if (request.method() === 'GET' && path.endsWith(`/recruiter/applications/${PUBLIC_REF}`)) {
      await json({ application, history, evaluations });
      return;
    }
    if (
      request.method() === 'PUT' &&
      path.endsWith(`/recruiter/applications/${PUBLIC_REF}/status`)
    ) {
      const body = request.postDataJSON() as { expectedVersion: number; toStatus: string };
      mutations.push({ method: request.method(), path, body });
      if (body.expectedVersion !== application.version) {
        await json({ error: 'VERSION_CONFLICT' }, 409);
        return;
      }
      application.status = body.toStatus;
      application.version += 1;
      application.updatedAt = '2026-07-18T07:00:00Z';
      history.push({
        eventId: history.length + 1,
        fromStatus: history.at(-1)?.toStatus ?? null,
        toStatus: body.toStatus,
        actorRef: 'user:synthetic-recruiter',
        occurredAt: application.updatedAt,
      });
      await json(application);
      return;
    }
    if (
      request.method() === 'POST' &&
      path.endsWith(`/recruiter/applications/${PUBLIC_REF}/evaluations`)
    ) {
      const body = request.postDataJSON() as Record<string, unknown>;
      const idempotency = request.headers()['x-ats-idempotency-key'];
      mutations.push({ method: request.method(), path, body, idempotency });
      const evaluation = {
        ...body,
        evaluationId: 'eval_abcdefghijklmnopqrstuvwx',
        actorRef: 'user:synthetic-recruiter',
        predecessorEvaluationId: null,
        revision: 1,
        createdAt: '2026-07-18T06:30:00Z',
      };
      evaluations.push(evaluation);
      await json(evaluation, 201);
      return;
    }
    await json({}, 404);
  });

  return { application, mutations };
};

test.describe('Faz 25 recruiter pipeline', () => {
  test('loads PII only in authorized detail, records a human scorecard and advances separately at 390px', async ({
    page,
    baseURL,
  }) => {
    const api = await installRecruiterApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await authenticateAndNavigate(page, baseURL, '/admin/ats/recruiter', [
      'ATS',
      'ATS_APPLICATION_MANAGE',
      'ATS_JOB_MANAGE',
    ]);

    await expect(page.getByTestId('recruiter-workspace-page')).toBeVisible();
    await expect(page.getByText('Deniz Sentetik')).toBeVisible();
    await expect(page.getByText('+905550000000')).toHaveCount(0);
    await page.getByRole('button', { name: 'Başvuruyu incele' }).click();

    await expect(page.getByText('+905550000000')).toBeVisible();
    await expect(page.getByText('Sentetik profesyonel özet')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Aday bilgileri ve insan kararı' }),
    ).toBeFocused();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);

    await page.getByRole('button', { name: 'İnsan incelemesini başlat' }).click();
    await expect(page.getByText('Durum güncellendi: İnsan incelemesinde.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mülakat planlamasına al' })).toBeDisabled();

    await page.getByRole('button', { name: 'Yapılandırılmış değerlendirme yap' }).click();
    for (const select of await page.getByLabel('Kanıt düzeyi (1–4)').all()) {
      await select.selectOption('3');
    }
    let evidenceIndex = 0;
    for (const evidence of await page.getByLabel('İşle ilgili somut kanıt').all()) {
      evidenceIndex += 1;
      await evidence.fill(`Sentetik işle ilgili gözlemlenebilir kanıt ${evidenceIndex}.`);
    }
    await page.getByLabel('Genel gerekçe').fill('Sentetik genel insan değerlendirmesi gerekçesi.');
    await page.getByLabel(/Değerlendirme yalnız ilandaki iş gereklilikleri/i).check();
    await page.getByRole('button', { name: 'Immutable değerlendirmeyi kaydet' }).click();

    await expect(page.getByText(/İnsan değerlendirmesi revizyon 1/i)).toBeVisible();
    await expect(page.getByText(/Revizyon 1 · Ek kanıt bekle/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mülakat planlamasına al' })).toBeEnabled();
    expect(api.application.status).toBe('UNDER_REVIEW');
    expect(api.mutations).toHaveLength(2);
    expect(api.mutations[1]).toMatchObject({
      method: 'POST',
      idempotency: expect.stringMatching(/^web-/u),
      body: {
        policyVersion: 'structured-evaluation-v1',
        jobRelatednessConfirmed: true,
        recommendation: 'HOLD',
      },
    });

    await page.getByRole('button', { name: 'Mülakat planlamasına al' }).click();
    await expect(page.getByText('Durum güncellendi: Mülakat planlaması bekliyor.')).toBeVisible();
    expect(api.application.status).toBe('INTERVIEW_PENDING');
    expect(api.mutations).toHaveLength(3);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('shows only candidate-safe history and performs an explicit terminal withdrawal', async ({
    page,
    baseURL,
  }) => {
    const candidateAccessToken = 'A'.repeat(43);
    const candidateStatus = {
      publicRef: PUBLIC_REF,
      jobSlug: 'urun-yoneticisi',
      jobTitle: 'Ürün Yöneticisi',
      status: 'UNDER_REVIEW',
      version: 1,
      createdAt: '2026-07-18T06:00:00Z',
      updatedAt: '2026-07-18T07:00:00Z',
      nextAction: 'WAIT_FOR_REVIEW',
      withdrawalAllowed: true,
      history: [
        { status: 'SUBMITTED', occurredAt: '2026-07-18T06:00:00Z' },
        { status: 'UNDER_REVIEW', occurredAt: '2026-07-18T07:00:00Z' },
      ],
    };
    const withdrawalRequests: Array<{ url: string; token?: string; body: string | null }> = [];
    await page.addInitScript(
      ({ publicRef, token }) => {
        window.sessionStorage.setItem(
          'ats.candidate.latest.v1',
          JSON.stringify({ publicRef, candidateAccessToken: token }),
        );
      },
      { publicRef: PUBLIC_REF, token: candidateAccessToken },
    );
    await page.route('**/api/ats/v1/candidate/applications/**', async (route) => {
      const request = route.request();
      if (request.method() === 'PUT' && request.url().endsWith('/withdraw')) {
        withdrawalRequests.push({
          url: request.url(),
          token: request.headers()['x-ats-candidate-access'],
          body: request.postData(),
        });
        candidateStatus.status = 'WITHDRAWN';
        candidateStatus.version = 2;
        candidateStatus.updatedAt = '2026-07-18T08:00:00Z';
        candidateStatus.nextAction = 'NONE';
        candidateStatus.withdrawalAllowed = false;
        candidateStatus.history.push({
          status: 'WITHDRAWN',
          occurredAt: candidateStatus.updatedAt,
        });
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(candidateStatus),
      });
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseURL ?? 'http://127.0.0.1:3000'}/candidate`, {
      waitUntil: 'networkidle',
    });
    await expect(page.getByTestId('candidate-portal-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Durum geçmişi' })).toBeVisible();
    await expect(page.getByText(/sizden bir işlem beklenmiyor/i)).toBeVisible();
    await expect(page.getByText(/reviewer|scorecard|rationale|actorRef/i)).toHaveCount(0);
    expect(page.url()).not.toContain(candidateAccessToken);

    await page.getByRole('button', { name: 'Geri çekme onayını aç' }).click();
    await expect(page.getByRole('button', { name: 'Başvuruyu geri çek' })).toBeDisabled();
    await page
      .getByLabel(/Başvurumu geri çekmek istediğimi ve işlemin geri alınamayacağını/i)
      .check();
    await page.getByRole('button', { name: 'Başvuruyu geri çek' }).click();

    await expect(page.getByRole('status')).toContainText('Başvurunuz geri çekildi');
    await expect(
      page.getByRole('heading', { name: 'Başvuru geri çekildi', level: 3 }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Geri çekme onayını aç' })).toHaveCount(0);
    expect(withdrawalRequests).toEqual([
      {
        url: expect.not.stringContaining(candidateAccessToken),
        token: candidateAccessToken,
        body: null,
      },
    ]);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
  });
});
