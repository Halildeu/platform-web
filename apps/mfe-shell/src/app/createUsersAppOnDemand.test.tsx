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

const HOST_NAME = 'mfe_shell';

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
