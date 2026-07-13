import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const MFE_URL = 'http://127.0.0.1:3011/';

async function openAgenticPanel(page: Page) {
  await page.goto(MFE_URL, { waitUntil: 'networkidle' });
  const capability = page.getByTestId('intelligence-capability-AGENTIC_WORKFLOW');
  await expect(capability).toBeVisible();
  await capability.focus();
  await page.keyboard.press('Enter');
  const panel = page.getByTestId('governed-agentic-proposal-panel');
  await expect(panel).toBeVisible();
  return panel;
}

test.describe('P6.5 governed agentic proposal browser acceptance', () => {
  test('desktop approval ceiling, keyboard detail and no execution controls', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const panel = await openAgenticPanel(page);

    await expect(panel).toContainText('HUMAN APPROVAL CEILING');
    await expect(panel).toContainText('UMBRELLA CAPABILITY KAPALI');
    await expect(page.getByTestId('agentic-surface-status')).toContainText(
      'EXACT RECEIPT BINDINGS CONSISTENT',
    );
    await expect(page.getByTestId('agentic-surface-status')).toContainText(
      'PROPOSAL / EVENT REPLAY YOK',
    );
    await expect(page.getByTestId('p6-apply-button')).toHaveCount(0);
    await expect(page.getByTestId('agentic-approve-button')).toBeDisabled();
    await expect(
      panel.getByRole('button', { name: 'Öneriyi reddet · proposal only' }),
    ).toBeDisabled();
    await expect(panel.getByRole('button', { name: 'Adayı reddet' })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Adayları sırala' })).toHaveCount(0);

    for (const forbiddenName of [
      /^çalıştır$/i,
      /^gönder$/i,
      /^uygula$/i,
      /^workflow.*değiştir/i,
      /^toplu onay/i,
    ]) {
      await expect(panel.getByRole('button', { name: forbiddenName })).toHaveCount(0);
    }

    const approved = panel.getByRole('button', { name: /Aday iletişim taslağı/ });
    await approved.focus();
    await page.keyboard.press('Enter');
    await expect(approved).toHaveAttribute('aria-pressed', 'true');
    const detail = page.getByTestId('agentic-proposal-detail');
    await expect(detail).toBeFocused();
    await expect(page.getByTestId('agentic-approval-receipt')).toContainText(
      'APPROVED_FOR_ACTION · ÇALIŞTIRILMADI',
    );
    await expect(page.getByTestId('agentic-approval-receipt')).toContainText(
      'EXECUTION AUTHORITY · NONE',
    );
    await expect(page.getByTestId('agentic-external-observations')).toContainText(
      'Approval olsa bile execution otomatik varsayılmaz',
    );
    await expect(page.getByTestId('agentic-closed-gates')).toContainText('EVIDENCE · NOT_MET');
    await expect(page.getByTestId('agentic-closed-gates')).toContainText('LEGAL · NOT_MET');
    await expect(page.getByTestId('agentic-closed-gates')).toContainText('OWNER · NOT_MET');
    await expect(page.getByTestId('agentic-closed-gates')).toContainText('PRODUCTION · FALSE');

    const accessibility = await new AxeBuilder({ page })
      .include('[data-testid="governed-agentic-proposal-panel"]')
      .analyze();
    expect(
      accessibility.violations.filter(
        (violation) => violation.impact === 'critical' || violation.impact === 'serious',
      ),
    ).toEqual([]);

    await testInfo.attach('p6-governed-agentic-desktop', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });

  test('390px exact refs wrap and external observations stay non-authoritative', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const panel = await openAgenticPanel(page);

    await panel.getByRole('button', { name: /Dış icra ve rollback gözlem örneği/ }).click();
    await expect(page.getByTestId('agentic-external-observations')).toContainText(
      'EXTERNAL_EXECUTION_RECORDED',
    );
    await expect(page.getByTestId('agentic-external-observations')).toContainText(
      'EXTERNAL_ROLLBACK_ATTESTED',
    );
    await expect(page.getByTestId('agentic-external-observations')).toContainText(
      'CONTRACT EXECUTION · FALSE',
    );
    await expect(page.getByTestId('agentic-external-observations')).toContainText(
      'PROPOSAL REACTIVATED · FALSE',
    );
    await expect(page.getByTestId('agentic-closed-gates')).toContainText('EVIDENCE · NOT_MET');
    await expect(page.getByTestId('agentic-closed-gates')).toContainText('LEGAL · NOT_MET');
    await expect(page.getByTestId('agentic-closed-gates')).toContainText('OWNER · NOT_MET');
    await expect(page.getByTestId('agentic-closed-gates')).toContainText('PRODUCTION · FALSE');

    const overflow = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      panelClientWidth: document.querySelector<HTMLElement>(
        '[data-testid="governed-agentic-proposal-panel"]',
      )?.clientWidth,
      panelScrollWidth: document.querySelector<HTMLElement>(
        '[data-testid="governed-agentic-proposal-panel"]',
      )?.scrollWidth,
    }));
    expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth);
    expect(overflow.panelScrollWidth).toBeLessThanOrEqual(overflow.panelClientWidth ?? 0);

    const accessibility = await new AxeBuilder({ page })
      .include('[data-testid="governed-agentic-proposal-panel"]')
      .analyze();
    expect(
      accessibility.violations.filter(
        (violation) => violation.impact === 'critical' || violation.impact === 'serious',
      ),
    ).toEqual([]);

    await testInfo.attach('p6-governed-agentic-390px', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });
});
