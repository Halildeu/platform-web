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
