/**
 * ApprovalQueue — Pending governance approval requests
 *
 * Dogfood entry for the wave_12_approval_foundation primitives. Rewires the
 * legacy raw HTML queue to compose `ApprovalInbox` from `@mfe/design-system`,
 * mapping the legacy `useApprovalWorkflow.ApprovalRequest` shape to the new
 * shared `ApprovalRequest` shape via an adapter. The legacy hook is kept as
 * the source of truth; deprecation is deferred to PR-4 alongside the
 * endpoint-admin pilot wire-up.
 */

import React, { useMemo } from 'react';
import {
  ApprovalInbox,
  type ApprovalInboxBulkPayload,
  type ApprovalActor,
  type ApprovalRequest as DesignSystemApprovalRequest,
  type DecisionRecord,
} from '@mfe/design-system';
import {
  useApprovalWorkflow,
  type ApprovalRequest as LegacyApprovalRequest,
  type ApprovalType,
  type LegacyApprovalDecision,
} from './useApprovalWorkflow';
import { RoleGate } from './RoleGate';
import { useDesignLabRBAC } from './useDesignLabRBAC';

const TYPE_LABELS: Record<ApprovalType, string> = {
  deprecation: 'Deprecation',
  quality_exception: 'Quality Exception',
  breaking_change: 'Breaking Change',
};

const TYPE_OPTIONS = (Object.entries(TYPE_LABELS) as Array<[ApprovalType, string]>).map(
  ([value, label]) => ({ value, label }),
);

/**
 * Adapter — legacy decision → DS DecisionRecord. PR-3 minimal widening:
 * the legacy hook now appends a decision on approve/reject; here we
 * synthesize the full discriminated DS shape (approve / reject only at
 * this layer; delegate / attest land via PR-4 backend integration).
 */
function adaptLegacyDecision(decision: LegacyApprovalDecision): DecisionRecord {
  if (decision.action === 'approve') {
    return {
      id: decision.id,
      actor: { id: decision.actor, name: decision.actor },
      actorRole: '',
      action: 'approve',
      reason: decision.reason,
      previousStatus: decision.previousStatus,
      newStatus: decision.newStatus,
      timestamp: decision.timestamp,
    };
  }
  return {
    id: decision.id,
    actor: { id: decision.actor, name: decision.actor },
    actorRole: '',
    action: 'reject',
    reason: decision.reason,
    previousStatus: decision.previousStatus,
    newStatus: decision.newStatus,
    timestamp: decision.timestamp,
  };
}

/**
 * Adapter — legacy request → DS request. Title falls back to `target` since
 * the legacy record has no title field. Approvers / evidenceRefs stay empty
 * placeholders; backend wiring lands in PR-4. History is now populated
 * via PR-3's hook widening.
 */
function adaptLegacyRequest(legacy: LegacyApprovalRequest): DesignSystemApprovalRequest {
  return {
    id: legacy.id,
    type: legacy.type,
    title: legacy.target,
    target: legacy.target,
    proposer: { id: legacy.proposer, name: legacy.proposer },
    reason: legacy.reason,
    evidenceRefs: [],
    createdAt: legacy.createdAt,
    deadline: legacy.expiresAt,
    status: legacy.status,
    currentApprovers: [],
    history: (legacy.history ?? []).map(adaptLegacyDecision),
  };
}

interface ApprovalQueueProps {
  /** Show only pending requests (default: true) */
  pendingOnly?: boolean;
}

export function ApprovalQueue({ pendingOnly = true }: ApprovalQueueProps) {
  const { requests, approve, reject } = useApprovalWorkflow();
  const { role } = useDesignLabRBAC();

  const currentUser = useMemo<ApprovalActor>(
    () => ({ id: 'current-user', name: 'Current User', role }),
    [role],
  );

  const adapted = useMemo<DesignSystemApprovalRequest[]>(() => {
    const filtered = pendingOnly ? requests.filter((r) => r.status === 'pending') : requests;
    return filtered.map(adaptLegacyRequest);
  }, [pendingOnly, requests]);

  const handleBulkApprove = (payload: ApprovalInboxBulkPayload) => {
    for (const id of payload.eligibleIds) approve(id, currentUser.id);
    // Blocked rows are surfaced in `payload.blockedReasons` — consumer-side
    // policy could escalate them to another approver; for the dogfood we
    // intentionally let the design-system primitive handle the audit hint
    // (Tooltip + bulk-bar copy) without an additional toast layer.
  };

  const handleBulkReject = (payload: ApprovalInboxBulkPayload) => {
    for (const id of payload.eligibleIds) {
      reject(id, currentUser.id, 'Toplu reddedildi');
    }
  };

  return (
    <RoleGate minRole="maintainer">
      <ApprovalInbox
        requests={adapted}
        currentUser={currentUser}
        typeOptions={TYPE_OPTIONS}
        statusOptions={['pending', 'approved', 'rejected']}
        onBulkApprove={handleBulkApprove}
        onBulkReject={handleBulkReject}
        emptyMessage="Bekleyen onay yok."
      />
    </RoleGate>
  );
}

export default ApprovalQueue;
