import { useMemo, useEffect, useState } from 'react';
import { usePermissions } from './PermissionProvider';
import { checkPermissionBatch } from './api';
import { isUnauthorizedError } from './errors';
import type { ZanzibarAccessLevel, CheckRequest, BatchCheckItem } from './types';

export interface BatchAccessEntry {
  objectId: string;
  access: ZanzibarAccessLevel;
  reason: string;
}

export interface BatchZanzibarAccessResult {
  /** Map of objectId → access result */
  entries: Map<string, BatchAccessEntry>;
  /** Whether batch check is in progress */
  loading: boolean;
  /** Quick lookup: is objectId allowed (full or readonly)? */
  isAllowed: (objectId: string) => boolean;
}

/**
 * Batch object-level authorization hook — single network call for N checks.
 * CNS-20260411-003 #7: batch-check frontend adoption.
 *
 * Strategy:
 * 1. Coarse gate: resolve what we can from /me cache (no network)
 * 2. Batch server check: remaining items in one POST /v1/authz/batch-check
 * 3. Merge results into a unified map
 *
 * @param relation   - OpenFGA relation for all checks (e.g. "can_view")
 * @param objectType - OpenFGA object type for all checks (e.g. "report")
 * @param objectIds  - Array of object IDs to check
 * @param httpPost   - HTTP POST function for server checks
 */
export function useBatchZanzibarAccess(
  relation: string,
  objectType: string,
  objectIds: string[],
  httpPost?: (url: string, body: unknown) => Promise<{ data: unknown }>,
): BatchZanzibarAccessResult {
  const { initialized, sessionExpired, isSuperAdmin, hasModule, canViewReport, isActionAllowed } =
    usePermissions();
  const [serverResults, setServerResults] = useState<BatchCheckItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Phase 1: Coarse gate — resolve locally where possible
  const { resolved, needsServer } = useMemo(() => {
    const resolvedMap = new Map<string, BatchAccessEntry>();
    const serverNeeded: string[] = [];

    if (!initialized) {
      return { resolved: resolvedMap, needsServer: objectIds };
    }

    // Codex 019dd818 iter-4 (B-prime): session expired authn-unknown — tüm
    // objectId'ler için 'disabled' + reason 'session_expired'. Server check'e
    // gitmiyoruz; consumer (RoleDrawer/UserDetailDrawer/ZanzibarGate) bu
    // reason'u okuyup "oturum yenile" UX'i gösterir (PR-2 shell).
    if (sessionExpired) {
      for (const objectId of objectIds) {
        resolvedMap.set(objectId, { objectId, access: 'disabled', reason: 'session_expired' });
      }
      return { resolved: resolvedMap, needsServer: [] };
    }

    for (const objectId of objectIds) {
      if (isSuperAdmin()) {
        resolvedMap.set(objectId, { objectId, access: 'full', reason: 'superadmin' });
        continue;
      }

      if (objectType === 'module' && !hasModule(objectId)) {
        resolvedMap.set(objectId, { objectId, access: 'hidden', reason: 'no_module' });
        continue;
      }
      if (objectType === 'report' && !canViewReport(objectId)) {
        resolvedMap.set(objectId, { objectId, access: 'hidden', reason: 'no_report' });
        continue;
      }
      if (objectType === 'action') {
        if (!isActionAllowed(objectId)) {
          resolvedMap.set(objectId, { objectId, access: 'disabled', reason: 'denied_action' });
        } else {
          resolvedMap.set(objectId, { objectId, access: 'full', reason: 'action_allowed' });
        }
        continue;
      }

      // Coarse gate can't resolve — need server check
      serverNeeded.push(objectId);
    }

    return { resolved: resolvedMap, needsServer: serverNeeded };
  }, [
    initialized,
    sessionExpired,
    isSuperAdmin,
    hasModule,
    canViewReport,
    isActionAllowed,
    objectType,
    objectIds,
  ]);

  // Stable key for needsServer — triggers effect when ID set changes (not just length)
  const needsServerKey = useMemo(() => needsServer.join(','), [needsServer]);

  // Phase 2: Batch server check for unresolved items
  useEffect(() => {
    if (needsServer.length === 0 || !httpPost) {
      setServerResults([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const checks: CheckRequest[] = needsServer.map((objectId) => ({
      relation,
      objectType,
      objectId,
    }));

    checkPermissionBatch(httpPost, checks)
      .then((results) => {
        if (!cancelled) setServerResults(results);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Codex 019dd818 iter-4 (B-prime): batch 401 → tüm entries
        // session_expired ile işaretle (provider'ın sessionExpired state'i
        // /me veya /version 401 yakalandığında zaten true'ya dönecek; bu
        // race-condition guard).
        const reason = isUnauthorizedError(err) ? 'session_expired' : 'error';
        setServerResults(
          needsServer.map((objectId) => ({
            objectId,
            objectType,
            relation,
            allowed: false,
            reason,
          })),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [needsServerKey, relation, objectType, httpPost]);

  // Phase 3: Merge coarse + server results
  const entries = useMemo(() => {
    const merged = new Map(resolved);

    for (const item of serverResults) {
      if (item.allowed) {
        const level: ZanzibarAccessLevel =
          relation.includes('manage') || relation.includes('edit') ? 'full' : 'readonly';
        merged.set(item.objectId, {
          objectId: item.objectId,
          access: level,
          reason: item.reason ?? 'granted',
        });
      } else {
        // 'blocked' (deny) ve 'session_expired' (Codex iter-4) ikisi de 'disabled'.
        const access: ZanzibarAccessLevel =
          item.reason === 'blocked' || item.reason === 'session_expired' ? 'disabled' : 'hidden';
        merged.set(item.objectId, {
          objectId: item.objectId,
          access,
          reason: item.reason ?? 'denied',
        });
      }
    }

    return merged;
  }, [resolved, serverResults, relation]);

  const isAllowed = useMemo(() => {
    return (objectId: string) => {
      const entry = entries.get(objectId);
      return entry?.access === 'full' || entry?.access === 'readonly';
    };
  }, [entries]);

  return { entries, loading, isAllowed };
}
