// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ensureRemoteShellServicesConfigured,
  __isRemoteShellServicesConfiguredForTests,
  __resetRemoteShellServicesConfiguredForTests,
} from '../ensure-remote-shell-services';

/**
 * PERF-INIT-V2 PR-B5b2-prep — helper contract tests.
 *
 * Covers:
 *   1. Idempotency: configured once, subsequent calls no-op.
 *   2. In-flight dedup: parallel calls for same remote share work.
 *   3. Independent remotes: configuring A doesn't block B.
 *   4. Failure surfacing: missing host instance / null loadRemote /
 *      missing configureShellServices export → throws.
 *   5. Helper isolated from B5b1 suggestions helper (different
 *      configured-remotes Set instance).
 */

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
  loadRemoteResult?: { configureShellServices?: (s: unknown) => void } | null;
  loadRemoteThrows?: Error;
}): FakeHostInstance {
  const fake: FakeHostInstance = {
    options: { name: HOST_NAME },
    registerRemotes: vi.fn(),
    loadRemote: vi.fn(async () => {
      if (opts?.loadRemoteThrows) throw opts.loadRemoteThrows;
      return opts?.loadRemoteResult !== undefined
        ? opts.loadRemoteResult
        : { configureShellServices: vi.fn() };
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

describe('ensureRemoteShellServicesConfigured (PR-B5b2-prep)', () => {
  beforeEach(() => {
    clearGlobalInstances();
    __resetRemoteShellServicesConfiguredForTests();
  });

  afterEach(() => {
    clearGlobalInstances();
    __resetRemoteShellServicesConfiguredForTests();
  });

  it('registers + loads + calls configureShellServices on first call', async () => {
    const configureSpy = vi.fn();
    const host = installFakeHost({
      loadRemoteResult: { configureShellServices: configureSpy },
    });
    const sharedServices = { http: { get: () => Promise.resolve() } };

    await ensureRemoteShellServicesConfigured(
      'mfe_users',
      'http://localhost:3004/remoteEntry.js',
      sharedServices,
    );

    expect(host.registerRemotes).toHaveBeenCalledTimes(1);
    expect(host.registerRemotes.mock.calls[0][0]).toEqual([
      {
        name: 'mfe_users',
        entry: 'http://localhost:3004/remoteEntry.js',
        type: 'esm',
      },
    ]);
    expect(host.loadRemote).toHaveBeenCalledWith('mfe_users/shell-services');
    expect(configureSpy).toHaveBeenCalledWith(sharedServices);
    expect(__isRemoteShellServicesConfiguredForTests('mfe_users')).toBe(true);
  });

  it('idempotent: second call for same remote is no-op', async () => {
    const configureSpy = vi.fn();
    const host = installFakeHost({
      loadRemoteResult: { configureShellServices: configureSpy },
    });
    const sharedServices = { svc: 1 };

    await ensureRemoteShellServicesConfigured(
      'mfe_users',
      'http://localhost:3004/remoteEntry.js',
      sharedServices,
    );
    await ensureRemoteShellServicesConfigured(
      'mfe_users',
      'http://localhost:3004/remoteEntry.js',
      sharedServices,
    );

    expect(host.registerRemotes).toHaveBeenCalledTimes(1);
    expect(host.loadRemote).toHaveBeenCalledTimes(1);
    expect(configureSpy).toHaveBeenCalledTimes(1);
  });

  it('parallel calls for same remote dedup via in-flight promise map', async () => {
    let resolveLoad: ((mod: { configureShellServices: () => void }) => void) | undefined;
    const loadPromise = new Promise<{ configureShellServices: () => void }>((resolve) => {
      resolveLoad = resolve;
    });
    const configureSpy = vi.fn();
    const host: FakeHostInstance = {
      options: { name: HOST_NAME },
      registerRemotes: vi.fn(),
      loadRemote: vi.fn(() => loadPromise),
    };
    const root = globalThis as typeof globalThis & { __FEDERATION__?: FederationGlobalShape };
    root.__FEDERATION__ = { __INSTANCES__: [host] };

    const sharedServices = { svc: 2 };

    // Issue 3 parallel ensure calls before resolving the load
    const p1 = ensureRemoteShellServicesConfigured(
      'mfe_users',
      'http://localhost:3004/remoteEntry.js',
      sharedServices,
    );
    const p2 = ensureRemoteShellServicesConfigured(
      'mfe_users',
      'http://localhost:3004/remoteEntry.js',
      sharedServices,
    );
    const p3 = ensureRemoteShellServicesConfigured(
      'mfe_users',
      'http://localhost:3004/remoteEntry.js',
      sharedServices,
    );

    // Resolve the load
    resolveLoad?.({ configureShellServices: configureSpy });
    await Promise.all([p1, p2, p3]);

    // registerRemotes + loadRemote + configureSpy each called exactly once
    expect(host.registerRemotes).toHaveBeenCalledTimes(1);
    expect(host.loadRemote).toHaveBeenCalledTimes(1);
    expect(configureSpy).toHaveBeenCalledTimes(1);
  });

  it('different remotes are configured independently', async () => {
    installFakeHost();
    const sharedServices = { svc: 3 };

    await ensureRemoteShellServicesConfigured(
      'mfe_users',
      'http://localhost:3004/remoteEntry.js',
      sharedServices,
    );
    await ensureRemoteShellServicesConfigured(
      'mfe_audit',
      'http://localhost:3006/remoteEntry.js',
      sharedServices,
    );

    expect(__isRemoteShellServicesConfiguredForTests('mfe_users')).toBe(true);
    expect(__isRemoteShellServicesConfiguredForTests('mfe_audit')).toBe(true);
    expect(__isRemoteShellServicesConfiguredForTests('mfe_access')).toBe(false);
  });

  it('throws with enriched candidate list when host MF instance is missing', async () => {
    // No installFakeHost — __INSTANCES__ stays empty.
    // PR-B5b2-hostfix (Codex `019e2528` revision): error mesajı artık
    // "not found ... Candidates seen: [<no instances>]" şeklinde olmalı.
    await expect(
      ensureRemoteShellServicesConfigured('mfe_users', 'http://localhost:3004/remoteEntry.js', {}),
    ).rejects.toThrow(/Host MF runtime instance "mfe_shell" not found .* Candidates seen: \[<no instances>\]/);
    expect(__isRemoteShellServicesConfiguredForTests('mfe_users')).toBe(false);
  });

  it('throws with enriched candidate list when only non-host instances are registered', async () => {
    // PR-B5b2-hostfix: regresyon koruması — mfe_users isimli bir instance
    // kayıtlıysa ama host yoksa, hata mesajında gerçek candidate'lar
    // listelenmeli (live triage hızı için).
    const g = globalThis as { __FEDERATION__?: { __INSTANCES__?: unknown[] } };
    g.__FEDERATION__ = {
      __INSTANCES__: [
        { options: { name: '__mfe_internal__mfe_users' } },
        { options: { name: '__mfe_internal__mfe_reporting' } },
      ],
    };
    await expect(
      ensureRemoteShellServicesConfigured('mfe_users', 'http://localhost:3004/remoteEntry.js', {}),
    ).rejects.toThrow(
      /Host MF runtime instance "mfe_shell" not found .* Candidates seen: \[__mfe_internal__mfe_users, __mfe_internal__mfe_reporting\]/,
    );
    expect(__isRemoteShellServicesConfiguredForTests('mfe_users')).toBe(false);
  });

  it('throws when loadRemote returns null', async () => {
    installFakeHost({ loadRemoteResult: null });
    await expect(
      ensureRemoteShellServicesConfigured('mfe_users', 'http://localhost:3004/remoteEntry.js', {}),
    ).rejects.toThrow(/returned null/);
    expect(__isRemoteShellServicesConfiguredForTests('mfe_users')).toBe(false);
  });

  it('throws when configureShellServices export missing', async () => {
    installFakeHost({ loadRemoteResult: {} });
    await expect(
      ensureRemoteShellServicesConfigured('mfe_users', 'http://localhost:3004/remoteEntry.js', {}),
    ).rejects.toThrow(/does not export.*configureShellServices/);
    expect(__isRemoteShellServicesConfiguredForTests('mfe_users')).toBe(false);
  });

  it('throws when host.loadRemote rejects', async () => {
    installFakeHost({ loadRemoteThrows: new Error('remote offline') });
    await expect(
      ensureRemoteShellServicesConfigured('mfe_users', 'http://localhost:3004/remoteEntry.js', {}),
    ).rejects.toThrow('remote offline');
    expect(__isRemoteShellServicesConfiguredForTests('mfe_users')).toBe(false);
  });

  it('failure does NOT prevent subsequent retry for same remote', async () => {
    const host: FakeHostInstance = {
      options: { name: HOST_NAME },
      registerRemotes: vi.fn(),
      loadRemote: vi
        .fn()
        .mockRejectedValueOnce(new Error('first failure'))
        .mockResolvedValueOnce({ configureShellServices: vi.fn() }),
    };
    const root = globalThis as typeof globalThis & { __FEDERATION__?: FederationGlobalShape };
    root.__FEDERATION__ = { __INSTANCES__: [host] };

    await expect(
      ensureRemoteShellServicesConfigured('mfe_users', 'http://localhost:3004/remoteEntry.js', {}),
    ).rejects.toThrow('first failure');
    expect(__isRemoteShellServicesConfiguredForTests('mfe_users')).toBe(false);

    // Retry — should succeed
    await ensureRemoteShellServicesConfigured(
      'mfe_users',
      'http://localhost:3004/remoteEntry.js',
      {},
    );
    expect(__isRemoteShellServicesConfiguredForTests('mfe_users')).toBe(true);
    expect(host.loadRemote).toHaveBeenCalledTimes(2);
  });
});
