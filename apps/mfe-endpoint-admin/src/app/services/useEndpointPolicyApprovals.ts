/**
 * Endpoint-admin policy approvals (PR-4, wave_12_approval_foundation pilot).
 *
 * Owns its own persistence layer via a repository port so the localStorage
 * implementation used here in the frontend pilot can be swapped for a
 * backend-API adapter in PR-5 without touching consumers.
 *
 * The DS-side `ApprovalRequest` shape carries the canonical fields the
 * approval primitives render. Endpoint-admin-specific facts that the
 * generic shape does NOT carry (changeKind, riskTier, before/after JSON
 * snapshots for the diff panel) live in a parallel `extras` map keyed by
 * request id. Consumers join them in the page composition layer.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
// WEB-014D perf follow-up: pull approval types from the dedicated
// `types/approval` subpath instead of the design-system barrel. Hook
// is type-only consumer, so the runtime barrel cost was pure waste
// (Codex 019e707e iter-2 must-fix #1).
import type {
  ApprovalActor,
  ApprovalRequest,
  ApprovalRequestStatus,
  DecisionAttestation,
  DecisionRecord,
  EligibilityReason,
} from '@mfe/design-system/types/approval';

export interface PolicyApprovalDomainExtras {
  /** Change kind — drives request copy + UI affordances. */
  changeKind: 'create' | 'update' | 'delete';
  /** Risk tier — gates high-risk approvers in the eligibility resolver. */
  riskTier: 'low' | 'medium' | 'high';
  /** Optional before/after JSON snapshots fed to ApprovalCaseView diff. */
  before?: unknown;
  after?: unknown;
}

export interface StoredApprovalsState {
  requests: ApprovalRequest[];
  extras: Record<string, PolicyApprovalDomainExtras>;
}

const EMPTY_STATE: StoredApprovalsState = { requests: [], extras: {} };

export interface ApprovalsRepository {
  load(): StoredApprovalsState;
  save(state: StoredApprovalsState): void;
}

/**
 * localStorage-backed repository. Keys are versioned so a future schema
 * migration can ship under a fresh key without trampling existing data.
 */
export function localStorageRepository(key = 'endpoint-policy-approvals:v1'): ApprovalsRepository {
  return {
    load() {
      try {
        const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
        if (!raw) return EMPTY_STATE;
        const parsed = JSON.parse(raw) as Partial<StoredApprovalsState>;
        return {
          requests: parsed.requests ?? [],
          extras: parsed.extras ?? {},
        };
      } catch {
        return EMPTY_STATE;
      }
    },
    save(state) {
      try {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(key, JSON.stringify(state));
      } catch {
        // Storage unavailable — drop silently
      }
    },
  };
}

export interface ProposePolicyChangeInput {
  policyId: string;
  title: string;
  reason: string;
  proposer: ApprovalActor;
  approvers: ApprovalActor[];
  changeKind: PolicyApprovalDomainExtras['changeKind'];
  riskTier: PolicyApprovalDomainExtras['riskTier'];
  before?: unknown;
  after?: unknown;
  evidenceRefs?: string[];
  deadline?: string;
}

export interface UseEndpointPolicyApprovalsReturn {
  requests: ApprovalRequest[];
  extras: Record<string, PolicyApprovalDomainExtras>;
  propose: (input: ProposePolicyChangeInput) => ApprovalRequest;
  approve: (id: string, actor: ApprovalActor, reason?: string) => void;
  reject: (id: string, actor: ApprovalActor, reason: string) => void;
  requestChanges: (id: string, actor: ApprovalActor, reason: string) => void;
  delegate: (id: string, actor: ApprovalActor, delegateTo: ApprovalActor, reason?: string) => void;
  attest: (id: string, actor: ApprovalActor, attestation: DecisionAttestation) => void;
  getPendingForPolicy: (policyId: string) => ApprovalRequest[];
  getById: (id: string) => ApprovalRequest | undefined;
}

