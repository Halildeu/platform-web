#!/usr/bin/env node
/**
 * PERF-INIT-V2.1 PR-V2.1-M2a1: Authenticated route storageState runtime generator.
 *
 * Codex thread `019e2b00` round 4 RED → REVISE absorb:
 * - Direct grant + multi-key localStorage WRONG (frontend doesn't read those keys)
 * - Repo canonical keys: `token`, `user`, `tokenExpiresAt` (auth.slice.ts loadPersistedAuth)
 * - Use Playwright standardFlow browser login → app self-populates correct localStorage
 *
 * Pattern (Codex round 4 spesifik öneri):
 *   1. Chromium launch (headless)
 *   2. Navigate to `${APP_ORIGIN}/login`
 *   3. Click corporate-login-button → Keycloak SSO redirect
 *   4. On Keycloak login page: fill username + password, submit
 *   5. Redirect back to app, wait for auth-ready (transportReady phase or
 *      protected route render)
 *   6. context.storageState({ path }) → save (cookies + canonical localStorage)
 *   7. Stdout meta-only (no token literal, no credential material)
 *
 * This produces storageState matching what the app's own auth bootstrap
 * creates, so all canonical keys (`token`, `user`, `tokenExpiresAt`,
 * `serban.shell.authState`, etc.) are correctly populated.
 *
 * Env (required):
 *   PERF_AUTH_USERNAME       — default "perf-test"
 *   PERF_AUTH_PASSWORD       — required (GHA secret PERF_AUTH_PASSWORD)
 *   PERF_AUTH_APP_ORIGIN     — default https://testai.acik.com
 *   PERF_AUTH_OUTPUT         — default tests/perf/.auth-storage.json (gitignored)
 *   PERF_AUTH_TIMEOUT_MS     — default 60000 (login + redirect + auth-ready)
 *
 * Audit trail (no credential material in output):
 *   - "auth_setup: username=<USER> app_origin=<ORIGIN> login_button_clicked=true keycloak_form_filled=true callback_received=true auth_ready=true storage_written=true keys=<N>"
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const USERNAME = process.env.PERF_AUTH_USERNAME ?? 'perf-test';
const PASSWORD = process.env.PERF_AUTH_PASSWORD;
const APP_ORIGIN = process.env.PERF_AUTH_APP_ORIGIN ?? 'https://testai.acik.com';
const OUTPUT_PATH = process.env.PERF_AUTH_OUTPUT ?? 'tests/perf/.auth-storage.json';
const TIMEOUT_MS = Number(process.env.PERF_AUTH_TIMEOUT_MS ?? 60000);

function die(msg, exitCode = 1) {
  console.error(`[auth-storage-setup] FATAL: ${msg}`);
  process.exit(exitCode);
}

if (!PASSWORD) {
  die(
    'PERF_AUTH_PASSWORD env not set. Inject test persona password (NOT user login password) ' +
      'via GHA secret PERF_AUTH_PASSWORD or local override.',
  );
}

async function performStandardFlowLogin() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  let loginButtonClicked = false;
  let keycloakFormFilled = false;
  let callbackReceived = false;
  let authReady = false;

  try {
    // Step 1: Navigate to /login (waitUntil 'domcontentloaded' — 'load' too
    // strict; SPA bundles may have long-tail XHR/WebSocket that never settles
    // within 60s on GHA cold runners, even when DOM is interactive)
    await page.goto(`${APP_ORIGIN}/login`, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUT_MS,
    });

    // Step 2: Wait for corporate-login-button to be visible + click
    // (separate selector wait covers React hydration delay after DOMContentLoaded)
    await page.waitForSelector('[data-testid="corporate-login-button"]', {
      state: 'visible',
      timeout: 30000,
    });
    await page.click('[data-testid="corporate-login-button"]');
    loginButtonClicked = true;

    // Step 3: Wait for Keycloak login page (URL contains /realms/<realm>/protocol/openid-connect/auth or /login-actions)
    await page.waitForURL(
      (url) => url.pathname.includes('/realms/') || url.pathname.includes('/login-actions/'),
      { timeout: TIMEOUT_MS },
    );

    // Step 4: Fill Keycloak login form. Keycloak default form has:
    //   input#username, input#password, input[type="submit"] or button#kc-login
    await page.waitForSelector('input#username, input[name="username"]', {
      state: 'visible',
      timeout: 10000,
    });
    await page.fill('input#username, input[name="username"]', USERNAME);
    await page.fill('input#password, input[name="password"]', PASSWORD);
    keycloakFormFilled = true;

    // Step 5: Submit (button#kc-login or input[type=submit])
    await Promise.all([
      page.waitForURL((url) => url.origin === APP_ORIGIN, { timeout: TIMEOUT_MS }),
      page.click('button#kc-login, input[type="submit"][name="login"], input[type="submit"]'),
    ]);
    callbackReceived = true;

    // Step 6: Wait for app auth-ready. Multiple signals possible:
    //   - localStorage `token` populated (loadPersistedAuth wrote it)
    //   - URL on a protected route (not /login)
    //   - data-testid or selector indicating app shell loaded
    await page.waitForFunction(
      () => {
        try {
          const token = window.localStorage.getItem('token');
          const user = window.localStorage.getItem('user');
          return Boolean(token && user);
        } catch {
          return false;
        }
      },
      { timeout: TIMEOUT_MS, polling: 250 },
    );
    authReady = true;

    // Step 7: Save storageState (canonical app-populated localStorage + cookies)
    const outPath = resolve(process.cwd(), OUTPUT_PATH);
    mkdirSync(dirname(outPath), { recursive: true });
    await context.storageState({ path: outPath });

    // Audit log (NO credential material)
    const raw = readFileSync(outPath, 'utf8');
    const storage = JSON.parse(raw);
    const localStorageCount = storage.origins[0]?.localStorage?.length ?? 0;
    const cookieCount = storage.cookies?.length ?? 0;
    const localStorageKeys = storage.origins[0]?.localStorage?.map((e) => e.name) ?? [];
    console.log(
      `[auth-storage-setup] auth_setup: username=${USERNAME} app_origin=${APP_ORIGIN} ` +
        `login_button_clicked=${loginButtonClicked} keycloak_form_filled=${keycloakFormFilled} ` +
        `callback_received=${callbackReceived} auth_ready=${authReady} ` +
        `storage_written=true cookies=${cookieCount} localStorage_keys_count=${localStorageCount}`,
    );

    // Sanity check: required canonical keys present
    const canonical = ['token', 'user', 'tokenExpiresAt'];
    const missing = canonical.filter((k) => !localStorageKeys.includes(k));
    if (missing.length > 0) {
      // tokenExpiresAt may be absent for some auth paths; token + user required
      const requiredMissing = missing.filter((k) => k === 'token' || k === 'user');
      if (requiredMissing.length > 0) {
        die(
          `storageState saved but canonical key(s) missing: ${requiredMissing.join(', ')}. ` +
            `Login flow likely failed silently. localStorage keys: ${localStorageKeys.join(', ')}`,
        );
      } else {
        console.warn(
          `[auth-storage-setup] warning: optional canonical key(s) missing: ${missing.join(', ')}. ` +
            `Required (token, user) present; continuing.`,
        );
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  try {
    await performStandardFlowLogin();
  } catch (e) {
    die(`standardFlow login failed: ${e.message ?? e}`);
  }

  const outPath = resolve(process.cwd(), OUTPUT_PATH);
  if (!existsSync(outPath)) {
    die(`storageState file not written at ${outPath}`);
  }
}

main();
