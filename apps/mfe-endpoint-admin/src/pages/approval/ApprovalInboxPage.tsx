import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
// WEB-014D perf follow-up: deep import to avoid the design-system
// barrel pulling `./charts` / ECharts into the approvals cold path.
import { ApprovalInbox } from '@mfe/design-system/components/approval-inbox';
import type { ApprovalActor } from '@mfe/design-system/types/approval';
import {
  useEndpointPolicyApprovals,
  buildEndpointPolicyEligibilityResolver,
} from '../../app/services/useEndpointPolicyApprovals';
import { useEndpointAdminPermissions } from '../../app/services/useEndpointAdminPermissions';

const CURRENT_USER: ApprovalActor = {
  id: 'current-user',
  name: 'Mock Maintainer',
  role: 'Maintainer',
};

/**
 * Maintainer inbox for policy-change approval requests. Global — not
 * scoped to a specific policy — because operators triage across the fleet.
 * Per-policy filtered views live at `/policies/:policyId/approvals`
 * (deferred until consumer asks for it).
 */
export const ApprovalInboxPage: React.FC = () => {
  const navigate = useNavigate();
  const { requests, extras, approve, reject } = useEndpointPolicyApprovals();
  const { can } = useEndpointAdminPermissions();

  const resolver = useMemo(
    () => buildEndpointPolicyEligibilityResolver({ can, extrasById: extras }),
    [can, extras],
  );

  const handleBulkApprove = (payload: {
    eligibleIds: string[];
    blockedReasons: Array<{ id: string; reasons: unknown[] }>;
  }) => {
    for (const id of payload.eligibleIds) {
      approve(id, CURRENT_USER, 'Toplu onayla');
    }
    // blockedReasons surface in Codex audit-hook position; PR-5 will route
    // them through a toast / escalation flow once telemetry lands.
  };

  const handleBulkReject = (payload: {
    eligibleIds: string[];
    blockedReasons: Array<{ id: string; reasons: unknown[] }>;
  }) => {
    for (const id of payload.eligibleIds) {
      reject(id, CURRENT_USER, 'Toplu reddet');
    }
  };

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-semibold mb-4">Endpoint policy onaylari</h1>
      <ApprovalInbox
        requests={requests}
        currentUser={CURRENT_USER}
        getEligibilityReasons={resolver}
        typeOptions={[{ value: 'policy_change', label: 'Policy degisikligi' }]}
        statusOptions={['pending', 'in_review', 'approved', 'rejected']}
        onRequestOpen={(request) => navigate(`./${request.id}`)}
        onBulkApprove={handleBulkApprove}
        onBulkReject={handleBulkReject}
        emptyMessage="Bekleyen policy onayı yok."
      />
    </div>
  );
};

export default ApprovalInboxPage;
