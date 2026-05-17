// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

/**
 * User Impersonation v1 PR-C2 — iter-6 P1-3 absorb (Codex thread
 * `019e109c`): direct test for the onAuthSuccess catch-up handler.
 * Iter-5 introduced the impersonation-active short-circuit; iter-6
 * review explicitly required a regression test so a future refactor
 * does not silently re-allow the admin-cookie clobber.
 *
 * PR-2 (Codex AGREE thread `019e362e`): the catch-up is now
 * RESULT-GATED — it awaits `deps.bootstrapOutcome` and runs the
 * cookie + authz + session closure ONLY for the `unauthenticated`
 * outcome. The `bootstrap-outcome gate` describe block below pins all
 * four outcome kinds plus the "no work before the deferred settles"
 * timing contract, so the double-bootstrap (a duplicate
 * /api/auth/cookie + /v1/authz/me + inbox/me on every silent-SSO load)
 * cannot regress.
 *
 * The factory is exercised in isolation (no React tree mount).
 */

const { mockGet, mockPost, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn().mockResolvedValue({ data: { permissions: [], superAdmin: false } }),
  mockPost: vi.fn().mockResolvedValue({ data: {} }),
  mockDelete: vi.fn().mockResolvedValue({ data: {} }),
}));

vi.mock('@mfe/shared-http', () => ({
  api: { get: mockGet, post: mockPost, delete: mockDelete },
}));

import { createOnAuthSuccessHandler, type BootstrapOutcome } from './AuthBootstrapper';

/** A manually-settled deferred — used by the outcome-timing contract. */
function makeDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/**
 * Default handler deps. `bootstrapOutcome` defaults to `unauthenticated`
 * so the catch-up closure is reachable; the outcome-gate tests override
 * it per case.
 */
const baseDeps = () => {
  const setTokenCookie = vi.fn(async () => undefined);
  const fetchAppPermissions = vi.fn(async () => ({
    permissions: ['ADMIN'],
    superAdmin: true,
    rawResponse: { permissions: ['ADMIN'], superAdmin: true },
  }));
  const dispatch = vi.fn();
  const bootstrapOutcome = Promise.resolve<BootstrapOutcome>({ kind: 'unauthenticated' });
  return {
    setTokenCookie,
    fetchAppPermissions,
    dispatch,
    bootstrapOutcome,
    mapProfile: vi.fn(() => ({
      id: 'admin-id',
      email: 'admin@example.com',
      role: 'USER' as const,
      permissions: [],
    })),
    getMounted: vi.fn(() => true),
    getIsImpersonating: vi.fn(() => false),
    getKeycloakToken: vi.fn(() => 'admin-jwt'),
    getKeycloakTokenParsed: vi.fn(() => ({ exp: Math.floor(Date.now() / 1000) + 3600 })),
  };
};

describe('createOnAuthSuccessHandler — impersonation guard (iter-6 P1-3)', () => {
  it('skips cookie write + dispatch sequence when impersonation active', async () => {
    const deps = baseDeps();
    deps.getIsImpersonating.mockReturnValue(true);

    const handler = createOnAuthSuccessHandler(deps);
    await handler();

    expect(deps.setTokenCookie).not.toHaveBeenCalled();
    expect(deps.fetchAppPermissions).not.toHaveBeenCalled();
    expect(deps.dispatch).not.toHaveBeenCalled();
  });

  it('runs catch-up closure when impersonation inactive (admin-only path)', async () => {
    const deps = baseDeps();
    const handler = createOnAuthSuccessHandler(deps);
    await handler();

    expect(deps.setTokenCookie).toHaveBeenCalledWith('admin-jwt');
    expect(deps.fetchAppPermissions).toHaveBeenCalledWith('admin-jwt');
    // setKeycloakSession + setAuthPhase('transportReady') + setAuthInitialized(true)
    const dispatchedTypes = deps.dispatch.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(dispatchedTypes).toContain('auth/setKeycloakSession');
    expect(dispatchedTypes).toContain('auth/setAuthPhase');
    expect(dispatchedTypes).toContain('auth/setAuthInitialized');
  });

  it('aborts gracefully when component unmounts during cookie await', async () => {
    const deps = baseDeps();
    let unmounted = false;
    deps.getMounted.mockImplementation(() => !unmounted);
    deps.setTokenCookie.mockImplementation(async () => {
      unmounted = true;
    });

    const handler = createOnAuthSuccessHandler(deps);
    await handler();

    // setTokenCookie still ran (mounted at start); but no further
    // dispatch fired (mounted check after await trips false).
    expect(deps.setTokenCookie).toHaveBeenCalled();
    expect(deps.fetchAppPermissions).not.toHaveBeenCalled();
    expect(deps.dispatch).not.toHaveBeenCalled();
  });

  it('dispatches setAuthFailed when cookie write rejects', async () => {
    const deps = baseDeps();
    deps.setTokenCookie.mockRejectedValueOnce(new Error('Gateway 503'));

    const handler = createOnAuthSuccessHandler(deps);
    await handler();

    const failedCall = deps.dispatch.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'auth/setAuthFailed',
    );
    expect(failedCall).toBeDefined();
    expect(deps.fetchAppPermissions).not.toHaveBeenCalled();
  });
});

