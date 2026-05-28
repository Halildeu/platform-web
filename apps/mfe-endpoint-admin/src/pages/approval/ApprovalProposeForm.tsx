import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
// WEB-014D perf follow-up: deep imports — see ApprovalInboxPage.tsx
// rationale.
import {
  ApprovalRequestForm,
  type ApprovalRequestDraft,
} from '@mfe/design-system/components/approval-request-form';
import type { ApprovalActor } from '@mfe/design-system/types/approval';
import { useEndpointPolicyApprovals } from '../../app/services/useEndpointPolicyApprovals';

const CURRENT_USER: ApprovalActor = {
  id: 'current-user',
  name: 'Mock Proposer',
  role: 'Engineer',
};

const CANDIDATE_APPROVERS: ApprovalActor[] = [
  { id: 'reviewer-1', name: 'Reviewer One', role: 'Maintainer' },
  { id: 'reviewer-2', name: 'Reviewer Two', role: 'Senior Reviewer' },
  { id: 'reviewer-3', name: 'Reviewer Three', role: 'Senior Reviewer' },
];

const REQUEST_TYPES = [{ value: 'policy_change', label: 'Policy degisikligi' }];

/**
 * Proposer form for opening a new policy-change approval request. Bound
 * to a specific policy via the route param. Backend wiring (real before
 * snapshot from the API) lands in PR-5; pilot uses an empty before/after
 * placeholder so the diff panel renders even without server state.
 */
export const ApprovalProposeForm: React.FC = () => {
  const { policyId } = useParams<{ policyId: string }>();
  const navigate = useNavigate();
  const { propose } = useEndpointPolicyApprovals();

  if (!policyId) {
    return <div className="p-6">Policy id eksik.</div>;
  }

  const handleSubmit = async (draft: ApprovalRequestDraft) => {
    const request = propose({
      policyId,
      title: draft.title,
      reason: draft.reason,
      proposer: CURRENT_USER,
      approvers: draft.approvers,
      changeKind: 'update',
      riskTier: 'medium',
      evidenceRefs: draft.evidenceRefs,
      deadline: draft.deadline,
    });
    navigate(`../../../approvals/${request.id}`);
  };

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="mb-4 text-2xl font-semibold">Yeni policy onay talebi</h1>
      <p className="mb-6 text-sm text-text-secondary">
        Policy: <span className="font-mono">{policyId}</span>
      </p>
      <ApprovalRequestForm
        candidates={CANDIDATE_APPROVERS}
        proposer={CURRENT_USER}
        requestTypes={REQUEST_TYPES}
        onSubmit={handleSubmit}
        onCancel={() => navigate(-1)}
      />
    </div>
  );
};

export default ApprovalProposeForm;
