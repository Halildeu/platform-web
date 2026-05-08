import { describe, it, expect } from 'vitest';
import type { MetricsSnapshot } from '@mfe/shared-http';
import { selectAuthDegradedState } from './auth-degraded-state';

const buildSnapshot = (overrides: Partial<MetricsSnapshot> = {}): MetricsSnapshot =>
  Object.freeze({
    requestTotal: {},
    authNotReadyTotal: {
      failed: 0,
      unauthenticated: 0,
      'resolver-throw': 0,
      unknown: 0,
      other: 0,
    },
    refreshAttemptTotal: { ok: 0, fail: 0 },
    refreshWaiterTotal: 0,
    recentRefreshFailures: [],
    transportReadyDurationMs: null,
    ...overrides,
  });

describe('selectAuthDegradedState (PR-Obs-5)', () => {
  const baseSnapshot = buildSnapshot();
  const NOW = 1_700_000_000_000;

  it('phase=failed never marks degraded (root failed UI owns this surface)', () => {
    const result = selectAuthDegradedState('failed', NOW - 60_000, baseSnapshot, NOW);
    expect(result).toEqual({ degraded: false, reason: null });
  });

  it('phase=initializing + bootstrap < 30s → not degraded', () => {
    const result = selectAuthDegradedState('initializing', NOW - 10_000, baseSnapshot, NOW);
    expect(result.degraded).toBe(false);
  });

  it('phase=cookieReady + bootstrap > 30s → slow-init degraded', () => {
    const result = selectAuthDegradedState('cookieReady', NOW - 31_000, baseSnapshot, NOW);
    expect(result).toEqual({ degraded: true, reason: 'slow-init' });
  });

  it('phase=keycloakReady + bootstrap > 30s → slow-init degraded', () => {
    const result = selectAuthDegradedState('keycloakReady', NOW - 60_000, baseSnapshot, NOW);
    expect(result).toEqual({ degraded: true, reason: 'slow-init' });
  });

  it('phase=transportReady + bootstrap > 30s → not degraded (ready is terminal)', () => {
    const result = selectAuthDegradedState('transportReady', NOW - 60_000, baseSnapshot, NOW);
    expect(result.degraded).toBe(false);
  });

  it('phase=unauthenticated + bootstrap > 30s → not degraded (terminal state)', () => {
    const result = selectAuthDegradedState('unauthenticated', NOW - 60_000, baseSnapshot, NOW);
    expect(result.degraded).toBe(false);
  });

  it('3 recent refresh failures within 60s → recent-refresh-failures degraded', () => {
    const snap = buildSnapshot({
      recentRefreshFailures: [
        { at: NOW - 5_000, reason: 'handler-threw' },
        { at: NOW - 15_000, reason: 'refresh-closure-failed' },
        { at: NOW - 30_000, reason: 'handler-threw' },
      ],
    });
    const result = selectAuthDegradedState('transportReady', NOW - 60_000, snap, NOW);
    expect(result).toEqual({ degraded: true, reason: 'recent-refresh-failures' });
  });

  it('exactly 2 recent refresh failures within 60s → not degraded (threshold is >2)', () => {
    const snap = buildSnapshot({
      recentRefreshFailures: [
        { at: NOW - 10_000, reason: 'handler-threw' },
        { at: NOW - 20_000, reason: 'refresh-closure-failed' },
      ],
    });
    const result = selectAuthDegradedState('transportReady', NOW - 60_000, snap, NOW);
    expect(result.degraded).toBe(false);
  });

  it('5 refresh failures but oldest 3 > 60s old → only 2 in window, not degraded', () => {
    const snap = buildSnapshot({
      recentRefreshFailures: [
        { at: NOW - 200_000, reason: 'handler-threw' }, // outside 60s window
        { at: NOW - 100_000, reason: 'handler-threw' }, // outside
        { at: NOW - 70_000, reason: 'handler-threw' }, // outside
        { at: NOW - 30_000, reason: 'refresh-closure-failed' }, // inside
        { at: NOW - 10_000, reason: 'handler-threw' }, // inside
      ],
    });
    const result = selectAuthDegradedState('transportReady', NOW - 1_000_000, snap, NOW);
    expect(result.degraded).toBe(false);
  });

  it('phase=failed + recent failures → still NOT degraded (failed wins)', () => {
    const snap = buildSnapshot({
      recentRefreshFailures: [
        { at: NOW - 5_000, reason: 'handler-threw' },
        { at: NOW - 15_000, reason: 'handler-threw' },
        { at: NOW - 25_000, reason: 'handler-threw' },
      ],
    });
    const result = selectAuthDegradedState('failed', NOW - 60_000, snap, NOW);
    expect(result).toEqual({ degraded: false, reason: null });
  });
});
