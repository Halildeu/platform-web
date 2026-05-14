// @vitest-environment jsdom
//
// Codex 019e27bf — P1 shell-test-infra fix unit coverage.
//
// The previous gate read only `process.env`, which Vite's client bundle
// does not unconditionally inline. The dev-mode + production-preview
// Playwright harness both saw `__authContractProbe` undefined even when
// VITE_AUTH_CONTRACT_E2E=1 was set at the workflow env.
//
// This test pins the new read precedence:
//   import.meta.env  →  guarded process.env  →  window.__env__ / window.__ENV__
//
// And the new boolean acceptance:
//   flag === '1'  ||  flag.toLowerCase() === 'true'

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { isAuthContractE2eEnabled } from './auth-contract-e2e-probe';

const originalEnv = { ...process.env };
const originalWindowEnv = (window as Window & {
  __env__?: Record<string, string | undefined>;
}).__env__;

describe('isAuthContractE2eEnabled — Codex 019e27bf safe env reader', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    (window as Window & { __env__?: Record<string, string | undefined> }).__env__ = undefined;
  });

  afterEach(() => {
    process.env = originalEnv;
    (window as Window & { __env__?: Record<string, string | undefined> }).__env__ =
      originalWindowEnv;
  });

  it('returns true when process.env.VITE_AUTH_CONTRACT_E2E is "1"', () => {
    process.env.VITE_AUTH_CONTRACT_E2E = '1';
    expect(isAuthContractE2eEnabled()).toBe(true);
  });

  it('returns true when process.env.VITE_AUTH_CONTRACT_E2E is "true" (case-insensitive)', () => {
    process.env.VITE_AUTH_CONTRACT_E2E = 'TRUE';
    expect(isAuthContractE2eEnabled()).toBe(true);
  });

  it('returns true when process.env.NEXT_PUBLIC_AUTH_CONTRACT_E2E is set', () => {
    delete process.env.VITE_AUTH_CONTRACT_E2E;
    process.env.NEXT_PUBLIC_AUTH_CONTRACT_E2E = '1';
    expect(isAuthContractE2eEnabled()).toBe(true);
  });

  it('falls back to window.__env__ when neither import.meta.env nor process.env has the flag', () => {
    delete process.env.VITE_AUTH_CONTRACT_E2E;
    delete process.env.NEXT_PUBLIC_AUTH_CONTRACT_E2E;
    (window as Window & { __env__?: Record<string, string | undefined> }).__env__ = {
      VITE_AUTH_CONTRACT_E2E: '1',
    };
    expect(isAuthContractE2eEnabled()).toBe(true);
  });

  it('falls back to window.__ENV__ as a secondary runtime override', () => {
    delete process.env.VITE_AUTH_CONTRACT_E2E;
    delete process.env.NEXT_PUBLIC_AUTH_CONTRACT_E2E;
    (window as Window & { __ENV__?: Record<string, string | undefined> }).__ENV__ = {
      VITE_AUTH_CONTRACT_E2E: 'true',
    };
    expect(isAuthContractE2eEnabled()).toBe(true);
  });

  it('returns false when no source carries the flag', () => {
    delete process.env.VITE_AUTH_CONTRACT_E2E;
    delete process.env.NEXT_PUBLIC_AUTH_CONTRACT_E2E;
    expect(isAuthContractE2eEnabled()).toBe(false);
  });

  it('returns false when window.__env__ has an empty string value', () => {
    delete process.env.VITE_AUTH_CONTRACT_E2E;
    delete process.env.NEXT_PUBLIC_AUTH_CONTRACT_E2E;
    (window as Window & { __env__?: Record<string, string | undefined> }).__env__ = {
      VITE_AUTH_CONTRACT_E2E: '',
    };
    expect(isAuthContractE2eEnabled()).toBe(false);
  });

  it('returns false when the flag value is "0" or "false"', () => {
    process.env.VITE_AUTH_CONTRACT_E2E = '0';
    expect(isAuthContractE2eEnabled()).toBe(false);
    process.env.VITE_AUTH_CONTRACT_E2E = 'false';
    expect(isAuthContractE2eEnabled()).toBe(false);
  });
});
