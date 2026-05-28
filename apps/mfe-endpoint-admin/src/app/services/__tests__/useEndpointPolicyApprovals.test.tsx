// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ApprovalActor } from '@mfe/design-system';
import {
  useEndpointPolicyApprovals,
  buildEndpointPolicyEligibilityResolver,
  type ApprovalsRepository,
  type StoredApprovalsState,
} from '../useEndpointPolicyApprovals';

const proposer: ApprovalActor = {
  id: 'p1',
  name: 'Pia Proposer',
  role: 'Engineer',
};
const reviewer: ApprovalActor = {
  id: 'r1',
  name: 'Rita Reviewer',
  role: 'Maintainer',
};

function memoryRepository(): {
  repo: ApprovalsRepository;
  reads: number;
  writes: number;
  lastWrite: StoredApprovalsState | null;
} {
  let state: StoredApprovalsState = { requests: [], extras: {} };
  const ctx = { reads: 0, writes: 0, lastWrite: null as StoredApprovalsState | null };
  const repo: ApprovalsRepository = {
    load() {
      ctx.reads += 1;
      return state;
    },
    save(next) {
      ctx.writes += 1;
      ctx.lastWrite = next;
      state = next;
    },
  };
  return {
    repo,
    get reads() {
      return ctx.reads;
    },
    get writes() {
      return ctx.writes;
    },
    get lastWrite() {
      return ctx.lastWrite;
    },
  } as ReturnType<typeof memoryRepository>;
}

afterEach(() => cleanup());

describe('useEndpointPolicyApprovals — propose persistence (race condition fix)', () => {
  it('propose() persists synchronously before returning', () => {
    const memo = memoryRepository();
    const { result } = renderHook(() => useEndpointPolicyApprovals({ repository: memo.repo }));

    let proposedId = '';
    act(() => {
      const proposed = result.current.propose({
        policyId: 'policy-x',
        title: 'Tighten password rotation policy',
        reason: 'Rotation interval too long',
        proposer,
        approvers: [reviewer],
        changeKind: 'update',
        riskTier: 'medium',
      });
      proposedId = proposed.id;
    });

    // The repository must have been written synchronously inside propose()
    expect(memo.writes).toBeGreaterThanOrEqual(1);
    expect(memo.lastWrite?.requests[0]?.id).toBe(proposedId);
    expect(memo.lastWrite?.extras[proposedId]?.changeKind).toBe('update');
    expect(memo.lastWrite?.extras[proposedId]?.riskTier).toBe('medium');
  });

  it('approve() appends a discriminated DecisionRecord to history', () => {
    const memo = memoryRepository();
    const { result } = renderHook(() => useEndpointPolicyApprovals({ repository: memo.repo }));

    let proposedId = '';
    act(() => {
      proposedId = result.current.propose({
        policyId: 'policy-x',
        title: 'Test policy',
        reason: 'test',
        proposer,
        approvers: [reviewer],
        changeKind: 'update',
        riskTier: 'low',
      }).id;
    });

    act(() => {
      result.current.approve(proposedId, reviewer, 'Looks good');
    });

    const stored = memo.lastWrite!.requests.find((r) => r.id === proposedId)!;
    expect(stored.status).toBe('approved');
    expect(stored.history).toHaveLength(1);
    expect(stored.history[0].action).toBe('approve');
    expect(stored.history[0].reason).toBe('Looks good');
    expect(stored.history[0].newStatus).toBe('approved');
  });

  it('attest() emits attestation discriminated record with statement', () => {
    const memo = memoryRepository();
    const { result } = renderHook(() => useEndpointPolicyApprovals({ repository: memo.repo }));

    let proposedId = '';
    act(() => {
      proposedId = result.current.propose({
        policyId: 'policy-att',
        title: 'Test',
        reason: 't',
        proposer,
        approvers: [reviewer],
        changeKind: 'create',
        riskTier: 'high',
      }).id;
    });

    act(() => {
      result.current.attest(proposedId, reviewer, {
        statement: 'Yetkim var.',
        acceptedAt: '2026-05-28T10:00:00Z',
      });
    });

    const stored = memo.lastWrite!.requests.find((r) => r.id === proposedId)!;
    expect(stored.history[0].action).toBe('attest');
    if (stored.history[0].action === 'attest') {
      expect(stored.history[0].attestation.statement).toBe('Yetkim var.');
    }
  });
});

describe('buildEndpointPolicyEligibilityResolver', () => {
  it('flags proposer_self when current user equals proposer', () => {
    const resolver = buildEndpointPolicyEligibilityResolver({
      can: () => true,
      extrasById: {},
    });
    const request = {
      id: 'r1',
      type: 'policy_change',
      title: 'T',
      target: 'p',
      proposer,
      reason: 'r',
      createdAt: '',
      status: 'pending' as const,
      currentApprovers: [],
      history: [],
    };
    const reasons = resolver(request, proposer);
    expect(reasons.some((r) => r.code === 'proposer_self')).toBe(true);
  });

  it('flags role_insufficient when can("endpoint-admin.policy.approve") is false', () => {
    const resolver = buildEndpointPolicyEligibilityResolver({
      can: (action) => action !== 'endpoint-admin.policy.approve',
      extrasById: {},
    });
    const request = {
      id: 'r1',
      type: 'policy_change',
      title: 'T',
      target: 'p',
      proposer: { id: 'someone-else', name: 'X' },
      reason: 'r',
      createdAt: '',
      status: 'pending' as const,
      currentApprovers: [],
      history: [],
    };
    const reasons = resolver(request, proposer);
    expect(reasons.some((r) => r.code === 'role_insufficient')).toBe(true);
  });

  it('flags tier_mismatch on high-risk request without high_risk permission', () => {
    const resolver = buildEndpointPolicyEligibilityResolver({
      can: (action) => action === 'endpoint-admin.policy.approve',
      extrasById: { r1: { changeKind: 'update', riskTier: 'high' } },
    });
    const request = {
      id: 'r1',
      type: 'policy_change',
      title: 'T',
      target: 'p',
      proposer: { id: 'someone-else', name: 'X' },
      reason: 'r',
      createdAt: '',
      status: 'pending' as const,
      currentApprovers: [],
      history: [],
    };
    const reasons = resolver(request, proposer);
    expect(reasons.some((r) => r.code === 'tier_mismatch')).toBe(true);
  });
});
