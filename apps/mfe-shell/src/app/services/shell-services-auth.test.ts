// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  configureShellServices,
  getShellServices,
  type AuthReadyResult,
  type ShellAuthPhase,
} from './shell-services';

/**
 * Phase 2 PR-Auth-1 (Codex iter-26 §1 absorb, thread 019e0119):
 * MFE Auth Transport Contract — canonical shell-services contract test.
 *
 * <p>Validates that the canonical shell-services exported via
 * {@code mfe_shell/services} (which remote MFEs pull through
 * {@code import('mfe_shell/services')}) carries the auth.ready() bridge,
 * isTransportReady, getPhase, and getEpoch methods. Without this contract,
 * the runtime/types drift between proactive shell-services-wiring path
 * and the remote pull path.
 */

describe('canonical shell-services — auth transport contract', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
  });

  it('un-configured shell: auth.ready() resolves with fail-closed unauthenticated', async () => {
    // Reset to default by calling configure with minimal init
    configureShellServices({
      queryClient,
      getAuthToken: () => null,
    });

    const services = getShellServices();
    const result = await services.auth.ready();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unauthenticated');
      expect(result.error).toContain('Shell services not configured');
    }
  });

  it('configured shell: auth.ready() routes to wired callback', async () => {
    const expectedResult: AuthReadyResult = { ok: true };
    configureShellServices({
      queryClient,
      getAuthToken: () => 'mock-token',
      authReady: () => Promise.resolve(expectedResult),
      isTransportReady: () => true,
      getAuthPhase: () => 'transportReady' as ShellAuthPhase,
      getAuthEpoch: () => 5,
    });

    const services = getShellServices();
    const result = await services.auth.ready();
    expect(result).toEqual({ ok: true });
    expect(services.auth.isTransportReady()).toBe(true);
    expect(services.auth.getPhase()).toBe('transportReady');
    expect(services.auth.getEpoch()).toBe(5);
  });

  it('failed phase: auth.ready() resolves with failed reason + error', async () => {
    configureShellServices({
      queryClient,
      getAuthToken: () => null,
      authReady: () =>
        Promise.resolve<AuthReadyResult>({
          ok: false,
          reason: 'failed',
          error: 'Cookie write 503',
        }),
      isTransportReady: () => false,
      getAuthPhase: () => 'failed' as ShellAuthPhase,
      getAuthEpoch: () => 0,
    });

    const services = getShellServices();
    const result = await services.auth.ready();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('failed');
      expect(result.error).toBe('Cookie write 503');
    }
  });

  it('contract type: ShellAuthService methods are present', () => {
    configureShellServices({ queryClient, getAuthToken: () => null });
    const services = getShellServices();
    // TypeScript ensures these methods exist via interface; runtime check
    // also guards against accidental method removal in createShellServices.
    expect(typeof services.auth.getToken).toBe('function');
    expect(typeof services.auth.onTokenChange).toBe('function');
    expect(typeof services.auth.ready).toBe('function');
    expect(typeof services.auth.isTransportReady).toBe('function');
    expect(typeof services.auth.getPhase).toBe('function');
    expect(typeof services.auth.getEpoch).toBe('function');
    // Codex 019e1bed C-prime — shell-level superAdmin gate must be a
    // first-class method on ShellAuthService so remote consumers can
    // call it as a defensive replacement for `usePermissions()` when
    // their local `@mfe/auth` context is split via Vite alias drift.
    expect(typeof services.auth.isSuperAdmin).toBe('function');
    // Codex 019ea409 — shell-level per-module access getter must also be a
    // first-class method so remotes gate MANAGE-only actions canonically.
    expect(typeof services.auth.getModuleLevel).toBe('function');
  });

  it('Codex 019ea409: getModuleLevel routes to wired callback (no caching)', () => {
    let currentLevel: 'NONE' | 'VIEW' | 'MANAGE' = 'NONE';
    configureShellServices({
      queryClient,
      getAuthToken: () => null,
      getModuleLevel: (module) => (module === 'USER_MANAGEMENT' ? currentLevel : 'NONE'),
    });

    const services = getShellServices();
    expect(services.auth.getModuleLevel('USER_MANAGEMENT')).toBe('NONE');
    currentLevel = 'VIEW';
    expect(services.auth.getModuleLevel('USER_MANAGEMENT')).toBe('VIEW');
    currentLevel = 'MANAGE';
    expect(services.auth.getModuleLevel('USER_MANAGEMENT')).toBe('MANAGE');
    // Unwired module name still resolves through the same callback.
    expect(services.auth.getModuleLevel('AUDIT')).toBe('NONE');
  });

  it("Codex 019ea409: getModuleLevel defaults to 'NONE' when wiring omits the getter", () => {
    configureShellServices({ queryClient, getAuthToken: () => null });
    const services = getShellServices();
    // Fail-closed: remotes cannot unlock MANAGE-gated actions by calling
    // getShellServices() before shell finishes hydrating authz.
    expect(services.auth.getModuleLevel('USER_MANAGEMENT')).toBe('NONE');
  });

  it('Codex 019e1bed C-prime: isSuperAdmin routes to wired callback (no caching)', () => {
    let currentSuperAdmin = false;
    configureShellServices({
      queryClient,
      getAuthToken: () => null,
      isSuperAdmin: () => currentSuperAdmin,
    });

    const services = getShellServices();
    expect(services.auth.isSuperAdmin()).toBe(false);
    currentSuperAdmin = true;
    expect(services.auth.isSuperAdmin()).toBe(true);
    currentSuperAdmin = false;
    expect(services.auth.isSuperAdmin()).toBe(false);
  });

  it('Codex 019e1bed C-prime: isSuperAdmin defaults to false when wiring omits the getter', () => {
    configureShellServices({ queryClient, getAuthToken: () => null });
    const services = getShellServices();
    // Fail-closed: remotes cannot leak `superAdmin: true` simply by
    // calling getShellServices() before shell finishes hydrating authz.
    expect(services.auth.isSuperAdmin()).toBe(false);
  });

  it('Codex 019ea409: isSuperAdmin resets to false on a re-configure that omits the getter', () => {
    // Stale-on-omit guard: a prior configure wiring `() => true` must NOT
    // leak through a later partial/minimal configure that omits the getter.
    configureShellServices({ queryClient, getAuthToken: () => null, isSuperAdmin: () => true });
    expect(getShellServices().auth.isSuperAdmin()).toBe(true);
    configureShellServices({ queryClient, getAuthToken: () => null });
    expect(getShellServices().auth.isSuperAdmin()).toBe(false);
  });

  it('Codex 019ea409: getModuleLevel resets to NONE on a re-configure that omits the getter', () => {
    configureShellServices({
      queryClient,
      getAuthToken: () => null,
      getModuleLevel: () => 'MANAGE',
    });
    expect(getShellServices().auth.getModuleLevel('USER_MANAGEMENT')).toBe('MANAGE');
    configureShellServices({ queryClient, getAuthToken: () => null });
    expect(getShellServices().auth.getModuleLevel('USER_MANAGEMENT')).toBe('NONE');
  });

  it('phase getter routes to wired callback (no caching)', () => {
    let currentPhase: ShellAuthPhase = 'initializing';
    configureShellServices({
      queryClient,
      getAuthToken: () => null,
      getAuthPhase: () => currentPhase,
    });

    const services = getShellServices();
    expect(services.auth.getPhase()).toBe('initializing');
    currentPhase = 'transportReady';
    expect(services.auth.getPhase()).toBe('transportReady');
    currentPhase = 'failed';
    expect(services.auth.getPhase()).toBe('failed');
  });
});
