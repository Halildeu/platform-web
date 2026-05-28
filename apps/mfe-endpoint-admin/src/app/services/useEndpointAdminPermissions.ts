/**
 * Mock RBAC shim for endpoint-admin pilot (PR-4, wave_12_approval_foundation).
 *
 * Returns a `can(action)` function over a hard-coded permission set. The
 * production wire will replace this with an OpenFGA / permission-service
 * call once the backend lands (PR-5). Consumers should ONLY check via
 * `can(action)` — never inspect the raw permission list — so swapping the
 * source stays a one-file change.
 *
 * Permission strings follow the domain namespace pattern:
 *   endpoint-admin.policy.{propose|approve|reject|delegate|attest}
 *   endpoint-admin.policy.approve.high_risk
 */

import { useCallback, useMemo } from 'react';

const MOCK_PERMISSIONS = new Set<string>([
  'endpoint-admin.policy.propose',
  'endpoint-admin.policy.approve',
  'endpoint-admin.policy.reject',
  'endpoint-admin.policy.delegate',
  'endpoint-admin.policy.attest',
  // high_risk left out by default — pilot exercises tier_mismatch path
]);

export interface UseEndpointAdminPermissionsReturn {
  can: (action: string) => boolean;
  /** All currently-granted permissions (read-only snapshot, for debug only). */
  granted: ReadonlyArray<string>;
}

export function useEndpointAdminPermissions(): UseEndpointAdminPermissionsReturn {
  const can = useCallback((action: string) => MOCK_PERMISSIONS.has(action), []);

  return useMemo(() => ({ can, granted: Array.from(MOCK_PERMISSIONS) }), [can]);
}
