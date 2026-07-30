// @vitest-environment jsdom
import React, { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

/**
 * Helper-module dynamic-import accessors.  vi.resetModules() in
 * `beforeEach` clears the module cache; if we kept the static import
 * at the top of the file, the helper instance the WRAPPER sees (via
 * its own freshly-resolved import) would diverge from the helper
 * instance the TEST sees (bound at file-load time, before resetModules).
 * Dynamic import inside the test returns the SAME freshly-resolved
 * instance that the wrapper just consumed, so `configuredRemotes`
 * state assertions see the post-render Set.
 */
async function getHelperReset(): Promise<() => void> {
  const helper = await import('./config/ensure-remote-shell-services');
  return helper.__resetRemoteShellServicesConfiguredForTests;
}
async function isConfigured(name: string): Promise<boolean> {
  const helper = await import('./config/ensure-remote-shell-services');
  return helper.__isRemoteShellServicesConfiguredForTests(name);
}

/**
 * PERF-INIT-V2 PR-B5b2-prep-2 — `mfe_users` on-demand bootstrap canary
 * contract tests (Codex thread `019e2358` AGREE Option B).
 *
 * Verifies:
 *   1. First mount routes through `ensureRemoteShellServicesConfigured`
 *      (helper from PR-B5b2-prep-1 #459) which calls
 *      `host.registerRemotes` + `host.loadRemote('mfe_users/shell-services')`
 *      + `mod.configureShellServices(sharedServices)`, THEN the wrapper
 *      calls `host.loadRemote('mfe_users/UsersApp')` to render the
 *      route component.
 *   2. Idempotency — re-mount does NOT re-trigger register.
 *   3. Missing host instance surfaces classified fallback
 *      (`createLazyRemoteModule` outer catch — but the throw comes
 *      from inside `ensureRemoteShellServicesConfigured`, not the
 *      wrapper's own getHostMfInstance check).
 *   4. `loadRemote` returning null surfaces classified fallback.
 *   5. `loadRemote` throwing surfaces classified fallback.
 *   6. Module-shape: `displayName`, `USERS_ON_DEMAND_BUILD_FLAG`.
 *   7. `resolveUsersRemoteEntry` env precedence.
 *
 * Mocking strategy: stub `./config/shell-services-wiring` so the
 * wrapper's `getSharedShellServices()` import resolves to a minimal
 * fake without dragging the full Redux store + Keycloak chain into
 * the test runtime.
 */

// vi.mock is hoisted to top of module BEFORE imports — must not
// reference outer variables.
vi.mock('./config/shell-services-wiring', () => ({
  getSharedShellServices: () => ({
    notify: { push: vi.fn() },
    telemetry: { emit: vi.fn() },
    http: {} as unknown,
    auth: {} as unknown,
  }),
  wireRemoteShellServices: vi.fn(),
  __resetSharedShellServicesForTests: vi.fn(),
}));

interface FakeHostInstance {
  options: { name: string };
  registerRemotes: ReturnType<typeof vi.fn>;
  loadRemote: ReturnType<typeof vi.fn>;
}

interface FederationGlobalShape {
  __INSTANCES__?: FakeHostInstance[];
}

// PR-B5b2-hostfix: use the production-runtime host name (vite plugin
// prefixes the configured 'mfe_shell' with '__mfe_internal__').
const HOST_NAME = '__mfe_internal__mfe_shell';

function installFakeHost(opts?: {
  appComponentOverride?: React.FC | null;
  loadRemoteThrows?: Error;
  shellServicesNull?: boolean;
  shellServicesMissingExport?: boolean;
}): FakeHostInstance {
  const fake: FakeHostInstance = {
    options: { name: HOST_NAME },
    registerRemotes: vi.fn(),
    loadRemote: vi.fn(async (key: string) => {
      if (opts?.loadRemoteThrows) throw opts.loadRemoteThrows;
      if (key.endsWith('/shell-services')) {
        if (opts?.shellServicesNull) return null;
        if (opts?.shellServicesMissingExport) return {};
        return { configureShellServices: vi.fn() };
      }
      // `${remoteName}/UsersApp` key
      if (opts?.appComponentOverride === null) return null;
      return {
        default:
          opts?.appComponentOverride ??
          (() => <div data-testid="users-remote-loaded">UsersApp loaded</div>),
      };
    }),
  };
  const root = globalThis as typeof globalThis & { __FEDERATION__?: FederationGlobalShape };
  root.__FEDERATION__ = root.__FEDERATION__ ?? {};
  root.__FEDERATION__.__INSTANCES__ = [fake];
  return fake;
}

function clearGlobalInstances(): void {
  const root = globalThis as typeof globalThis & { __FEDERATION__?: FederationGlobalShape };
  if (root.__FEDERATION__) {
    root.__FEDERATION__.__INSTANCES__ = [];
  }
}

describe('createUsersAppOnDemand (PR-B5b2-prep-2)', () => {
  beforeEach(async () => {
    clearGlobalInstances();
    // Reset BEFORE the per-test module cache nuke so the existing
    // helper instance's Set is empty for whichever code path the
    // test exercises next.
    const reset = await getHelperReset();
    reset();
    vi.resetModules();
  });

  afterEach(async () => {
    cleanup();
    clearGlobalInstances();
    const reset = await getHelperReset();
    reset();
    vi.restoreAllMocks();
  });

  it('first mount: ensure helper registers + loads shell-services + configures, then wrapper loads UsersApp', async () => {
    const host = installFakeHost();
    const mod = await import('./createUsersAppOnDemand');

    render(
      <Suspense fallback={<div>Loading</div>}>
        <mod.UsersAppOnDemand />
      </Suspense>,
    );

    expect(await screen.findByTestId('users-remote-loaded')).toBeInTheDocument();

    // Helper calls registerRemotes ONCE with the users entry.
    expect(host.registerRemotes).toHaveBeenCalledTimes(1);
    const [remotes] = host.registerRemotes.mock.calls[0];
    expect(remotes).toEqual([
      expect.objectContaining({
        name: 'mfe_users',
        type: 'esm',
        entry: expect.stringMatching(/remoteEntry\.js$/),
      }),
    ]);

    // loadRemote called twice — shell-services (via helper), then UsersApp (via wrapper).
    expect(host.loadRemote).toHaveBeenCalledWith('mfe_users/shell-services');
    expect(host.loadRemote).toHaveBeenCalledWith('mfe_users/UsersApp');
    expect(host.loadRemote).toHaveBeenCalledTimes(2);

    // Helper's configured-remotes Set marks mfe_users as configured.
    expect(await isConfigured('mfe_users')).toBe(true);
  });

  it('idempotent: re-mount does NOT re-trigger ensure helper register', async () => {
    const host = installFakeHost();
    const mod = await import('./createUsersAppOnDemand');

    const { unmount } = render(
      <Suspense fallback={<div>Loading</div>}>
        <mod.UsersAppOnDemand />
      </Suspense>,
    );
    await screen.findByTestId('users-remote-loaded');
    unmount();

    render(
      <Suspense fallback={<div>Loading</div>}>
        <mod.UsersAppOnDemand />
      </Suspense>,
    );
    await screen.findByTestId('users-remote-loaded');

    // registerRemotes still only called once thanks to React.lazy's
    // own caching + the helper's `configuredRemotes` Set.
    expect(host.registerRemotes).toHaveBeenCalledTimes(1);
  });

  it('missing host instance surfaces classified remote-unavailable fallback', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // NO installFakeHost — global __INSTANCES__ stays empty.
    const mod = await import('./createUsersAppOnDemand');

    render(
      <Suspense fallback={<div>Loading</div>}>
        <mod.UsersAppOnDemand />
      </Suspense>,
    );

    expect(await screen.findByTestId('remote-module-fallback-users')).toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalled();
    // Failure does NOT mark the remote as configured — retry can succeed.
    expect(await isConfigured('mfe_users')).toBe(false);
  });

  it('shell-services loadRemote returning null surfaces classified fallback', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    installFakeHost({ shellServicesNull: true });
    const mod = await import('./createUsersAppOnDemand');

    render(
      <Suspense fallback={<div>Loading</div>}>
        <mod.UsersAppOnDemand />
      </Suspense>,
    );

    expect(await screen.findByTestId('remote-module-fallback-users')).toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalled();
    expect(await isConfigured('mfe_users')).toBe(false);
  });

  it('shell-services missing configureShellServices export surfaces classified fallback', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    installFakeHost({ shellServicesMissingExport: true });
    const mod = await import('./createUsersAppOnDemand');

    render(
      <Suspense fallback={<div>Loading</div>}>
        <mod.UsersAppOnDemand />
      </Suspense>,
    );

    expect(await screen.findByTestId('remote-module-fallback-users')).toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalled();
    expect(await isConfigured('mfe_users')).toBe(false);
  });

  it('host.loadRemote throwing surfaces classified fallback', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    installFakeHost({ loadRemoteThrows: new Error('remote offline') });
    const mod = await import('./createUsersAppOnDemand');

    render(
      <Suspense fallback={<div>Loading</div>}>
        <mod.UsersAppOnDemand />
      </Suspense>,
    );

    expect(await screen.findByTestId('remote-module-fallback-users')).toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalled();
    expect(await isConfigured('mfe_users')).toBe(false);
  });

  it('UsersAppOnDemand has correct displayName', async () => {
    const mod = await import('./createUsersAppOnDemand');
    expect(mod.UsersAppOnDemand.displayName).toBe('UsersAppOnDemand');
  });

  it('exports USERS_ON_DEMAND_BUILD_FLAG', async () => {
    const mod = await import('./createUsersAppOnDemand');
    expect('USERS_ON_DEMAND_BUILD_FLAG' in mod).toBe(true);
  });

  it('uses VITE_MFE_USERS_URL when set', async () => {
    process.env.VITE_MFE_USERS_URL = 'http://example.test/custom-remote-entry.js';
    const host = installFakeHost();
    const mod = await import('./createUsersAppOnDemand');

    render(
      <Suspense fallback={<div>Loading</div>}>
        <mod.UsersAppOnDemand />
      </Suspense>,
    );
    await screen.findByTestId('users-remote-loaded');

    const [remotes] = host.registerRemotes.mock.calls[0];
    expect(remotes[0].entry).toBe('http://example.test/custom-remote-entry.js');

    delete process.env.VITE_MFE_USERS_URL;
  });

  it('runtime MFE_USERS_URL takes precedence over VITE_MFE_USERS_URL', async () => {
    process.env.MFE_USERS_URL = 'http://runtime.example.test/remoteEntry.js';
    process.env.VITE_MFE_USERS_URL = 'http://build.example.test/remoteEntry.js';
    const host = installFakeHost();
    const mod = await import('./createUsersAppOnDemand');

    render(
      <Suspense fallback={<div>Loading</div>}>
        <mod.UsersAppOnDemand />
      </Suspense>,
    );
    await screen.findByTestId('users-remote-loaded');

    const [remotes] = host.registerRemotes.mock.calls[0];
    expect(remotes[0].entry).toBe('http://runtime.example.test/remoteEntry.js');

    delete process.env.MFE_USERS_URL;
    delete process.env.VITE_MFE_USERS_URL;
  });

  it('falls back to localhost:3004 when no env URL is set', async () => {
    delete process.env.MFE_USERS_URL;
    delete process.env.VITE_MFE_USERS_URL;
    const host = installFakeHost();
    const mod = await import('./createUsersAppOnDemand');

    render(
      <Suspense fallback={<div>Loading</div>}>
        <mod.UsersAppOnDemand />
      </Suspense>,
    );
    await screen.findByTestId('users-remote-loaded');

    const [remotes] = host.registerRemotes.mock.calls[0];
    expect(remotes[0].entry).toBe('http://localhost:3004/remoteEntry.js');
  });
});

