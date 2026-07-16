import { describe, it, expect } from 'vitest';
import type { EndpointDevice } from '../../../entities/endpoint-device/types';
import type { EndpointEnrollment } from '../../../entities/endpoint-enrollment/types';
import { summarizeDevices, summarizeEnrollments } from '../overview-aggregation';

/**
 * Locks the Overview data-integrity contract (platform-web #922 S5, Codex
 * 019f6822): managed total is ONLINE+STALE+OFFLINE only; PENDING_ENROLLMENT and
 * DECOMMISSIONED are excluded; a successful-but-empty list is a real zero;
 * grouping is on the wire status (no client re-derivation of expiry).
 */

const device = (
  status: EndpointDevice['status'],
  over: Partial<EndpointDevice> = {},
): EndpointDevice =>
  ({
    deviceId: `d-${Math.round(over.lastSeenAt ? 1 : 0)}-${status}-${Math.random()}`,
    hostname: 'h',
    status,
    lastSeenAt: null,
    ...over,
  }) as EndpointDevice;

const enrollment = (status: EndpointEnrollment['status']): EndpointEnrollment =>
  ({ status }) as EndpointEnrollment;

describe('summarizeDevices', () => {
  it('managed total is ONLINE + STALE + OFFLINE (excludes pending + decommissioned)', () => {
    const s = summarizeDevices([
      device('ONLINE'),
      device('ONLINE'),
      device('STALE'),
      device('OFFLINE'),
      device('PENDING_ENROLLMENT'),
      device('DECOMMISSIONED'),
      device('DECOMMISSIONED'),
    ]);
    expect(s).toEqual({
      managedTotal: 4,
      online: 2,
      stale: 1,
      offline: 1,
      pendingEnrollment: 1,
      decommissioned: 2,
    });
  });

  it('a successful empty list is an exact zero', () => {
    expect(summarizeDevices([])).toEqual({
      managedTotal: 0,
      online: 0,
      stale: 0,
      offline: 0,
      pendingEnrollment: 0,
      decommissioned: 0,
    });
  });

  it('a null lastSeenAt does not affect the count', () => {
    const s = summarizeDevices([device('STALE', { lastSeenAt: null })]);
    expect(s.stale).toBe(1);
    expect(s.managedTotal).toBe(1);
  });
});

describe('summarizeEnrollments', () => {
  it('groups by the wire status (pending / expired / consumed)', () => {
    const s = summarizeEnrollments([
      enrollment('PENDING'),
      enrollment('PENDING'),
      enrollment('EXPIRED'),
      enrollment('CONSUMED'),
      enrollment('CONSUMED'),
      enrollment('CONSUMED'),
    ]);
    expect(s).toEqual({ pending: 2, expired: 1, consumed: 3 });
  });

  it('a successful empty list is an exact zero', () => {
    expect(summarizeEnrollments([])).toEqual({ pending: 0, expired: 0, consumed: 0 });
  });
});
