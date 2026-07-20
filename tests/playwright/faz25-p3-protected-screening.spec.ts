import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

const MFE_URL = 'http://127.0.0.1:3011/';
const INTERVIEW_ID = 'iv-screening-browser';
const TRANSCRIPT_KEY = 'transcript/screening-browser-v1';
const FINDING_SET_REF = `fsr_${'a'.repeat(64)}`;
const REQUEST_KEY = /^scrq_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const SEGMENTS = [
  {
    index: 0,
    speakerLabel: 'S1',
    startMs: 0,
    endMs: 1200,
    text: 'Tarayıcı fixture ham segment metni',
  },
];

const EVIDENCE = {
  findingSetRef: FINDING_SET_REF,
  runId: 'psr_00000000-0000-4000-8000-000000000001',
  policyRef: 'paspolicy_v1',
  coverage: 'SUPPORTED',
  disposition: 'REVIEW_REQUIRED',
  source: {
    kind: 'TRANSCRIPT_SEGMENT',
    canonicalSourceRef: TRANSCRIPT_KEY,
    segmentIndex: 0,
  },
  findings: [
    {
      category: 'AGE',
      signal: 'QUESTION_LIKE_PROTECTED_MENTION',
      sourceKind: 'TRANSCRIPT_SEGMENT',
      span: { startInclusive: 0, endExclusive: 3, segmentIndex: 0 },
    },
  ],
  evidenceId: 'screening-evidence-browser-v1',
  schemaVersion: 'screening_evidence_v1',
  occurredAt: '2026-07-15T10:00:00Z',
  spanUnit: 'UTF16_CODE_UNIT',
};

type ObservedRequest = {
  method: string;
  body: unknown;
  idempotencyKey: string;
};

async function fulfillJson(route: Route, body: unknown, status = 200, headers = {}) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers,
    body: JSON.stringify(body),
  });
}

async function installAtsFixture(page: Page, observed: ObservedRequest[]) {
  await page.route('**/api/ats/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname;

    if (method === 'GET' && path.endsWith(`/interviews/${INTERVIEW_ID}/transcripts`)) {
      await fulfillJson(route, [
        { transcriptKey: TRANSCRIPT_KEY, language: 'tr', segmentCount: SEGMENTS.length },
      ]);
      return;
    }
    if (method === 'GET' && path.endsWith(`/interviews/${INTERVIEW_ID}/transcript`)) {
      await fulfillJson(route, { interviewId: INTERVIEW_ID, language: 'tr', segments: SEGMENTS });
      return;
    }
    if (method === 'POST' && path.endsWith(`/interviews/${INTERVIEW_ID}/screenings`)) {
      observed.push({
        method,
        body: request.postDataJSON(),
        idempotencyKey: request.headers()['x-ats-idempotency-key'] ?? '',
      });
      await fulfillJson(route, EVIDENCE, 201, {
        'cache-control': 'no-store',
        'x-ats-replay': 'false',
      });
      return;
    }
    if (
      method === 'GET' &&
      path.endsWith(`/interviews/${INTERVIEW_ID}/screenings/${FINDING_SET_REF}`)
    ) {
      await fulfillJson(route, EVIDENCE, 200, { 'cache-control': 'no-store' });
      return;
    }

    await fulfillJson(route, { error: 'not_fixture_backed' }, 404);
  });
}

async function openScreening(page: Page, observed: ObservedRequest[] = []) {
  await installAtsFixture(page, observed);
  await page.goto(MFE_URL, { waitUntil: 'networkidle' });
  const panel = page.getByTestId('protected-screening-panel');
  await expect(panel).toBeVisible();
  return panel;
}

function blockingViolations(violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']) {
  return violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );
}

test.describe('Faz 25 P3 protected screening reviewer acceptance', () => {
  test('360/390/768/1440 widths do not overflow and keep split authority visible', async ({
    browser,
  }, testInfo) => {
    for (const width of [360, 390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const panel = await openScreening(page);

      await expect(panel).toContainText('Yazma yetkisi · ats.screening.write');
      await expect(panel).toContainText('Okuma yetkisi · ats.screening.read');
      await expect(panel).toContainText('Sonuç insan kararının yerine geçmez');

      const overflow = await page.evaluate(() => {
        const target = document.querySelector<HTMLElement>(
          '[data-testid="protected-screening-panel"]',
        );
        return {
          viewportWidth: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          panelClientWidth: target?.clientWidth ?? 0,
          panelScrollWidth: target?.scrollWidth ?? 0,
        };
      });
      expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth);
      expect(overflow.panelScrollWidth).toBeLessThanOrEqual(overflow.panelClientWidth);

      if (width === 390 || width === 1440) {
        const accessibility = await new AxeBuilder({ page })
          .include('[data-testid="protected-screening-panel"]')
          .analyze();
        expect(blockingViolations(accessibility.violations)).toEqual([]);
      }

      await testInfo.attach(`protected-screening-${width}px`, {
        body: await panel.screenshot(),
        contentType: 'image/png',
      });
      await context.close();
    }
  });

  test('keyboard create/read keeps pointer-only request and focuses verified evidence', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const observed: ObservedRequest[] = [];
    const panel = await openScreening(page, observed);

    const submit = page.getByTestId('screening-submit');
    await submit.focus();
    await page.keyboard.press('Enter');
    await expect(panel.getByRole('heading', { name: 'Tarama sonucu' })).toBeFocused();
    await expect(page.getByTestId('screening-result')).toContainText(
      'İnsan uyum incelemesi gerekli',
    );
    await expect(page.getByTestId('screening-result')).toContainText('Yeni kanıt');
    await expect(page.getByTestId('screening-result')).toContainText('UTF‑16 aralığı');
    await expect(page.getByTestId('screening-result')).toContainText(
      'bir aday kararı, puan, güven skoru veya işe al/ele önerisi değildir',
    );

    expect(observed).toHaveLength(1);
    expect(observed[0]?.body).toEqual({
      sourceKind: 'TRANSCRIPT_SEGMENT',
      transcriptKey: TRANSCRIPT_KEY,
      segmentIndex: 0,
    });
    expect(observed[0]?.idempotencyKey).toMatch(REQUEST_KEY);
    expect(JSON.stringify(observed[0]?.body)).not.toContain(SEGMENTS[0]?.text);

    const read = page.getByTestId('screening-read');
    await expect(page.getByTestId('screening-read-ref')).toHaveValue(FINDING_SET_REF);
    await read.focus();
    await page.keyboard.press('Enter');
    await expect(panel.getByRole('heading', { name: 'Kayıtlı tarama kanıtı' })).toBeFocused();
    await expect(panel.getByRole('button', { name: /işe al|reddet|ele/i })).toHaveCount(0);
  });
});