/**
 * The ordering invariant itself: shell services must be configured before the
 * remote's app module is even fetched.
 *
 * Why it matters. `lazy-routes.ts` used to pick between this wrapper and a bare
 * eager import of the remote's App expose based on a build-time define, and the
 * eager side is what broke prod: it mounts the remote app while the work that
 * configures it is idle-deferred AND gated on `authState.token`, so on a cold
 * session the configure is unscheduled rather than late. `getShellServices()`
 * then throws inside the remote and the surface renders an error having issued
 * no request. Measured on ai.acik.com 2026-07-30: 2 of 3 cold `/admin/users`
 * loads, zero `/api/v1/users` traffic.
 *
 * These assert on MODULE FACTORY invocation order rather than on React render
 * timing, because React scheduling can mask a wrong order, and they hold the
 * shell-services load open so "the app was not fetched early" is observed rather
 * than inferred from a race the test happened to win.
 *
 * Scope, stated rather than implied: this proves the WRAPPER orders correctly.
 * It does not prove `lazy-routes.ts` binds the route to the wrapper. Codex
 * (thread 019fb1f7, D6) asked for the route export to be rendered here so the
 * test could not be satisfied by a correct-but-unused wrapper. That is not
 * achievable in this environment: importing `lazy-routes.ts` drags 10 static
 * federation specifiers (e.g. the interview-evidence remote) into the test
 * module graph, and `vite:import-analysis` fails to resolve them before any mock
 * applies. Stubbing all ten would be a larger and riskier change to shared test
 * infrastructure than the fix under test. The route-binding half is therefore
 * enforced statically instead, by `scripts/ci/on-demand-federation-guard.mjs`
 * S3, which requires the unconditional wrapper binding AND forbids an eager
 * admin App import from returning to that file. Note the behaviour half could
 * not cover a reintroduced build-time branch anyway, since `vitest.config.ts`
 * inlines the admin define as `true`.
 */
