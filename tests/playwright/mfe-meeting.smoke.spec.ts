/**
 * Faz 24 M6 — mfe-meeting web smoke.
 *
 * Board coverage: platform-ai#57 "Browser smoke acceptance end-to-end
 * (mobile + web)". The mobile side ships in platform-mobile#14 as
 * Maestro + Detox scaffold; this file adds the web side.
 *
 * Scope kept intentionally narrow: authenticate → land on the meeting
 * list route → assert the mfe-meeting remote actually mounted (not
 * just the shell auth guard letting us through). Deep flow coverage
 * (create meeting → recorder link → transcript → live analysis panel)
 * belongs in follow-up specs once the desktop-web bridge lands.
 *
 * `meetingEnabled` guard in `AppRouter.tsx` gates the remote — if the
 * flag is off the test still hits the shell but `/admin/meetings` shows
 * a "not-available" fallback. Both branches are asserted here so a
 * remote-toggle mistake in an overlay does not silently pass smoke.
 */

import { test, expect } from '@playwright/test';

import { authenticateAndNavigate } from './utils/auth';

test.describe('mfe-meeting web smoke (Faz 24 M6)', () => {
  test('redirects to login when no token', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/admin/meetings`, { waitUntil: 'domcontentloaded' });
    // Shell auth guard renders the same login CTA everywhere.
    await expect(page.getByText('Giriş Yap').first()).toBeVisible({ timeout: 15000 });
  });

  test('mounts the meeting list when the remote is enabled', async ({ page, baseURL }) => {
    // The permission scope matches the meetings module — a fresh Keycloak
    // realm run may need this added to the test user's roles. When missing
    // the shell renders the 403 view, which we treat as a fail here so a
    // role drift surfaces.
    await authenticateAndNavigate(page, baseURL, '/admin/meetings', ['VIEW_MEETINGS']);
    await page.waitForURL('**/admin/meetings**', { timeout: 30000 });

    // Two acceptable landing states:
    //  (a) remote mounted → `[data-mfe="meeting"]` or a screen heading
    //  (b) remote disabled in this overlay → the shell fallback banner
    // Either is a legitimate build; the assertion catches the *third*
    // case (auth guard letting us through to a blank page — silent break).
    const remoteMount = page.locator('[data-mfe="meeting"], [data-testid="meeting-list-page"]');
    const disabledFallback = page.getByText(/meeting.*(devre dışı|not available)/i);
    await expect(remoteMount.or(disabledFallback).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('console does not emit a bundle-load error for the meeting remote', async ({
    page,
    baseURL,
  }) => {
    // Guard against a hidden 404 on the remote bundle URL — that would let
    // the shell render its own frame while the meeting UI silently no-ops.
    const bundleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (/remoteEntry|mfe-meeting|Loading.*chunk.*failed/i.test(text)) {
        bundleErrors.push(text);
      }
    });

    await authenticateAndNavigate(page, baseURL, '/admin/meetings', ['VIEW_MEETINGS']);
    await page.waitForURL('**/admin/meetings**', { timeout: 30000 });
    // Give the remote a beat to finish loading before we sample the log.
    await page.waitForTimeout(2000);

    expect(
      bundleErrors,
      `unexpected mfe-meeting bundle errors:\n${bundleErrors.join('\n')}`,
    ).toHaveLength(0);
  });
});
