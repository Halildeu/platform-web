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
} from '@mfe/design-system';
import {
  useApprovalWorkflow,
  type ApprovalRequest as LegacyApprovalRequest,
  type ApprovalType,
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
 * Adapter — legacy shape → DS shape. Title falls back to `target` since the
 * legacy record has no title field. Approvers / history / evidenceRefs are
 * empty placeholders pending PR-3 (`ApprovalCaseView` + `DecisionRecordPanel`)
 * which will widen the legacy hook with full history.
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
    history: [],
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
