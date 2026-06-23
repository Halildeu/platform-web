import type { Page } from '@playwright/test';

/**
 * Phase 2 PR-E2E-6 — auth transport contract test harness helpers.
 *
 * <p>Pairs with the {@code VITE_AUTH_CONTRACT_E2E=1} probe surface
 * (see {@code apps/mfe-shell/src/app/observability/auth-contract-e2e-probe.ts}).
 * The frontend bundle, when built with that env, exposes:
 * <ul>
 *   <li>{@code window.__authContractProbe.http} — the singleton api</li>
 *   <li>{@code window.__authContractProbe.store} — the Redux store</li>
 *   <li>{@code window.__authContractProbe.metrics} — observability helpers</li>
 *   <li>{@code window.__authContractMockToken} — mock JWT slot the
 *       AuthBootstrapper reads to skip {@code keycloak.init()}</li>
 * </ul>
 */

export interface RequestProbe {
  url: string;
  method: string;
  phaseAtFire: string;
  initiator: 'fetch' | 'xhr';
}

/**
 * Build a minimal but structurally valid JWT for the mock-Keycloak
 * bypass. Header + payload + signature are base64url-encoded; the
 * signature is "test-signature" (not validated server-side because
 * the gateway endpoints are themselves mocked via Playwright route()).
 */
