import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Pins the endpoint-admin MANAGE gate contract (platform-web #922 S4b, Codex
 * 019f67ba). The hook is a deliberately PERMISSIVE ergonomics layer, NOT a
 * security boundary — the backend `can_manage` relation is authoritative and a
 * 403 surfaces as a toast. The ONLY deny path is an explicit `'VIEW'` level.
 *
 * `useManageGate` is a synchronous pure function (no React state), so it is
 * called directly. The shell auth object is injected via `getShellServices`, so
 * we mock that (same shape as CatalogItemDrawer's shell-services mock).
 */

let mockAuth: unknown;
vi.mock('../../../app/services/shell-services', () => ({
  getShellServices: () => ({ auth: mockAuth }),
}));

import { useManageGate } from '../useManageGate';

beforeEach(() => {
  mockAuth = undefined;
});

describe('useManageGate — permissive MANAGE gate', () => {
  it('no auth object → true (fail-open)', () => {
    mockAuth = undefined;
    expect(useManageGate()).toBe(true);
  });

  it('standalone auth (getToken/getUser only, no level methods) → true', () => {
    mockAuth = { getToken: () => 'tok', getUser: () => null };
    expect(useManageGate()).toBe(true);
  });

  it('super-admin → true and SHORT-CIRCUITS (getModuleLevel never consulted, even at VIEW)', () => {
    const getModuleLevel = vi.fn(() => 'VIEW');
    mockAuth = { isSuperAdmin: () => true, getModuleLevel };
    expect(useManageGate()).toBe(true);
    expect(getModuleLevel).not.toHaveBeenCalled();
  });

  it('non-super-admin + level VIEW → false (the ONLY deny path)', () => {
    mockAuth = { isSuperAdmin: () => false, getModuleLevel: () => 'VIEW' };
    expect(useManageGate()).toBe(false);
  });

  it('level MANAGE → true', () => {
    mockAuth = { isSuperAdmin: () => false, getModuleLevel: () => 'MANAGE' };
    expect(useManageGate()).toBe(true);
  });

  it('fails open for ambiguous NONE; backend remains authoritative', () => {
    mockAuth = { isSuperAdmin: () => false, getModuleLevel: () => 'NONE' };
    expect(useManageGate()).toBe(true);
  });

  it('getModuleLevel absent (only isSuperAdmin → false) → true', () => {
    mockAuth = { isSuperAdmin: () => false };
    expect(useManageGate()).toBe(true);
  });

  it('queries getModuleLevel with exactly the ENDPOINT_ADMIN module key', () => {
    const getModuleLevel = vi.fn(() => 'MANAGE');
    mockAuth = { isSuperAdmin: () => false, getModuleLevel };
    useManageGate();
    expect(getModuleLevel).toHaveBeenCalledWith('ENDPOINT_ADMIN');
  });

  // Two SEPARATE throw tests so an isSuperAdmin throw masking the getModuleLevel
  // path stays visible (Codex guardrail).
  it('isSuperAdmin throwing → true (fail-open; never reaches getModuleLevel)', () => {
    const getModuleLevel = vi.fn(() => 'VIEW');
    mockAuth = {
      isSuperAdmin: () => {
        throw new Error('boom');
      },
      getModuleLevel,
    };
    expect(useManageGate()).toBe(true);
    expect(getModuleLevel).not.toHaveBeenCalled();
  });

  it('getModuleLevel throwing → true (fail-open)', () => {
    mockAuth = {
      isSuperAdmin: () => false,
      getModuleLevel: () => {
        throw new Error('boom');
      },
    };
    expect(useManageGate()).toBe(true);
  });
});
