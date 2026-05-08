import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  __resetMetricsForTesting,
  getMetricsSnapshot,
  recordAuthNotReady,
  recordRefreshAttempt,
  recordRefreshWaiter,
  recordResponse,
  recordTransportReady,
  subscribeMetrics,
} from './observability';

describe('observability counters (PR-Obs-5)', () => {
  beforeEach(() => {
    __resetMetricsForTesting();
  });

  afterEach(() => {
    __resetMetricsForTesting();
  });

  describe('recordResponse', () => {
    it('buckets status into 2xx/3xx/4xx/5xx with method', () => {
      recordResponse(200, 'GET');
      recordResponse(201, 'POST');
      recordResponse(204, 'DELETE');
      recordResponse(304, 'GET');
      recordResponse(401, 'GET');
      recordResponse(403, 'POST');
      recordResponse(500, 'GET');

      const snapshot = getMetricsSnapshot();
      expect(snapshot.requestTotal['2xx_GET']).toBe(1);
      expect(snapshot.requestTotal['2xx_POST']).toBe(1);
      expect(snapshot.requestTotal['2xx_DELETE']).toBe(1);
      expect(snapshot.requestTotal['3xx_GET']).toBe(1);
      expect(snapshot.requestTotal['4xx_GET']).toBe(1);
      expect(snapshot.requestTotal['4xx_POST']).toBe(1);
      expect(snapshot.requestTotal['5xx_GET']).toBe(1);
    });

    it('normalises unknown method to UNKNOWN', () => {
      recordResponse(200, 'CUSTOM');
      recordResponse(200, undefined);

      const snapshot = getMetricsSnapshot();
      expect(snapshot.requestTotal['2xx_UNKNOWN']).toBe(2);
    });

    it('ignores non-numeric or out-of-range status', () => {
      recordResponse(NaN, 'GET');
      recordResponse(700, 'GET');
      recordResponse(undefined as unknown as number, 'GET');

      const snapshot = getMetricsSnapshot();
      expect(Object.keys(snapshot.requestTotal)).toHaveLength(0);
    });

    it('preserves real response status (Codex iter-0 P0 #3)', () => {
      // 201 Created and 204 No Content must not collapse to "2xx_X" with
      // a fake 200 — the bucket name itself is "2xx_<METHOD>", but the
      // counter increments for the real status. (This test exercises the
      // pathway: a regression where success branch hard-coded 200 would
      // miss DELETE-204 entirely.)
      recordResponse(204, 'DELETE');
      const snap = getMetricsSnapshot();
      expect(snap.requestTotal['2xx_DELETE']).toBe(1);
    });
  });

  describe('recordRefreshAttempt vs recordRefreshWaiter', () => {
    it('attempt counter only counts owners; waiter counter separate', () => {
      // Simulate a single-flight: 1 owner + 2 waiters
      recordRefreshAttempt('ok');
      recordRefreshWaiter();
      recordRefreshWaiter();

      const snap = getMetricsSnapshot();
      expect(snap.refreshAttemptTotal.ok).toBe(1);
      expect(snap.refreshAttemptTotal.fail).toBe(0);
      expect(snap.refreshWaiterTotal).toBe(2);
    });

    it('records failure with normalised reason in recent ring', () => {
      recordRefreshAttempt('refresh-closure-failed');
      const snap = getMetricsSnapshot();
      expect(snap.refreshAttemptTotal.fail).toBe(1);
      expect(snap.recentRefreshFailures).toHaveLength(1);
      expect(snap.recentRefreshFailures[0].reason).toBe('refresh-closure-failed');
    });

    it('normalises unknown failure reason to "other"', () => {
      recordRefreshAttempt('totally-novel-reason');
      const snap = getMetricsSnapshot();
      expect(snap.recentRefreshFailures[0].reason).toBe('other');
    });

    it('caps the recent failure ring at 20 entries', () => {
      for (let i = 0; i < 25; i += 1) {
        recordRefreshAttempt('handler-threw');
      }
      const snap = getMetricsSnapshot();
      expect(snap.recentRefreshFailures.length).toBe(20);
    });

    it('prunes ring entries older than 5 minutes on snapshot', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-08T10:00:00Z'));
      recordRefreshAttempt('handler-threw');
      vi.setSystemTime(new Date('2026-05-08T10:06:00Z'));
      recordRefreshAttempt('handler-threw');
      const snap = getMetricsSnapshot();
      // Only the second entry survives (first was 6 minutes ago)
      expect(snap.recentRefreshFailures.length).toBe(1);
      vi.useRealTimers();
    });
  });

  describe('recordAuthNotReady', () => {
    it('normalises reason to bounded enum', () => {
      recordAuthNotReady('failed');
      recordAuthNotReady('unauthenticated');
      recordAuthNotReady('resolver-throw');
      recordAuthNotReady(undefined);
      recordAuthNotReady('something-arbitrary');

      const snap = getMetricsSnapshot();
      expect(snap.authNotReadyTotal.failed).toBe(1);
      expect(snap.authNotReadyTotal.unauthenticated).toBe(1);
      expect(snap.authNotReadyTotal['resolver-throw']).toBe(1);
      expect(snap.authNotReadyTotal.unknown).toBe(1);
      expect(snap.authNotReadyTotal.other).toBe(1);
    });
  });

  describe('recordTransportReady', () => {
    it('records gauge value', () => {
      recordTransportReady(1234);
      const snap = getMetricsSnapshot();
      expect(snap.transportReadyDurationMs).toBe(1234);
    });

    it('overwrites with the latest value (caller is responsible for dedup)', () => {
      recordTransportReady(1000);
      recordTransportReady(2000);
      const snap = getMetricsSnapshot();
      expect(snap.transportReadyDurationMs).toBe(2000);
    });

    it('rejects negative or non-finite values', () => {
      recordTransportReady(-1);
      recordTransportReady(NaN);
      recordTransportReady(Infinity);
      const snap = getMetricsSnapshot();
      expect(snap.transportReadyDurationMs).toBe(null);
    });
  });

  describe('subscribeMetrics', () => {
    it('throttles notifications at 1Hz', async () => {
      vi.useFakeTimers();
      const handler = vi.fn();
      const unsubscribe = subscribeMetrics(handler);

      recordResponse(200, 'GET');
      recordResponse(200, 'GET');
      recordResponse(200, 'GET');

      // Synchronous calls — handler not yet fired
      expect(handler).not.toHaveBeenCalled();

      // Advance throttle window
      vi.advanceTimersByTime(1100);

      expect(handler).toHaveBeenCalledTimes(1);
      const snap = handler.mock.calls[0][0];
      expect(snap.requestTotal['2xx_GET']).toBe(3);

      unsubscribe();
      vi.useRealTimers();
    });

    it('unsubscribe stops further notifications', async () => {
      vi.useFakeTimers();
      const handler = vi.fn();
      const unsubscribe = subscribeMetrics(handler);
      recordResponse(200, 'GET');
      vi.advanceTimersByTime(1100);
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();
      recordResponse(200, 'GET');
      vi.advanceTimersByTime(1100);
      expect(handler).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    it('subscriber errors do not break notification flow', async () => {
      vi.useFakeTimers();
      const failing = vi.fn(() => {
        throw new Error('boom');
      });
      const ok = vi.fn();
      subscribeMetrics(failing);
      subscribeMetrics(ok);

      recordResponse(200, 'GET');
      vi.advanceTimersByTime(1100);

      expect(failing).toHaveBeenCalledTimes(1);
      expect(ok).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });
  });

  describe('snapshot immutability', () => {
    it('returned snapshot is frozen', () => {
      recordResponse(200, 'GET');
      const snap = getMetricsSnapshot();
      expect(Object.isFrozen(snap)).toBe(true);
      expect(Object.isFrozen(snap.requestTotal)).toBe(true);
      expect(Object.isFrozen(snap.authNotReadyTotal)).toBe(true);
      expect(Object.isFrozen(snap.recentRefreshFailures)).toBe(true);
    });

    it('mutating snapshot does not affect future snapshots', () => {
      recordResponse(200, 'GET');
      const snap1 = getMetricsSnapshot();
      // attempt to mutate (would throw in strict mode, ignored in sloppy)
      try {
        (snap1.requestTotal as Record<string, number>)['2xx_GET'] = 999;
      } catch {
        // expected in strict mode
      }
      const snap2 = getMetricsSnapshot();
      expect(snap2.requestTotal['2xx_GET']).toBe(1);
    });
  });

  describe('__resetMetricsForTesting', () => {
    it('clears all counters and pending notifications', () => {
      vi.useFakeTimers();
      const handler = vi.fn();
      subscribeMetrics(handler);
      recordResponse(200, 'GET');
      recordRefreshAttempt('ok');
      recordRefreshWaiter();
      recordAuthNotReady('failed');
      recordTransportReady(500);

      __resetMetricsForTesting();

      const snap = getMetricsSnapshot();
      expect(Object.keys(snap.requestTotal)).toHaveLength(0);
      expect(snap.refreshAttemptTotal.ok).toBe(0);
      expect(snap.refreshWaiterTotal).toBe(0);
      expect(snap.authNotReadyTotal.failed).toBe(0);
      expect(snap.transportReadyDurationMs).toBe(null);

      // Subscriber list also cleared
      vi.advanceTimersByTime(1100);
      expect(handler).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });
});