describe('createOnAuthSuccessHandler — bootstrap-outcome gate (PR-2)', () => {
  // Contract 1: the controller already owns the FSM — onAuthSuccess is a
  // no-op. `transportReady` = controller wrote cookie + authz + session;
  // `hydrated` = impersonation owns the session. Re-running either would
  // be the redundant double-bootstrap this gate exists to prevent.
  const noopOutcomes: BootstrapOutcome[] = [{ kind: 'transportReady' }, { kind: 'hydrated' }];
  it.each(noopOutcomes)(
    'outcome=$kind → no-op (no 2nd cookie / authz / dispatch)',
    async (outcome) => {
      const deps = baseDeps();
      deps.bootstrapOutcome = Promise.resolve(outcome);

      const handler = createOnAuthSuccessHandler(deps);
      await handler();

      expect(deps.setTokenCookie).not.toHaveBeenCalled();
      expect(deps.fetchAppPermissions).not.toHaveBeenCalled();
      expect(deps.dispatch).not.toHaveBeenCalled();
    },
  );

  // Contract 2: the genuine post-redirect race — bootstrap saw no token,
  // keycloak-js fires onAuthSuccess later with one → catch-up DOES run.
  it('outcome=unauthenticated + token present → catch-up closure runs', async () => {
    const deps = baseDeps();
    deps.bootstrapOutcome = Promise.resolve<BootstrapOutcome>({ kind: 'unauthenticated' });

    const handler = createOnAuthSuccessHandler(deps);
    await handler();

    expect(deps.setTokenCookie).toHaveBeenCalledWith('admin-jwt');
    expect(deps.fetchAppPermissions).toHaveBeenCalledWith('admin-jwt');
    const dispatchedTypes = deps.dispatch.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(dispatchedTypes).toContain('auth/setKeycloakSession');
    expect(dispatchedTypes).toContain('auth/setAuthPhase');
  });

  // Contract 3: the impersonation guard wins over the outcome — even an
  // `unauthenticated` outcome cannot drive the admin-cookie clobber.
  it('impersonation active → no-op even when outcome=unauthenticated', async () => {
    const deps = baseDeps();
    deps.getIsImpersonating.mockReturnValue(true);
    deps.bootstrapOutcome = Promise.resolve<BootstrapOutcome>({ kind: 'unauthenticated' });

    const handler = createOnAuthSuccessHandler(deps);
    await handler();

    expect(deps.setTokenCookie).not.toHaveBeenCalled();
    expect(deps.fetchAppPermissions).not.toHaveBeenCalled();
    expect(deps.dispatch).not.toHaveBeenCalled();
  });

  // Contract 4: a failed bootstrap is authoritative — onAuthSuccess does
  // NOT run the closure and does NOT silently retry.
  it('outcome=failed → no catch-up, no hidden retry', async () => {
    const deps = baseDeps();
    deps.bootstrapOutcome = Promise.resolve<BootstrapOutcome>({ kind: 'failed' });

    const handler = createOnAuthSuccessHandler(deps);
    await handler();

    expect(deps.setTokenCookie).not.toHaveBeenCalled();
    expect(deps.fetchAppPermissions).not.toHaveBeenCalled();
    expect(deps.dispatch).not.toHaveBeenCalled();
  });

  // Contract 5: the handler PARKS on `await bootstrapOutcome` — it issues
  // no cookie / authz / dispatch until the deferred settles.
  it('issues no cookie / authz / dispatch before the outcome settles', async () => {
    const deps = baseDeps();
    const deferred = makeDeferred<BootstrapOutcome>();
    deps.bootstrapOutcome = deferred.promise;

    const handler = createOnAuthSuccessHandler(deps);
    const run = handler();

    // Flush microtasks: the handler is now parked awaiting the outcome.
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.setTokenCookie).not.toHaveBeenCalled();
    expect(deps.fetchAppPermissions).not.toHaveBeenCalled();
    expect(deps.dispatch).not.toHaveBeenCalled();

    // Settle → the catch-up closure is released.
    deferred.resolve({ kind: 'unauthenticated' });
    await run;
    expect(deps.setTokenCookie).toHaveBeenCalledWith('admin-jwt');
    expect(deps.fetchAppPermissions).toHaveBeenCalledWith('admin-jwt');
  });
});
