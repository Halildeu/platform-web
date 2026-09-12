import { expect, test } from '@playwright/test';

// Standalone synthetic contract/UI regression, not normal-persona TEST acceptance.
for (const width of [320, 390, 1280]) {
  test(`session selection, source and reopen at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/src/index.tsx', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `import { configureShellServices } from '/src/shell-services.ts';
        configureShellServices({
          auth: {ready: async () => ({ok:true}), getToken: () => null, getEpoch: () => 1},
          http: {get: async (url) => {
            const response = await fetch(url);
            const data = await response.json();
            if (!response.ok) throw {response:{status:response.status,data}};
            return {data};
          }}
        });
        import('/src/bootstrap.tsx');`,
      }),
    );
    await page.route('**/v1/admin/**', async (route) => {
      const url = new URL(route.request().url());
      const selected = url.searchParams.get('sessionId') ?? 'new';
      const text = selected === 'old' ? 'Eski oturum sonucu.' : 'Yeni oturum sonucu.';
      let data: unknown = { content: [], last: true };
      if (url.pathname.endsWith('/meetings')) {
        data = {
          content: [
            {
              id: 'session-ui',
              title: 'Oturumlar',
              status: 'COMPLETED',
              createdAt: '2026-09-12T07:00:00Z',
            },
          ],
        };
      } else if (url.pathname.endsWith('/intelligence/result')) {
        data = {
          analysisRunId: `run-${selected}`,
          meetingId: 'session-ui',
          sessionId: selected,
          schema_version: '5-adr0043',
          summary: text,
          summary_grounding_status: 'verified',
          summary_citations: [
            {
              claim: text,
              source_index: 0,
              source_text: text,
              similarity: 1,
              grounded: true,
              status: 'PASSED',
              reason: '',
              start_sec: 0,
              source_char_start: 0,
              source_char_end: text.length,
            },
          ],
          decisions: [],
          action_items: [],
          citations: [],
          rejected_claims: [],
          ungrounded_count: 0,
          redacted: false,
          redaction_count: 0,
          generatedAt: '2026-09-12T07:00:00Z',
          persisted: true,
          storageMode: 'canonical',
        };
      } else if (url.pathname.endsWith('/sessions')) {
        data = [
          { id: 'old', startedAt: '2026-09-11T07:00:00Z' },
          { id: 'new', startedAt: '2026-09-12T07:00:00Z' },
        ];
      } else if (url.pathname.endsWith('/transcripts')) {
        data = {
          content: [
            {
              id: `segment-${selected}`,
              textFinal: text,
              status: 'FINALIZED',
              startTime: 0,
              speakerId: 'Konusmaci',
            },
          ],
          totalElements: 1,
          size: 200,
        };
      }
      await route.fulfill({ json: data });
    });
    await page.goto('/?meetingId=session-ui');
    const selector = page.getByLabel('Analiz oturumu');
    await expect(selector.locator('option')).toHaveCount(3);
    await selector.selectOption('old');
    await expect(page).toHaveURL(/sessionId=old/);
    const detail = page.getByLabel('Seçili toplantı');
    await expect(detail).toContainText('Eski oturum sonucu.');
    await expect(detail).not.toContainText('Yeni oturum sonucu.');
    await detail.getByRole('link', { name: /00:00/ }).first().click();
    await expect(page).toHaveURL(/#segment-segment-old/);
    await page.reload();
    await expect(selector).toHaveValue('old');
    await expect(detail).toContainText('Eski oturum sonucu.');
    const box = await selector.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`session-${width}.png`), fullPage: true });
    await selector.selectOption('new');
    await expect(detail).toContainText('Yeni oturum sonucu.');
    await page.goBack();
    await expect(selector).toHaveValue('old');
    await expect(detail).toContainText('Eski oturum sonucu.');
  });
}
