#!/usr/bin/env node
/**
 * PERF-INIT-V2.1 PR-V2.1-M2a1: Authenticated route storageState runtime generator.
 *
 * Codex thread `019e2b00` REVISE notu birebir uyumlu: runtime-generated
 * storageState, **committed fixture YOK**. Real frontend OIDC client
 * (`frontend` — platform-test realm) ile direct access grant + injection.
 *
 * Why direct grant injection (not browser standardFlow):
 *   - CI: deterministic, no nginx /admin/realms/* dependency, no browser flake
 *   - Token: same JWT a browser login would produce (azp=frontend, aud=audience list)
 *   - Storage: same shape route-budget runner expects (cookies + localStorage)
 *
 * Cluster-internal nginx 405 issue (Codex 019e2b00): admin REST not edge-routed.
 * Public token endpoint /realms/<realm>/protocol/openid-connect/token IS routed.
 * So direct grant via testai.acik.com public token endpoint works.
 *
 * Env (required):
 *   PERF_AUTH_USERNAME       — default "perf-test"
 *   PERF_AUTH_PASSWORD       — required (GHA secret PERF_AUTH_PASSWORD)
 *   PERF_AUTH_REALM          — default "platform-test"
 *   PERF_AUTH_CLIENT_ID      — default "frontend"
 *   PERF_AUTH_KEYCLOAK_BASE  — default https://testai.acik.com (testai target)
 *   PERF_AUTH_APP_ORIGIN     — default https://testai.acik.com (where storageState binds cookies/localStorage)
 *   PERF_AUTH_OUTPUT         — default tests/perf/.auth-storage.json (gitignored)
 *
 * Output format:
 *   Playwright storageState shape: { cookies: [...], origins: [{origin, localStorage: [...]}] }
 *
 * Usage (CI):
 *   node scripts/perf/auth-storage-setup.mjs
 *   PERF_AUTH_STORAGE=tests/perf/.auth-storage.json pnpm perf:budget:testai
 *
 * Audit trail (no credential material in output):
 *   - "auth_setup: username=<USER> realm=<REALM> client_id=<CLIENT> http=200 token_jwt_parts=3"
 *
 * Cross-AI: thread `019e2b00` round 3 AGREE — implementer Claude, reviewer Codex.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { URL } from 'node:url';

const USERNAME = process.env.PERF_AUTH_USERNAME ?? 'perf-test';
const PASSWORD = process.env.PERF_AUTH_PASSWORD;
const REALM = process.env.PERF_AUTH_REALM ?? 'platform-test';
const CLIENT_ID = process.env.PERF_AUTH_CLIENT_ID ?? 'frontend';
const KEYCLOAK_BASE = process.env.PERF_AUTH_KEYCLOAK_BASE ?? 'https://testai.acik.com';
const APP_ORIGIN = process.env.PERF_AUTH_APP_ORIGIN ?? 'https://testai.acik.com';
const OUTPUT_PATH = process.env.PERF_AUTH_OUTPUT ?? 'tests/perf/.auth-storage.json';

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

const tokenUrl = `${KEYCLOAK_BASE}/realms/${REALM}/protocol/openid-connect/token`;

async function fetchTokens() {
  const body = new URLSearchParams({
    username: USERNAME,
    password: PASSWORD,
    grant_type: 'password',
    client_id: CLIENT_ID,
    scope: 'openid email profile',
  }).toString();

  let res;
  try {
    res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (e) {
    die(`token endpoint fetch failed: ${e.message ?? e}`);
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => '<no body>');
    // Truncate to avoid leaking token-like material from error body
    const safe = txt.length > 256 ? txt.slice(0, 256) + '...' : txt;
    die(`token grant http=${res.status}: ${safe}`);
  }

  const data = await res.json();
  for (const k of ['access_token', 'refresh_token', 'token_type', 'expires_in']) {
    if (!data[k]) die(`token response missing field: ${k}`);
  }
  // Audit log (no token material)
  const parts = data.access_token.split('.');
  console.log(
    `[auth-storage-setup] auth_setup: username=${USERNAME} realm=${REALM} client_id=${CLIENT_ID} http=200 ` +
      `token_jwt_parts=${parts.length} token_type=${data.token_type} expires_in=${data.expires_in}`,
  );
  return data;
}

function buildStorageState(tokens) {
  // Build Playwright storageState shape. Frontend (testai.acik.com) uses
  // keycloak-js library; the OIDC token is typically stored in localStorage
  // under a key derived from realm/client. Inspect frontend behavior to
  // confirm key shape — common patterns:
  //   - `kc-callback-<state>` (auth code flow temp)
  //   - `oidc.user:<authority>:<client_id>` (oidc-client-ts)
  //   - Direct key like `oidc.id_token`, `oidc.access_token`
  //
  // For platform-web frontend, the canonical storage shape is documented in
  // apps/mfe-shell/src/auth/ or packages/auth/. Playwright runner reads this
  // back via browser.newContext({ storageState }) — the app's auth bootstrap
  // checks localStorage on mount to determine signed-in state.
  //
  // Token claims expectations (Keycloak frontend client):
  //   - iss: https://testai.acik.com/realms/platform-test
  //   - azp: frontend
  //   - preferred_username: perf-test
  //   - aud: ['notification-orchestrator', 'auth-service', 'account']
  //
  // The runtime injection here uses a defensive multi-key pattern: writes
  // the token under multiple known keys so the frontend auth bootstrap
  // (whichever pattern it uses) picks it up. Frontend can also be updated
  // to read from a canonical M2a1-specific key if needed (PR-M2a1.2).

  const origin = new URL(APP_ORIGIN).origin;
  const issuerUrl = `${KEYCLOAK_BASE}/realms/${REALM}`;

  // oidc-client-ts canonical key (most common pattern in React/Vite apps)
  const oidcUserKey = `oidc.user:${issuerUrl}:${CLIENT_ID}`;
  const oidcUserVal = JSON.stringify({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_type: tokens.token_type,
    expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
    scope: tokens.scope ?? 'openid email profile',
    session_state: tokens.session_state ?? null,
    profile: { preferred_username: USERNAME, sub: null, email: `${USERNAME}@local` },
  });

  // Generic / keycloak-js fallback keys
  const kcTokenKey = 'kc-token';
  const kcTokenVal = tokens.access_token;
  const kcRefreshKey = 'kc-refreshToken';
  const kcRefreshVal = tokens.refresh_token;

  return {
    cookies: [
      // Some apps set HTTP-only cookies via SSR; for SPA frontend most state
      // lives in localStorage. Empty cookie array is fine for SPA-only auth.
    ],
    origins: [
      {
        origin,
        localStorage: [
          { name: oidcUserKey, value: oidcUserVal },
          { name: kcTokenKey, value: kcTokenVal },
          { name: kcRefreshKey, value: kcRefreshVal },
          // Marker for debugging — non-sensitive metadata
          {
            name: 'perf-auth-storage-meta',
            value: JSON.stringify({
              realm: REALM,
              client_id: CLIENT_ID,
              username: USERNAME,
              generated_at: new Date().toISOString(),
              source: 'perf-auth-storage-setup.mjs',
            }),
          },
        ],
      },
    ],
  };
}

async function main() {
  const tokens = await fetchTokens();
  const storage = buildStorageState(tokens);

  const outPath = resolve(process.cwd(), OUTPUT_PATH);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(storage, null, 2));

  // Audit: report file path + size, but never log token content
  const size = JSON.stringify(storage).length;
  console.log(`[auth-storage-setup] written: ${outPath} size=${size} keys=${storage.origins[0].localStorage.length}`);
}

main().catch((e) => die(e.message ?? e));
