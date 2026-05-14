/**
 * PERF-INIT-V2 PR-B5b2-hostfix — unit tests for the single-source host
 * MF runtime instance lookup.
 *
 * These tests are intentionally written against the GLOBAL
 * `__FEDERATION__.__INSTANCES__` shape (not vi.mock of the module) so
 * a future refactor of the predicate cannot silently produce a
 * false-positive green: the test verifies that the helper correctly
 * walks the same registry shape that the runtime emits.
 *
 * Coverage matrix (per Codex thread `019e2528` PARTIAL absorb):
 *   - configured name `mfe_shell` exact match
 *   - vite-plugin runtime name `__mfe_internal__mfe_shell`
 *   - host at index > 0 (non-first slot)
 *   - non-host name `__mfe_internal__mfe_users` returns null
 *   - missing `__FEDERATION__` returns null
 *   - empty `__INSTANCES__` returns null
 *   - top-level `instance.name` fallback when `options.name` absent
 *   - `listHostMfInstanceCandidates()` enumerates all instance names
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  CONFIGURED_HOST_NAME,
  getHostMfInstance,
  isHostRuntimeName,
  listHostMfInstanceCandidates,
} from '../host-mf-instance';

interface FakeInstance {
  options?: { name: string };
  name?: string;
  loadRemote?: (k: string) => Promise<unknown>;
  registerRemotes?: (
    r: Array<{ name: string; entry: string; type?: string }>,
  ) => void;
}

function setInstances(instances: FakeInstance[] | undefined): void {
  const g = globalThis as { __FEDERATION__?: { __INSTANCES__?: FakeInstance[] } };
  if (instances === undefined) {
    delete g.__FEDERATION__;
    return;
  }
  g.__FEDERATION__ = { __INSTANCES__: instances };
}

function makeInstance(name: string, opts?: { useTopLevelName?: boolean }): FakeInstance {
  return opts?.useTopLevelName
    ? {
        name,
        loadRemote: async () => null,
        registerRemotes: () => undefined,
      }
    : {
        options: { name },
        loadRemote: async () => null,
        registerRemotes: () => undefined,
      };
}

afterEach(() => {
  setInstances(undefined);
});

describe('CONFIGURED_HOST_NAME', () => {
  it('exposes the canonical configured name from vite.config.ts', () => {
    expect(CONFIGURED_HOST_NAME).toBe('mfe_shell');
  });
});

describe('isHostRuntimeName()', () => {
  it('accepts the configured host name verbatim', () => {
    expect(isHostRuntimeName('mfe_shell')).toBe(true);
  });

  it('accepts the @module-federation/vite runtime-prefixed name', () => {
    expect(isHostRuntimeName('__mfe_internal__mfe_shell')).toBe(true);
  });

  it('accepts any future double-underscore-prefixed variant', () => {
    expect(isHostRuntimeName('__future_prefix__mfe_shell')).toBe(true);
  });

  it('rejects non-host remote names with the same suffix word', () => {
    // No `__` separator — `myshell` ends with `shell` but is not a host.
    expect(isHostRuntimeName('myshell')).toBe(false);
    expect(isHostRuntimeName('not_mfe_shell')).toBe(false);
  });

  it('rejects other admin remote names', () => {
    expect(isHostRuntimeName('mfe_users')).toBe(false);
    expect(isHostRuntimeName('__mfe_internal__mfe_users')).toBe(false);
    expect(isHostRuntimeName('mfe_reporting')).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(isHostRuntimeName(undefined)).toBe(false);
    expect(isHostRuntimeName(null)).toBe(false);
    expect(isHostRuntimeName(123)).toBe(false);
    expect(isHostRuntimeName({})).toBe(false);
  });
});

describe('getHostMfInstance()', () => {
  it('returns null when __FEDERATION__ is missing', () => {
    setInstances(undefined);
    expect(getHostMfInstance()).toBeNull();
  });

  it('returns null when __INSTANCES__ is empty', () => {
    setInstances([]);
    expect(getHostMfInstance()).toBeNull();
  });

  it('finds host registered with configured name (test environment)', () => {
    const host = makeInstance('mfe_shell');
    setInstances([host]);
    expect(getHostMfInstance()).toBe(host);
  });

  it('finds host registered with vite-plugin runtime-prefixed name (production)', () => {
    // This is the regression class B5b2-hostfix was opened for —
    // production builds register the host as `__mfe_internal__mfe_shell`,
    // not `mfe_shell`.
    const host = makeInstance('__mfe_internal__mfe_shell');
    setInstances([host]);
    expect(getHostMfInstance()).toBe(host);
  });

  it('finds host when located at a non-zero array slot', () => {
    // Defensive: the helper must not depend on host being `instances[0]`.
    const otherRemote = makeInstance('__mfe_internal__mfe_users');
    const host = makeInstance('__mfe_internal__mfe_shell');
    setInstances([otherRemote, host]);
    expect(getHostMfInstance()).toBe(host);
  });

  it('returns null when registry has remotes but no host', () => {
    setInstances([
      makeInstance('__mfe_internal__mfe_users'),
      makeInstance('__mfe_internal__mfe_reporting'),
    ]);
    expect(getHostMfInstance()).toBeNull();
  });

  it('falls back to top-level instance.name when options.name absent', () => {
    const host = makeInstance('__mfe_internal__mfe_shell', { useTopLevelName: true });
    setInstances([host]);
    expect(getHostMfInstance()).toBe(host);
  });
});

describe('listHostMfInstanceCandidates()', () => {
  it('returns empty array when __FEDERATION__ is missing', () => {
    setInstances(undefined);
    expect(listHostMfInstanceCandidates()).toEqual([]);
  });

  it('returns empty array when __INSTANCES__ is empty', () => {
    setInstances([]);
    expect(listHostMfInstanceCandidates()).toEqual([]);
  });

  it('lists every registered instance name in registry order', () => {
    setInstances([
      makeInstance('__mfe_internal__mfe_shell'),
      makeInstance('__mfe_internal__mfe_users'),
      makeInstance('__mfe_internal__mfe_reporting'),
    ]);
    expect(listHostMfInstanceCandidates()).toEqual([
      '__mfe_internal__mfe_shell',
      '__mfe_internal__mfe_users',
      '__mfe_internal__mfe_reporting',
    ]);
  });

  it('marks instances with no name as <unnamed>', () => {
    const unnamed = {
      options: {} as { name?: string },
    } as unknown as FakeInstance;
    setInstances([unnamed]);
    expect(listHostMfInstanceCandidates()).toEqual(['<unnamed>']);
  });
});
