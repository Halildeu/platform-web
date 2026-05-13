// @vitest-environment jsdom
import React, { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

/**
 * PERF-INIT-V2 PR-B5b1.5 — on-demand bootstrap canary contract tests
 * (post Codex iter-2 P0 fix: host instance via global registry).
 *
 * Verifies:
 *   1. First mount resolves the host instance from
 *      `globalThis.__FEDERATION__.__INSTANCES__`, calls
 *      `host.registerRemotes` with the ethic entry, then
 *      `host.loadRemote('mfe_ethic/EthicApp')`.
 *   2. Idempotency — subsequent renders do not re-call register.
 *   3. Missing host instance surfaces the classified fallback
 *      (`createLazyRemoteModule` outer catch).
 *   4. `loadRemote` returning null surfaces the classified fallback.
 *   5. Module-shape: `__getEthicRegisteredForTests`,
 *      `__resetEthicRegisteredForTests`,
 *      `ETHIC_ON_DEMAND_BUILD_FLAG`, `displayName`.
 *   6. `resolveEthicRemoteEntry` env precedence.
 *
 * We install a fake host instance into
 * `globalThis.__FEDERATION__.__INSTANCES__` for tests — this matches
 * exactly what the runtime registry would look like in production
 * after the host bundle's `createInstance({ name: 'mfe_shell', ... })`
 * call, without pulling the real `@module-federation/runtime` package
 * (the real package's loadRemote performs HTTP fetches against
 * `remoteEntry.js` — jsdom has no such server).
 */

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
  loadRemoteResult?: { default: React.FC } | null;
  loadRemoteThrows?: Error;
}): FakeHostInstance {
  const fake: FakeHostInstance = {
    options: { name: HOST_NAME },
    registerRemotes: vi.fn(),
    loadRemote: vi.fn(async () => {
      if (opts?.loadRemoteThrows) throw opts.loadRemoteThrows;
      return opts?.loadRemoteResult !== undefined
        ? opts.loadRemoteResult
        : {
            default: () => <div data-testid="ethic-remote-loaded">EthicApp loaded</div>,
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

describe('createEthicAppOnDemand (PR-B5b1.5, iter-2)', () => {
  beforeEach(() => {
    clearGlobalInstances();
    vi.resetModules();
  });

  afterEach(() => {
    cleanup();
    clearGlobalInstances();
    vi.restoreAllMocks();
  });

  it('first mount calls host.registerRemotes with ethic entry + host.loadRemote', async () => {
    const host = installFakeHost();
    const mod = await import('./createEthicAppOnDemand');
    mod.__resetEthicRegisteredForTests();

    render(
      <Suspense fallback={<div>Loading</div>}>
        <mod.EthicAppOnDemand />
      </Suspense>,
    );

    expect(await screen.findByTestId('ethic-remote-loaded')).toBeInTheDocument();

    expect(host.registerRemotes).toHaveBeenCalledTimes(1);
    const [remotes] = host.registerRemotes.mock.calls[0];
    expect(remotes).toEqual([
      expect.objectContaining({
        name: 'mfe_ethic',
        type: 'esm',
        entry: expect.stringMatching(/remoteEntry\.js$/),
      }),
    ]);

    expect(host.loadRemote).toHaveBeenCalledWith('mfe_ethic/EthicApp');
  });

  it('idempotent: re-mount does NOT re-trigger host.registerRemotes', async () => {
    const host = installFakeHost();
    const mod = await import('./createEthicAppOnDemand');
    mod.__resetEthicRegisteredForTests();

    const { unmount } = render(
      <Suspense fallback={<div>Loading</div>}>
        <mod.EthicAppOnDemand />
      </Suspense>,
    );
    await screen.findByTestId('ethic-remote-loaded');
    unmount();

    render(
      <Suspense fallback={<div>Loading</div>}>
        <mod.EthicAppOnDemand />
      </Suspense>,
    );
    await screen.findByTestId('ethic-remote-loaded');

    expect(host.registerRemotes).toHaveBeenCalledTimes(1);
  });

  it('missing host instance surfaces classified remote-unavailable fallback', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // NO installFakeHost — global __INSTANCES__ stays empty.
    const mod = await import('./createEthicAppOnDemand');
    mod.__resetEthicRegisteredForTests();

    render(
      <Suspense fallback={<div>Loading</div>}>
        <mod.EthicAppOnDemand />
      </Suspense>,
    );

    // createLazyRemoteModule's classified fallback uses
    // testid `remote-module-fallback-<label-lowercase>`.
    expect(await screen.findByTestId('remote-module-fallback-ethic')).toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('host.loadRemote returning null surfaces classified fallback', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    installFakeHost({ loadRemoteResult: null });
    const mod = await import('./createEthicAppOnDemand');
    mod.__resetEthicRegisteredForTests();

    render(
      <Suspense fallback={<div>Loading</div>}>
        <mod.EthicAppOnDemand />
      </Suspense>,
    );

    expect(await screen.findByTestId('remote-module-fallback-ethic')).toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('host.loadRemote throwing surfaces classified fallback', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    installFakeHost({ loadRemoteThrows: new Error('remote offline') });
    const mod = await import('./createEthicAppOnDemand');
    mod.__resetEthicRegisteredForTests();

    render(
      <Suspense fallback={<div>Loading</div>}>
        <mod.EthicAppOnDemand />
      </Suspense>,
    );

    expect(await screen.findByTestId('remote-module-fallback-ethic')).toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('exposes __getEthicRegisteredForTests for inspection', async () => {
    installFakeHost();
    const mod = await import('./createEthicAppOnDemand');
    mod.__resetEthicRegisteredForTests();

    expect(mod.__getEthicRegisteredForTests()).toBe(false);

    render(
      <Suspense fallback={<div>Loading</div>}>
        <mod.EthicAppOnDemand />
      </Suspense>,
    );
    await screen.findByTestId('ethic-remote-loaded');

    expect(mod.__getEthicRegisteredForTests()).toBe(true);
  });

  it('EthicAppOnDemand has correct displayName', async () => {
    const mod = await import('./createEthicAppOnDemand');
    expect(mod.EthicAppOnDemand.displayName).toBe('EthicAppOnDemand');
  });

  it('exports ETHIC_ON_DEMAND_BUILD_FLAG', async () => {
    const mod = await import('./createEthicAppOnDemand');
    expect('ETHIC_ON_DEMAND_BUILD_FLAG' in mod).toBe(true);
  });

  it('uses VITE_MFE_ETHIC_URL when set', async () => {
    process.env.VITE_MFE_ETHIC_URL = 'http://example.test/custom-remote-entry.js';
    const host = installFakeHost();
    const mod = await import('./createEthicAppOnDemand');
    mod.__resetEthicRegisteredForTests();

    render(
      <Suspense fallback={<div>Loading</div>}>
        <mod.EthicAppOnDemand />
      </Suspense>,
    );
    await screen.findByTestId('ethic-remote-loaded');

    const [remotes] = host.registerRemotes.mock.calls[0];
    expect(remotes[0].entry).toBe('http://example.test/custom-remote-entry.js');

    delete process.env.VITE_MFE_ETHIC_URL;
  });

  it('runtime MFE_ETHIC_URL takes precedence over VITE_MFE_ETHIC_URL', async () => {
    process.env.MFE_ETHIC_URL = 'http://runtime.example.test/remoteEntry.js';
    process.env.VITE_MFE_ETHIC_URL = 'http://build.example.test/remoteEntry.js';
    const host = installFakeHost();
    const mod = await import('./createEthicAppOnDemand');
    mod.__resetEthicRegisteredForTests();

    render(
      <Suspense fallback={<div>Loading</div>}>
        <mod.EthicAppOnDemand />
      </Suspense>,
    );
    await screen.findByTestId('ethic-remote-loaded');

    const [remotes] = host.registerRemotes.mock.calls[0];
    expect(remotes[0].entry).toBe('http://runtime.example.test/remoteEntry.js');

    delete process.env.MFE_ETHIC_URL;
    delete process.env.VITE_MFE_ETHIC_URL;
  });

  it('falls back to localhost:3002 when no env URL is set', async () => {
    delete process.env.MFE_ETHIC_URL;
    delete process.env.VITE_MFE_ETHIC_URL;
    const host = installFakeHost();
    const mod = await import('./createEthicAppOnDemand');
    mod.__resetEthicRegisteredForTests();

    render(
      <Suspense fallback={<div>Loading</div>}>
        <mod.EthicAppOnDemand />
      </Suspense>,
    );
    await screen.findByTestId('ethic-remote-loaded');

    const [remotes] = host.registerRemotes.mock.calls[0];
    expect(remotes[0].entry).toBe('http://localhost:3002/remoteEntry.js');
  });
});