let nextRequestId = Date.now();
function makeRequestId(): string {
  nextRequestId += 1;
  return `policy-approval-${nextRequestId}`;
}

function makeDecisionId(requestId: string): string {
  return `dec-${Date.now()}-${requestId}`;
}

/**
 * Apply a transition: copy the request, append the decision to history,
 * and update the status field. Status transitions:
 *   - approve → 'approved'
 *   - reject → 'rejected'
 *   - request_changes → 'in_review' (no terminal state; status union
 *     doesn't expose 'changes_requested', so we record the intent in
 *     history and leave status mid-flight per Codex 019e6e76)
 *   - delegate → 'in_review' (mid-flight)
 *   - attest → 'approved' (attestation is an approval with extra metadata)
 */
function applyDecision(
  request: ApprovalRequest,
  decision: DecisionRecord,
  newStatus: ApprovalRequestStatus,
): ApprovalRequest {
  return {
    ...request,
    status: newStatus,
    history: [...request.history, decision],
  };
}

export function useEndpointPolicyApprovals(
  options: { repository?: ApprovalsRepository } = {},
): UseEndpointPolicyApprovalsReturn {
  const repositoryRef = useRef<ApprovalsRepository>(options.repository ?? localStorageRepository());

  // stateRef mirrors the React state synchronously so an updater can see
  // the latest committed value even if multiple operations run in the
  // same event tick (e.g. bulk approve loop). Without this, closures
  // capture a stale `state` and the second op overwrites the first.
  const stateRef = useRef<StoredApprovalsState>(repositoryRef.current.load());
  const [state, setState] = useState<StoredApprovalsState>(() => stateRef.current);

  // Race-condition fix (Codex 019e6e76 post-impl): persist synchronously
  // alongside setState rather than relying on a deferred useEffect.
  // Updater pattern reads from `stateRef.current`, not the closure state,
  // so back-to-back commits in the same event are correctly composed.
  const commit = useCallback(
    (updater: (prev: StoredApprovalsState) => StoredApprovalsState): StoredApprovalsState => {
      const next = updater(stateRef.current);
      repositoryRef.current.save(next);
      stateRef.current = next;
      setState(next);
      return next;
    },
    [],
  );

  const propose = useCallback(
    (input: ProposePolicyChangeInput): ApprovalRequest => {
      const id = makeRequestId();
      const createdAt = new Date().toISOString();
      const request: ApprovalRequest = {
        id,
        type: 'policy_change',
        title: input.title,
        target: input.policyId,
        proposer: input.proposer,
        reason: input.reason,
        evidenceRefs: input.evidenceRefs,
        createdAt,
        deadline: input.deadline,
        status: 'pending',
        currentApprovers: input.approvers,
        history: [],
      };
      const extras: PolicyApprovalDomainExtras = {
        changeKind: input.changeKind,
        riskTier: input.riskTier,
        before: input.before,
        after: input.after,
      };
      commit((prev) => ({
        requests: [request, ...prev.requests],
        extras: { ...prev.extras, [id]: extras },
      }));
      return request;
    },
    [commit],
  );

  const transition = useCallback(
    (
      id: string,
      buildDecision: (prev: ApprovalRequest) => DecisionRecord,
      nextStatus: ApprovalRequestStatus,
    ) => {
      commit((prev) => ({
        ...prev,
        requests: prev.requests.map((r) => {
          if (r.id !== id) return r;
          const decision = buildDecision(r);
          return applyDecision(r, decision, nextStatus);
        }),
      }));
    },
    [commit],
  );

  const approve = useCallback(
    (id: string, actor: ApprovalActor, reason?: string) => {
      transition(
        id,
        (prev) => ({
          id: makeDecisionId(id),
          actor,
          actorRole: actor.role ?? '',
          action: 'approve',
          reason,
          previousStatus: prev.status,
          newStatus: 'approved',
          timestamp: new Date().toISOString(),
        }),
        'approved',
      );
    },
    [transition],
  );

  const reject = useCallback(
    (id: string, actor: ApprovalActor, reason: string) => {
      transition(
        id,
        (prev) => ({
          id: makeDecisionId(id),
          actor,
          actorRole: actor.role ?? '',
          action: 'reject',
          reason,
          previousStatus: prev.status,
          newStatus: 'rejected',
          timestamp: new Date().toISOString(),
        }),
        'rejected',
      );
    },
    [transition],
  );

  const requestChanges = useCallback(
    (id: string, actor: ApprovalActor, reason: string) => {
      transition(
        id,
        (prev) => ({
          id: makeDecisionId(id),
          actor,
          actorRole: actor.role ?? '',
          action: 'request_changes',
          reason,
          previousStatus: prev.status,
          newStatus: 'in_review',
          timestamp: new Date().toISOString(),
        }),
        'in_review',
      );
    },
    [transition],
  );

  const delegate = useCallback(
    (id: string, actor: ApprovalActor, delegateTo: ApprovalActor, reason?: string) => {
      transition(
        id,
        (prev) => ({
          id: makeDecisionId(id),
          actor,
          actorRole: actor.role ?? '',
          action: 'delegate',
          reason,
          previousStatus: prev.status,
          newStatus: 'in_review',
          timestamp: new Date().toISOString(),
          delegateTo,
        }),
        'in_review',
      );
    },
    [transition],
  );

  const attest = useCallback(
    (id: string, actor: ApprovalActor, attestation: DecisionAttestation) => {
      transition(
        id,
        (prev) => ({
          id: makeDecisionId(id),
          actor,
          actorRole: actor.role ?? '',
          action: 'attest',
          previousStatus: prev.status,
          newStatus: 'approved',
          timestamp: new Date().toISOString(),
          attestation,
        }),
        'approved',
      );
    },
    [transition],
  );

  const getPendingForPolicy = useCallback(
    (policyId: string) =>
      state.requests.filter((r) => r.target === policyId && r.status === 'pending'),
    [state.requests],
  );

  const getById = useCallback(
    (id: string) => state.requests.find((r) => r.id === id),
    [state.requests],
  );

  return useMemo(
    () => ({
      requests: state.requests,
      extras: state.extras,
      propose,
      approve,
      reject,
      requestChanges,
      delegate,
      attest,
      getPendingForPolicy,
      getById,
    }),
    [
      state,
      propose,
      approve,
      reject,
      requestChanges,
      delegate,
      attest,
      getPendingForPolicy,
      getById,
    ],
  );
}