describe('UsersModule route binding — configure happens before the app module loads', () => {
  beforeEach(async () => {
    clearGlobalInstances();
    const reset = await getHelperReset();
    reset();
    vi.resetModules();
  });

  afterEach(async () => {
    cleanup();
    clearGlobalInstances();
    const reset = await getHelperReset();
    reset();
    vi.restoreAllMocks();
  });

  /**
   * Fake host that records an ordered event log and holds the shell-services
   * load open until the test releases it, so "app never loads early" is observed
   * rather than inferred from a race the test happened to win.
   */
  function installOrderRecordingHost(): {
    events: string[];
    releaseShellServices: () => void;
  } {
    const events: string[] = [];
    let release!: () => void;
    const shellServicesGate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const fake: FakeHostInstance = {
      options: { name: HOST_NAME },
      registerRemotes: vi.fn(() => {
        events.push('register');
      }),
      loadRemote: vi.fn(async (key: string) => {
        if (key.endsWith('/shell-services')) {
          events.push('shell-services-load-started');
          await shellServicesGate;
          events.push('shell-services-module-resolved');
          return {
            configureShellServices: vi.fn(() => {
              events.push('configureShellServices');
            }),
          };
        }
        // The App expose. Pushing here — at module resolution, before any React
        // work — is what makes the assertion about load order rather than paint
        // order.
        events.push('UsersApp-module-factory');
        return {
          default: () => <div data-testid="users-remote-loaded">UsersApp loaded</div>,
        };
      }),
    };

    const root = globalThis as typeof globalThis & { __FEDERATION__?: FederationGlobalShape };
    root.__FEDERATION__ = root.__FEDERATION__ ?? {};
    root.__FEDERATION__.__INSTANCES__ = [fake];
    return { events, releaseShellServices: release };
  }

  it('does not load the app module while shell-services configuration is still pending', async () => {
    const { events, releaseShellServices } = installOrderRecordingHost();
    const mod = await import('./createUsersAppOnDemand');

    render(
      <Suspense fallback={<div>Loading</div>}>
        <mod.UsersAppOnDemand />
      </Suspense>,
    );

    // Let the wrapper reach its first await without releasing the gate.
    await vi.waitFor(() => expect(events).toContain('shell-services-load-started'));

    expect(
      events,
      'the app module was requested before its shell services were configured',
    ).not.toContain('UsersApp-module-factory');

    releaseShellServices();
    expect(await screen.findByTestId('users-remote-loaded')).toBeInTheDocument();
  });

  it('configures shell services strictly before the app module factory runs', async () => {
    const { events, releaseShellServices } = installOrderRecordingHost();
    const mod = await import('./createUsersAppOnDemand');

    render(
      <Suspense fallback={<div>Loading</div>}>
        <mod.UsersAppOnDemand />
      </Suspense>,
    );

    await vi.waitFor(() => expect(events).toContain('shell-services-load-started'));
    releaseShellServices();
    await screen.findByTestId('users-remote-loaded');

    expect(events).toEqual([
      'register',
      'shell-services-load-started',
      'shell-services-module-resolved',
      'configureShellServices',
      'UsersApp-module-factory',
    ]);

    expect(events.indexOf('configureShellServices')).toBeLessThan(
      events.indexOf('UsersApp-module-factory'),
    );
  });

  it('holds the ordering with no auth token present', async () => {
    // The mocked `getSharedShellServices` carries no token, which is the cold
    // session the prod failures came from. The route path must not consult auth
    // state at all — if it ever gains an auth precondition, this fails.
    const { events, releaseShellServices } = installOrderRecordingHost();
    const mod = await import('./createUsersAppOnDemand');

    render(
      <Suspense fallback={<div>Loading</div>}>
        <mod.UsersAppOnDemand />
      </Suspense>,
    );

    await vi.waitFor(() => expect(events).toContain('shell-services-load-started'));
    releaseShellServices();

    expect(await screen.findByTestId('users-remote-loaded')).toBeInTheDocument();
    expect(await isConfigured('mfe_users')).toBe(true);
  });
});
