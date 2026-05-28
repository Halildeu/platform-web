/**
 * Approval workflow for Design Lab governance decisions
 *
 * Workflow types:
 * - deprecation: propose -> review -> approve/reject
 * - quality_exception: request -> review -> approve with expiry
 * - breaking_change: propose -> impact analysis -> approve
 *
 * Storage: localStorage in dev, API endpoint in prod
 *
 * @deprecated
 * Design-lab governance dogfood only. New domain consumers (e.g.
 * endpoint-admin policy approvals — see `apps/mfe-endpoint-admin/src/app/
 * services/useEndpointPolicyApprovals.ts`) must NOT depend on this hook.
 * It carries a narrower type union (deprecation / quality_exception /
 * breaking_change only), a flatter decision shape (no delegate / attest)
 * and a fixed localStorage key (design-lab scoped). Domain hooks own
 * their own repository port. PR-5 will retire this hook once the
 * design-lab governance surface migrates to the shared API contract.
 */

import { useState, useCallback, useEffect } from 'react';

export type ApprovalType = 'deprecation' | 'quality_exception' | 'breaking_change';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

/**
 * Legacy decision record — minimal dogfood widening (PR-3, wave_12).
 * Mirrors the DS-side `DecisionRecord` discriminated union in a smaller
 * localStorage-safe shape; the full DS shape is synthesized in the
 * `ApprovalQueue` adapter when feeding `DecisionRecordPanel`.
 */
export interface LegacyApprovalDecision {
  id: string;
  actor: string;
  action: 'approve' | 'reject';
  reason?: string;
  timestamp: string;
  previousStatus: ApprovalStatus;
  newStatus: ApprovalStatus;
}

export interface ApprovalRequest {
  id: string;
  type: ApprovalType;
  status: ApprovalStatus;
  proposer: string;
  reviewer?: string;
  target: string;
  reason: string;
  createdAt: string;
  resolvedAt?: string;
  expiresAt?: string;
  /** Append-only history of decisions taken on this request. */
  history?: LegacyApprovalDecision[];
}

const STORAGE_KEY = 'design-lab-approval-requests';

function loadRequests(): ApprovalRequest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ApprovalRequest[];
  } catch {
    return [];
  }
}

function persistRequests(requests: ApprovalRequest[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
  } catch {
    // Storage unavailable — silently drop
  }
}

let nextId = Date.now();

export function useApprovalWorkflow(): {
  requests: ApprovalRequest[];
  propose: (type: ApprovalType, target: string, reason: string) => ApprovalRequest;
  approve: (id: string, reviewer: string) => void;
  reject: (id: string, reviewer: string, reason: string) => void;
  getPending: () => ApprovalRequest[];
  getByTarget: (target: string) => ApprovalRequest[];
} {
  const [requests, setRequests] = useState<ApprovalRequest[]>(() => loadRequests());

  useEffect(() => {
    persistRequests(requests);
  }, [requests]);

  const propose = useCallback(
    (type: ApprovalType, target: string, reason: string): ApprovalRequest => {
      const request: ApprovalRequest = {
        id: `approval-${++nextId}`,
        type,
        status: 'pending',
        proposer: 'current-user',
        target,
        reason,
        createdAt: new Date().toISOString(),
        expiresAt:
          type === 'quality_exception'
            ? new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString()
            : undefined,
      };
      setRequests((prev) => [request, ...prev]);
      return request;
    },
    [],
  );

  const approve = useCallback((id: string, reviewer: string) => {
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const now = new Date().toISOString();
        const decision: LegacyApprovalDecision = {
          id: `dec-${Date.now()}-${id}`,
          actor: reviewer,
          action: 'approve',
          timestamp: now,
          previousStatus: r.status,
          newStatus: 'approved',
        };
        return {
          ...r,
          status: 'approved' as const,
          reviewer,
          resolvedAt: now,
          history: [...(r.history ?? []), decision],
        };
      }),
    );
  }, []);

  const reject = useCallback((id: string, reviewer: string, reason: string) => {
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const now = new Date().toISOString();
        const decision: LegacyApprovalDecision = {
          id: `dec-${Date.now()}-${id}`,
          actor: reviewer,
          action: 'reject',
          reason,
          timestamp: now,
          previousStatus: r.status,
          newStatus: 'rejected',
        };
        return {
          ...r,
          status: 'rejected' as const,
          reviewer,
          resolvedAt: now,
          history: [...(r.history ?? []), decision],
        };
      }),
    );
  }, []);

  const getPending = useCallback(() => requests.filter((r) => r.status === 'pending'), [requests]);

  const getByTarget = useCallback(
    (target: string) => requests.filter((r) => r.target === target),
    [requests],
  );

  return { requests, propose, approve, reject, getPending, getByTarget };
}
