// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isMfeOnDemandBootstrapEnabled } from '../mfe-bootstrap-flag';

/**
 * PERF-INIT-V2 PR-B5b3-prep — rollback feature flag contract tests.
 *
 * The flag must default to FALSE (current eager bootstrap unchanged).
 * Operators can opt in via either `MFE_ON_DEMAND_BOOTSTRAP=1` (runtime
 * env) or `VITE_MFE_ON_DEMAND_BOOTSTRAP=1` (build-time env).  Any
 * truthy value from readEnvBoolean (1 / true / yes / on,
 * case-insensitive) flips the flag on.
 */

const originalEnv = { ...process.env };

function clearEnv(): void {
  delete process.env.MFE_ON_DEMAND_BOOTSTRAP;
  delete process.env.VITE_MFE_ON_DEMAND_BOOTSTRAP;
  if (typeof window !== 'undefined') {
    const w = window as Window & { __env__?: Record<string, string> };
    if (w.__env__) {
      delete w.__env__.MFE_ON_DEMAND_BOOTSTRAP;
      delete w.__env__.VITE_MFE_ON_DEMAND_BOOTSTRAP;
    }
  }
}

describe('isMfeOnDemandBootstrapEnabled (PR-B5b3-prep)', () => {
  beforeEach(() => {
    clearEnv();
  });

  afterEach(() => {
    clearEnv();
    process.env = { ...originalEnv };
  });

  it('returns false when no env var is set (default eager behaviour)', () => {
    expect(isMfeOnDemandBootstrapEnabled()).toBe(false);
  });

  it('returns true when MFE_ON_DEMAND_BOOTSTRAP=1', () => {
    process.env.MFE_ON_DEMAND_BOOTSTRAP = '1';
    expect(isMfeOnDemandBootstrapEnabled()).toBe(true);
  });

  it('returns true when MFE_ON_DEMAND_BOOTSTRAP=true', () => {
    process.env.MFE_ON_DEMAND_BOOTSTRAP = 'true';
    expect(isMfeOnDemandBootstrapEnabled()).toBe(true);
  });

  it('returns true when VITE_MFE_ON_DEMAND_BOOTSTRAP=1', () => {
    process.env.VITE_MFE_ON_DEMAND_BOOTSTRAP = '1';
    expect(isMfeOnDemandBootstrapEnabled()).toBe(true);
  });

  it('returns true when both env vars are set', () => {
    process.env.MFE_ON_DEMAND_BOOTSTRAP = '1';
    process.env.VITE_MFE_ON_DEMAND_BOOTSTRAP = '1';
    expect(isMfeOnDemandBootstrapEnabled()).toBe(true);
  });

  it('returns false when env var is "false"', () => {
    process.env.MFE_ON_DEMAND_BOOTSTRAP = 'false';
    expect(isMfeOnDemandBootstrapEnabled()).toBe(false);
  });

  it('returns false when env var is "0"', () => {
    process.env.MFE_ON_DEMAND_BOOTSTRAP = '0';
    expect(isMfeOnDemandBootstrapEnabled()).toBe(false);
  });

  it('returns false when env var is empty string', () => {
    process.env.MFE_ON_DEMAND_BOOTSTRAP = '';
    expect(isMfeOnDemandBootstrapEnabled()).toBe(false);
  });

  it('accepts "yes" as a truthy alias', () => {
    process.env.MFE_ON_DEMAND_BOOTSTRAP = 'yes';
    expect(isMfeOnDemandBootstrapEnabled()).toBe(true);
  });

  it('accepts "on" as a truthy alias', () => {
    process.env.MFE_ON_DEMAND_BOOTSTRAP = 'on';
    expect(isMfeOnDemandBootstrapEnabled()).toBe(true);
  });

  it('is case-insensitive for truthy values', () => {
    process.env.MFE_ON_DEMAND_BOOTSTRAP = 'TRUE';
    expect(isMfeOnDemandBootstrapEnabled()).toBe(true);
  });

  it('falls back to window.__env__ when process.env is unset', () => {
    if (typeof window !== 'undefined') {
      const w = window as Window & { __env__?: Record<string, string> };
      w.__env__ = w.__env__ ?? {};
      w.__env__.MFE_ON_DEMAND_BOOTSTRAP = '1';
    }
    expect(isMfeOnDemandBootstrapEnabled()).toBe(true);
  });
});