/**
 * Domain eligibility resolver to plug into ApprovalInbox /
 * ApprovalCaseView via the `getEligibilityReasons` prop. Combines:
 *   - `proposer_self` (4-eyes — proposer cannot approve own request)
 *   - `role_insufficient` (current user lacks `endpoint-admin.policy.approve`)
 *   - `tier_mismatch` (high-risk requests require `*.approve.high_risk`)
 */
export function buildEndpointPolicyEligibilityResolver(opts: {
  can: (action: string) => boolean;
  extrasById: Record<string, PolicyApprovalDomainExtras>;
}) {
  return (request: ApprovalRequest, currentUser: ApprovalActor): EligibilityReason[] => {
    const reasons: EligibilityReason[] = [];
    if (request.proposer.id === currentUser.id) {
      reasons.push({
        code: 'proposer_self',
        message: 'Kendi olusturdugun talebi onaylayamazsin (4-eyes).',
      });
    }
    if (!opts.can('endpoint-admin.policy.approve')) {
      reasons.push({
        code: 'role_insufficient',
        message: 'Bu talebi onaylamak icin yetkin yok.',
      });
    }
    const extras = opts.extrasById[request.id];
    if (extras?.riskTier === 'high' && !opts.can('endpoint-admin.policy.approve.high_risk')) {
      reasons.push({
        code: 'tier_mismatch',
        message: 'Yuksek riskli talep ek yetki gerektirir.',
      });
    }
    return reasons;
  };
}
