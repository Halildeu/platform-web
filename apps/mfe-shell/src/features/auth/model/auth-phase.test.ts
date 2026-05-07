// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import reducer, {
  logout,
  setAuthInitialized,
  setAuthPhase,
  setAuthFailed,
  bumpAuthEpoch,
  selectAuthPhase,
  selectIsTransportReady,
  selectAuthError,
  selectAuthEpoch,
  type AuthPhase,
} from './auth.slice';

/**
 * Phase 2 PR-Auth-1 (Codex iter-22/23 §Auth-1 absorb, thread 019e0119):
 * MFE Auth Transport Contract FSM behavior tests.
 *
 * <p>Validates: phase transitions, derived `initialized` boolean
 * (backward-compat mirror), authError lifecycle, epoch increment on
 * logout, selectors. These tests guard the contract that PR-Reporting-2
 * + PR-HTTP-3 will rely on (host services {@code auth.ready()} bridge,
 * Suspense AuthGate, single-flight refresh).
 */

const originalWindow = globalThis.window;
const originalLocalStorage = globalThis.localStorage;

class LocalStorageMock {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return key in this.store ? this.store[key] : null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = value;
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
}

beforeEach(() => {
  const localStorage = new LocalStorageMock();
  Object.defineProperty(globalThis, 'window', { value: { localStorage }, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: localStorage, configurable: true });
});

afterEach(() => {
  Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', {
    value: originalLocalStorage,
    configurable: true,
  });
});

describe('auth FSM — phase transitions', () => {
  it('initial phase is initializing with initialized=false', () => {
    const state = reducer(undefined, { type: '@@INIT' });
    expect(state.phase).toBe('initializing');
    expect(state.initialized).toBe(false);
    expect(state.authEpoch).toBe(0);
    expect(state.transportReadyAt).toBeNull();
  });

  it('intermediate phases keep initialized=false (no flicker)', () => {
    let state = reducer(undefined, setAuthPhase('keycloakReady'));
    expect(state.phase).toBe('keycloakReady');
    expect(state.initialized).toBe(false);

    state = reducer(state, setAuthPhase('cookieReady'));
    expect(state.phase).toBe('cookieReady');
    expect(state.initialized).toBe(false);

    state = reducer(state, setAuthPhase('authzReady'));
    expect(state.phase).toBe('authzReady');
    expect(state.initialized).toBe(false);
  });

  it('transportReady flips initialized=true and stamps timestamp', () => {
    const before = Date.now();
    const state = reducer(undefined, setAuthPhase('transportReady'));
    const after = Date.now();

    expect(state.phase).toBe('transportReady');
    expect(state.initialized).toBe(true);
    expect(state.transportReadyAt).not.toBeNull();
    expect(state.transportReadyAt!).toBeGreaterThanOrEqual(before);
    expect(state.transportReadyAt!).toBeLessThanOrEqual(after);
  });

  it('unauthenticated phase flips initialized=true (terminal state)', () => {
    const state = reducer(undefined, setAuthPhase('unauthenticated'));
    expect(state.phase).toBe('unauthenticated');
    expect(state.initialized).toBe(true);
    expect(state.authError).toBeNull();
  });

  it('failed phase flips initialized=true and preserves error context', () => {
    const state = reducer(
      undefined,
      setAuthFailed({ message: 'Cookie write 5xx', cause: 'gateway timeout' }),
    );
    expect(state.phase).toBe('failed');
    expect(state.initialized).toBe(true);
    expect(state.authError).toEqual({ message: 'Cookie write 5xx', cause: 'gateway timeout' });
  });

  it('authError clears when phase transitions out of failed', () => {
    let state = reducer(undefined, setAuthFailed({ message: 'Initial failure' }));
    expect(state.authError).not.toBeNull();
    state = reducer(state, setAuthPhase('initializing'));
    expect(state.authError).toBeNull();
  });

  it('selectors return phase, transport readiness, error, epoch', () => {
    let state = reducer(undefined, setAuthPhase('cookieReady'));
    expect(selectAuthPhase({ auth: state })).toBe('cookieReady');
    expect(selectIsTransportReady({ auth: state })).toBe(false);

    state = reducer(state, setAuthPhase('transportReady'));
    expect(selectIsTransportReady({ auth: state })).toBe(true);

    state = reducer(state, setAuthFailed({ message: 'x' }));
    expect(selectAuthError({ auth: state })).toEqual({ message: 'x' });
    expect(selectAuthEpoch({ auth: state })).toBe(0);
  });
});

describe('auth FSM — epoch invalidation', () => {
  it('logout increments epoch and sets phase=unauthenticated', () => {
    const startState = reducer(undefined, setAuthPhase('transportReady'));
    expect(startState.authEpoch).toBe(0);

    const next = reducer(startState, logout());
    expect(next.phase).toBe('unauthenticated');
    expect(next.authEpoch).toBe(1);
    expect(next.token).toBeNull();
    expect(next.user).toBeNull();
  });

  it('explicit bumpAuthEpoch increments without touching phase', () => {
    const startState = reducer(undefined, setAuthPhase('transportReady'));
    const next = reducer(startState, bumpAuthEpoch());
    expect(next.phase).toBe('transportReady');
    expect(next.authEpoch).toBe(1);
  });

  it('multiple logout calls keep incrementing epoch', () => {
    let state = reducer(undefined, logout());
    expect(state.authEpoch).toBe(1);
    state = reducer(state, logout());
    expect(state.authEpoch).toBe(2);
  });
});

describe('auth FSM — backward compat with setAuthInitialized', () => {
  it('legacy setAuthInitialized(true) sets initialized but does not advance phase alone', () => {
    const state = reducer(undefined, setAuthInitialized(true));
    expect(state.initialized).toBe(true);
    // Phase stays at initial (initializing) — phase is the new source
    // of truth, legacy boolean is just a derived mirror.
    expect(state.phase).toBe('initializing');
  });
});

describe('AuthPhase type — exhaustive case enumeration', () => {
  it('all phases are reducible without throwing', () => {
    const phases: AuthPhase[] = [
      'initializing',
      'keycloakReady',
      'cookieReady',
      'authzReady',
      'transportReady',
      'refreshing',
      'unauthenticated',
      'failed',
    ];
    for (const phase of phases) {
      const state = reducer(undefined, setAuthPhase(phase));
      expect(state.phase).toBe(phase);
    }
  });
});
