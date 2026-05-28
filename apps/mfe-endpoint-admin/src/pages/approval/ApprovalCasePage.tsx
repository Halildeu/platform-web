import React, { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApprovalCaseView, DecisionRecordPanel, type ApprovalActor } from '@mfe/design-system';
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

const DELEGATE_POOL: ApprovalActor[] = [
  { id: 'reviewer-2', name: 'Reviewer Two', role: 'Senior Reviewer' },
  { id: 'reviewer-3', name: 'Reviewer Three', role: 'Senior Reviewer' },
];

/**
 * Decision-maker detail surface for a single policy approval request.
 * Composes `ApprovalCaseView` (header + reason + diff + history + sticky
 * action footer) with `DecisionRecordPanel` (immutable audit record).
 * The diff panel is fed from domain extras (before/after JSON snapshots).
 */
export const ApprovalCasePage: React.FC = () => {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const { getById, extras, approve, reject, delegate, requestChanges, attest } =
    useEndpointPolicyApprovals();
  const { can } = useEndpointAdminPermissions();

  const request = requestId ? getById(requestId) : undefined;
  const extrasRecord = requestId ? extras[requestId] : undefined;

  const resolver = useMemo(
    () => buildEndpointPolicyEligibilityResolver({ can, extrasById: extras }),
    [can, extras],
  );

  if (!request) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Talep bulunamadi</h1>
        <button
          type="button"
          className="mt-4 rounded-lg border border-border-subtle px-3 py-1.5 text-sm"
          onClick={() => navigate('..')}
        >
          Listeye don
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_400px]">
      <ApprovalCaseView
        request={request}
        currentUser={CURRENT_USER}
        getEligibilityReasons={resolver}
        delegateCandidates={DELEGATE_POOL}
        diff={
          extrasRecord && (extrasRecord.before || extrasRecord.after)
            ? {
                before: extrasRecord.before,
                after: extrasRecord.after,
                beforeLabel: 'Onceki policy',
                afterLabel: 'Onerilen policy',
              }
            : undefined
        }
        onApprove={(payload) => approve(request.id, CURRENT_USER, payload.reason)}
        onReject={(payload) => reject(request.id, CURRENT_USER, payload.reason)}
        onRequestChanges={(payload) => requestChanges(request.id, CURRENT_USER, payload.reason)}
        onDelegate={(payload) =>
          delegate(request.id, CURRENT_USER, payload.delegateTo, payload.reason)
        }
        onAttest={(payload) => attest(request.id, CURRENT_USER, payload.attestation)}
      />
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <DecisionRecordPanel
          history={request.history}
          request={{
            id: request.id,
            title: request.title,
            type: request.type,
            target: request.target,
          }}
          exportFormats={['json']}
          onExport={({ records }) => {
            // PR-4 pilot ships JSON-only audit export — CSV serializer
            // lives in PR-5 alongside the backend audit-log endpoint
            // (Codex 019e6e76 post-impl: don't ship a JSON payload under
            // a CSV mime type).
            const blob = new Blob([JSON.stringify(records, null, 2)], {
              type: 'application/json',
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `approval-${request.id}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        />
      </aside>
    </div>
  );
};

export default ApprovalCasePage;
