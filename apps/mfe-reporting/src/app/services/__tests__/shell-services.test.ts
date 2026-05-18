import { describe, expect, it, vi } from 'vitest';

/*
 * @mfe/shared-http is mocked so importing shell-services.ts (which runs
 * `api.interceptors.request.use(...)` at module load) does not pull the
 * real axios instance into the test. The partial-merge guard under test
 * never exercises the fallback http, so a no-op interceptor registrar
 * is enough.
 */
vi.mock('@mfe/shared-http', () => ({
  api: { interceptors: { request: { use: () => undefined } } },
}));

import { configureShellServices, getShellServices } from '../shell-services';

/*
 * Codex thread 019e3ab8 — configureShellServices partial-merge guard.
 *
 * configureShellServices is called more than once per session: the
 * shell wires the full set ({ http, auth, ... }) at route load, then
 * ReportingProviders re-configures with the canonical
 * `mfe_shell/services` object — which carries NO `http`. A plain
 * overwrite resolved the absent `http` to the fallback axios copy (only
 * a synchronous window.__keycloak interceptor), silently downgrading
 * the shell-wired client and re-introducing the dynamic-report `/data`
 * 401 auth-race. The merge must preserve an already-wired field across
 * a later incomplete configure call.
 */
describe('configureShellServices — partial merge (Codex 019e3ab8)', () => {
  const shellHttp = { __id: 'shell-http' } as never;
  const shellAuth = { __id: 'shell-auth', ready: () => Promise.resolve({ ok: true }) } as never;
  const shellNotify = { push: () => undefined } as never;
  const shellTelemetry = { emit: () => undefined } as never;

  it('keeps the shell-wired http when a later configure call omits http', () => {
    // 1. shell wires the full set at route load
    configureShellServices({
      http: shellHttp,
      auth: shellAuth,
      notify: shellNotify,
      telemetry: shellTelemetry,
    });
    expect(getShellServices().http).toBe(shellHttp);

    // 2. ReportingProviders re-configures with an http-less object
    const canonicalAuth = {
      __id: 'canonical-auth',
      ready: () => Promise.resolve({ ok: true }),
    } as never;
    configureShellServices({ auth: canonicalAuth });

    // http MUST survive — not downgraded to the fallback axios copy
    expect(getShellServices().http).toBe(shellHttp);
    // the explicitly-provided field IS updated
    expect(getShellServices().auth).toBe(canonicalAuth);
    // untouched fields also survive the incomplete configure
    expect(getShellServices().notify).toBe(shellNotify);
    expect(getShellServices().telemetry).toBe(shellTelemetry);
  });

  it('still updates http when a later configure call provides one', () => {
    configureShellServices({ http: shellHttp, auth: shellAuth });
    const nextHttp = { __id: 'next-http' } as never;
    configureShellServices({ http: nextHttp });

    expect(getShellServices().http).toBe(nextHttp);
    // auth from the earlier call survives the http-only configure
    expect(getShellServices().auth).toBe(shellAuth);
  });
});