export const buildMockJwt = (overrides: Record<string, unknown> = {}): string => {
  const header = { alg: 'HS256', typ: 'JWT', kid: 'mock-kid' };
  const payload = {
    sub: 'mock-user-id',
    preferred_username: 'mock@example.com',
    email: 'mock@example.com',
    realm_access: { roles: ['user'] },
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    iss: 'https://mock-keycloak.test/realms/platform-test',
    aud: 'mfe-shell',
    ...overrides,
  };
  const b64 = (obj: unknown): string =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${b64(header)}.${b64(payload)}.test-signature`;
};

/**
 * Install a fetch + XHR request probe that records the live FSM phase
 * at the moment each request actually fires. The recorder runs in the
 * page context and accumulates entries on
 * {@code window.__authProbeRequestLog}, which the test reads via
 * {@code page.evaluate}.
 *
 * <p>Both fetch and XHR are wrapped because Axios in browser uses XHR
 * by default — wrapping only fetch would miss every protected request
 * that goes through {@code @mfe/shared-http} (Codex iter-1 P0 #2
 * absorb).
 */
export const installAuthTransportProbe = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    interface RequestProbeEntry {
      url: string;
      method: string;
      phaseAtFire: string;
      initiator: 'fetch' | 'xhr';
    }
    (window as unknown as { __authProbeRequestLog: RequestProbeEntry[] }).__authProbeRequestLog =
      [];

    const readPhase = (): string => {
      const probe = (
        window as unknown as {
          __authContractProbe?: { store?: { getState: () => { auth?: { phase?: string } } } };
        }
      ).__authContractProbe;
      const fallbackStore = (
        window as unknown as {
          __shellStore?: { getState: () => { auth?: { phase?: string } } };
        }
      ).__shellStore;
      const store = probe?.store ?? fallbackStore;
      try {
        return store?.getState()?.auth?.phase ?? 'no-store';
      } catch {
        return 'no-store-error';
      }
    };

    // Wrap window.fetch
    const origFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url;
      const method = (init?.method ?? 'GET').toUpperCase();
      (
        window as unknown as { __authProbeRequestLog: RequestProbeEntry[] }
      ).__authProbeRequestLog.push({
        url,
        method,
        phaseAtFire: readPhase(),
        initiator: 'fetch',
      });
      return origFetch(input as RequestInfo | URL, init);
    };

    // Wrap XHR (axios browser adapter uses XHR by default)
    const origXhrOpen = XMLHttpRequest.prototype.open;
    const origXhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function open(
      this: XMLHttpRequest & { __authProbeMethod?: string; __authProbeUrl?: string },
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      this.__authProbeMethod = method;
      this.__authProbeUrl = typeof url === 'string' ? url : url.href;
      return (origXhrOpen as unknown as (...args: unknown[]) => void).apply(this, [
        method,
        url,
        ...rest,
      ]);
    };
    XMLHttpRequest.prototype.send = function send(
      this: XMLHttpRequest & { __authProbeMethod?: string; __authProbeUrl?: string },
      body?: Document | XMLHttpRequestBodyInit | null,
    ) {
      (
        window as unknown as { __authProbeRequestLog: RequestProbeEntry[] }
      ).__authProbeRequestLog.push({
        url: this.__authProbeUrl ?? '<unknown>',
        method: (this.__authProbeMethod ?? 'GET').toUpperCase(),
        phaseAtFire: readPhase(),
        initiator: 'xhr',
      });
      return (origXhrSend as unknown as (body?: unknown) => void).apply(this, [body]);
    };
  });
};

/**
 * Plant the mock JWT before the AuthBootstrapper effect runs. Called
 * via {@code addInitScript} so it executes before any module code in
 * the page evaluates — well before React mounts.
 */
export const installMockKeycloakToken = async (page: Page, token: string): Promise<void> => {
  await page.addInitScript((mockToken: string) => {
    Object.defineProperty(window, '__authContractMockToken', {
      value: mockToken,
      writable: false,
      configurable: false,
    });
  }, token);
};

/**
 * Mock the bootstrap-chain endpoints so the FSM advances to
 * transportReady without hitting a real backend. {@code setTokenCookie}
 * → 204 (cookie write); {@code fetchAppPermissions} → minimal authz
 * snapshot with the requested allowed modules.
 */
export const mockBootstrapEndpoints = async (
  page: Page,
  options: { allowedModules?: string[]; superAdmin?: boolean } = {},
): Promise<void> => {
  const { allowedModules = ['USER_MANAGEMENT'], superAdmin = false } = options;

  await page.route('**/api/auth/cookie', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 204 });
    }
    if (route.request().method() === 'DELETE') {
      return route.fulfill({ status: 204 });
    }
    return route.continue();
  });

  await page.route('**/api/v1/authz/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        permissions: [],
        allowedModules,
        superAdmin,
      }),
    }),
  );

  // M365 first-login provision trigger (Codex 019ef311): the bootstrap fires
  // GET /api/v1/users/me/profile (ensureUserProvisioned). Stub it so the
  // bootstrap chain stays on the deterministic mock backend (no real-network
  // hit). The mock user is treated as already-active → 200 with a minimal
  // profile; a brand-new passive user would instead get 403 ACCOUNT_DISABLED,
  // which the helper swallows either way (it is fire-and-forget, non-fatal).
  await page.route('**/api/v1/users/me/profile', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 1,
        email: 'mock@example.com',
        name: 'Mock User',
        role: 'USER',
        enabled: true,
      }),
    }),
  );
};

/**
 * Wait for the auth FSM to reach {@code transportReady} (the terminal
 * green state).
 *
 * Default 25 s. The local-dev bootstrap chain settles in well under
 * 10 s, but CI cold-starts the entire MF host (Vite build + preview +
 * remote pre-bundling + api-gateway proxy + auth.cookie + authz.me)
 * and routinely exceeds the previous 10 s default — PR #310 (commit
 * 583f36e6) demoted the gate to advisory after three CI-stack rewire
 * attempts failed and 5 follow-up PRs (#338, #339, #342, #340, #341)
 * each saw the first test fail with `Timeout 15000ms exceeded` while
 * later tests in the serial describe block were skipped.
 *
 * The 25 s ceiling stays narrower than the 60 s per-test budget so a
 * genuine regression (FSM stuck before `transportReady`, store
 * wiring broken) still surfaces — it just stops drowning the PR
 * list in cold-runner timeouts.
 */
export const waitForTransportReady = async (page: Page, timeoutMs = 25_000): Promise<void> => {
  await page.waitForFunction(
    () => {
      const probe = (
        window as unknown as {
          __authContractProbe?: { store?: { getState: () => { auth?: { phase?: string } } } };
        }
      ).__authContractProbe;
      const fallback = (
        window as unknown as {
          __shellStore?: { getState: () => { auth?: { phase?: string } } };
        }
      ).__shellStore;
      const store = probe?.store ?? fallback;
      return store?.getState()?.auth?.phase === 'transportReady';
    },
    // Playwright signature is `waitForFunction(pageFunction, arg, options)`.
    // The probe takes no arg, so `{ timeout }` MUST be the 3rd parameter.
    // It used to be passed 2nd — silently becoming the page-function
    // ARGUMENT — so `waitForFunction` always fell back to the config
    // `actionTimeout` (15 s) and every `timeoutMs` value here (the
    // 10→15→25 s bumps across PR #310 + #338-#342) was dead code. That
    // is the real cause of the CI `Timeout 15000ms exceeded` failures.
    undefined,
    { timeout: timeoutMs },
  );
};

/**
 * Read the request log accumulated by the probe. Returns a typed copy
 * so the test can filter and assert without worrying about
 * cross-realm reference issues.
 */
export const readRequestLog = async (page: Page): Promise<RequestProbe[]> =>
  page.evaluate(() => {
    const log = (window as unknown as { __authProbeRequestLog?: RequestProbe[] })
      .__authProbeRequestLog;
    return log ? log.map((e) => ({ ...e })) : [];
  });

/**
 * Allowlist of URL patterns that are permitted to fire BEFORE the FSM
 * reaches {@code transportReady}. Includes:
 * - bootstrap-chain endpoints (cookie, authz, login, register)
 * - public endpoints that opt-out via __skipAuth
 * - silent-check-sso redirect target
 * - well-known OIDC metadata
 *
 * Anything else firing pre-transportReady is a contract violation.
 */
export const PRE_TRANSPORT_ALLOWLIST: ReadonlyArray<RegExp> = [
  /\/api\/auth\/cookie\b/,
  /\/api\/v1\/authz\/me\b/,
  // M365 first-login provision trigger (Codex 019ef311). ensureUserProvisioned
  // fires GET /api/v1/users/me/profile in the bootstrap chain (with
  // __skipAuthReadyGate) so the backend requireCurrentUser lazy-provisions a
  // first-login M365 user. It is a sanctioned bootstrap-chain request, same
  // class as /auth/cookie + /v1/authz/me.
  /\/api\/v1\/users\/me\/profile\b/,
  /\/api\/v1\/auth\/sessions\b/,
  /\/api\/users\/by-email\b/,
  /\/api\/users\/public\/register\b/,
  /\/api\/v1\/theme-registry\b/,
  /\/api\/manifest\b/,
  /\/api\/v1\/manifest\b/,
  /\/silent-check-sso\.html\b/,
  /\.well-known\b/,
];

export const isAllowedPreTransport = (url: string): boolean =>
  PRE_TRANSPORT_ALLOWLIST.some((re) => re.test(url));
