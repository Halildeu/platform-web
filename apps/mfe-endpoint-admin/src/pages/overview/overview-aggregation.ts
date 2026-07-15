import type { EndpointDevice } from '../../entities/endpoint-device/types';
import type { EndpointEnrollment } from '../../entities/endpoint-enrollment/types';

/**
 * Pure aggregation for the endpoint-admin Overview dashboard (platform-web #922
 * slice S5, Codex istişare 019f6822). These only ever group a SUCCESSFUL, PLAIN
 * (unpaginated, untruncated) list response — the RTK queries `listEndpointDevices`
 * and `listEndpointEnrollments` return a full `T[]`, so counting their statuses is
 * semantically exact. Paginated / grid / truncated / limit-N responses must NOT be
 * counted this way (see the Overview page + Codex's data-integrity rules); this is
 * why aggregation lives in pure, unit-tested functions rather than inline.
 */

export interface FleetStatusSummary {
  /** Actively managed = ONLINE + STALE + OFFLINE. */
  managedTotal: number;
  online: number;
  /** "Last contact is late" (device status), NOT stale inventory freshness. */
  stale: number;
  offline: number;
  /** Mid-enrollment — reported separately, excluded from managedTotal. */
  pendingEnrollment: number;
  /** Retired — excluded from the active managed fleet. */
  decommissioned: number;
}

export function summarizeDevices(devices: readonly EndpointDevice[]): FleetStatusSummary {
  let online = 0;
  let stale = 0;
  let offline = 0;
  let pendingEnrollment = 0;
  let decommissioned = 0;
  for (const device of devices) {
    switch (device.status) {
      case 'ONLINE':
        online += 1;
        break;
      case 'STALE':
        stale += 1;
        break;
      case 'OFFLINE':
        offline += 1;
        break;
      case 'PENDING_ENROLLMENT':
        pendingEnrollment += 1;
        break;
      case 'DECOMMISSIONED':
        decommissioned += 1;
        break;
      default:
        break;
    }
  }
  return {
    managedTotal: online + stale + offline,
    online,
    stale,
    offline,
    pendingEnrollment,
    decommissioned,
  };
}

export interface EnrollmentHealthSummary {
  pending: number;
  expired: number;
  consumed: number;
}

export function summarizeEnrollments(
  enrollments: readonly EndpointEnrollment[],
): EnrollmentHealthSummary {
  let pending = 0;
  let expired = 0;
  let consumed = 0;
  for (const enrollment of enrollments) {
    // Group by the authoritative wire status — do NOT re-derive expiry from
    // expiresAt < now (the backend owns the status decision).
    switch (enrollment.status) {
      case 'PENDING':
        pending += 1;
        break;
      case 'EXPIRED':
        expired += 1;
        break;
      case 'CONSUMED':
        consumed += 1;
        break;
      default:
        break;
    }
  }
  return { pending, expired, consumed };
}
