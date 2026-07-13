export type GovernedAgenticAction =
  | 'INTERNAL_REVIEW_TASK'
  | 'EVIDENCE_FOLLOW_UP_DRAFT'
  | 'CANDIDATE_COMMUNICATION_DRAFT'
  | 'INTERVIEW_SCHEDULE_CHANGE_DRAFT';

export type GovernedAgenticState =
  | 'AI_PROPOSED'
  | 'HUMAN_REVIEW'
  | 'RETURNED_FOR_REVISION'
  | 'APPROVED_FOR_ACTION'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'EXPIRED'
  | 'SUPERSEDED';

export interface GovernedAgenticEvent {
  eventId: string;
  fromState: GovernedAgenticState | null;
  toState: GovernedAgenticState;
  actorKind: 'AGENT' | 'HUMAN' | 'SYSTEM';
  reasonLabel: string;
  occurredAt: string;
  sequence: number;
  previousEventDigest: string | null;
  eventDigest: string;
}

export interface GovernedReviewerAuthorization {
  authorizationRef: string;
  reviewerRef: string;
  tenantRef: string;
  allowedScopeRefs: readonly string[];
  allowedActionKinds: readonly GovernedAgenticAction[];
  tierCeiling: 'T1' | 'T2';
  verificationMode: 'REFERENCE_ONLY_PRE_G0';
  authorizationDigest: string;
}

export interface GovernedApprovalReceipt {
  approvalId: string;
  approvalDigest: string;
  approvedPayloadDigest: string;
  reviewOutcome: 'APPROVED_FOR_ACTION';
  approvalScope: 'SYNTHETIC_PREVIEW_ONLY';
  executionAuthority: 'NONE';
  bearerCredential: false;
  currentProposalStateCheckRequired: true;
  requiresIndependentExecutionAuthorization: true;
  executionPerformedByContract: false;
  executionEvidence: null;
  finalizedEmploymentDecision: false;
  productionEligible: false;
}

export interface GovernedExternalExecutionReceipt {
  executionId: string;
  executionReceiptDigest: string;
  approvalDigest: string;
  payloadDigest: string;
  externalSystemRef: string;
  externalEvidenceRef: string;
  observation: 'EXTERNAL_EXECUTION_RECORDED';
  executionPerformedByContract: false;
  executionAuthorityGrantedByContract: false;
}

export interface GovernedExternalRollbackReceipt {
  rollbackId: string;
  rollbackReceiptDigest: string;
  executionReceiptDigest: string;
  approvalDigest: string;
  rollbackPlanDigest: string;
  rollbackEvidenceRef: string;
  observation: 'EXTERNAL_ROLLBACK_ATTESTED';
  rollbackPerformedByContract: false;
  proposalReactivated: false;
  newExecutionAuthorityCreated: false;
}

export interface SyntheticGovernedAgenticProposal {
  schemaVersion: 'governed-agentic-proposal/v1';
  synthetic: true;
  displayLabel: string;
  tenantRef: string;
  scopeRef: string;
  proposalId: string;
  proposalDigest: string;
  actionKind: GovernedAgenticAction;
  requiredTier: 'T1' | 'T2';
  payloadRef: string;
  payloadDigest: string;
  targetResourceRef: string;
  targetResourceVersionRef: string;
  sourceEvidenceRefs: readonly string[];
  aiOutputVersionRef: string;
  policyVersionRef: string;
  rollbackPlanRef: string;
  rollbackPlanDigest: string;
  createdAt: string;
  expiresAt: string;
  state: GovernedAgenticState;
  reviewerAuthorization: GovernedReviewerAuthorization | null;
  approval: GovernedApprovalReceipt | null;
  externalExecution: GovernedExternalExecutionReceipt | null;
  externalRollback: GovernedExternalRollbackReceipt | null;
  history: readonly GovernedAgenticEvent[];
  containsRawPii: false;
  containsRawContent: false;
  containsProtectedAttributes: false;
  autoExecute: false;
  mutationAllowed: false;
  batchApproval: false;
  automatedEmploymentDecision: false;
  candidateRanking: 'DISALLOWED';
  candidateRejection: 'DISALLOWED';
  candidateHiring: 'DISALLOWED';
  evidenceGate: 'NOT_MET';
  legalGate: 'NOT_MET';
  ownerGate: 'NOT_MET';
  productionEligible: false;
}

const d = (value: string) => `sha256:${value.repeat(64)}`;

const reviewerAuthorization: GovernedReviewerAuthorization = {
  authorizationRef: 'authorization_1111111111111111',
  reviewerRef: 'reviewer_1111111111111111',
  tenantRef: 'tenant_aaaaaaaaaaaaaaaa',
  allowedScopeRefs: ['scope_bbbbbbbbbbbbbbbb'],
  allowedActionKinds: [
    'CANDIDATE_COMMUNICATION_DRAFT',
    'EVIDENCE_FOLLOW_UP_DRAFT',
    'INTERNAL_REVIEW_TASK',
    'INTERVIEW_SCHEDULE_CHANGE_DRAFT',
  ],
  tierCeiling: 'T2',
  verificationMode: 'REFERENCE_ONLY_PRE_G0',
  authorizationDigest: d('a'),
};

const base = {
  schemaVersion: 'governed-agentic-proposal/v1',
  synthetic: true,
  tenantRef: 'tenant_aaaaaaaaaaaaaaaa',
  scopeRef: 'scope_bbbbbbbbbbbbbbbb',
  targetResourceRef: 'resource_aaaaaaaaaaaaaaaa',
  targetResourceVersionRef: 'interview-workflow:synthetic:v1',
  aiOutputVersionRef: 'ai-output:agentic:synthetic-v1',
  policyVersionRef: 'policy:agentic:synthetic-v1',
  rollbackPlanRef: 'rollback_aaaaaaaaaaaaaaaa',
  rollbackPlanDigest: d('b'),
  createdAt: '2026-07-13T10:00:00.000Z',
  expiresAt: '2026-07-13T12:00:00.000Z',
  containsRawPii: false,
  containsRawContent: false,
  containsProtectedAttributes: false,
  autoExecute: false,
  mutationAllowed: false,
  batchApproval: false,
  automatedEmploymentDecision: false,
  candidateRanking: 'DISALLOWED',
  candidateRejection: 'DISALLOWED',
  candidateHiring: 'DISALLOWED',
  evidenceGate: 'NOT_MET',
  legalGate: 'NOT_MET',
  ownerGate: 'NOT_MET',
  productionEligible: false,
} as const;

const proposedEvent: GovernedAgenticEvent = {
  eventId: 'event_1111111111111111',
  fromState: null,
  toState: 'AI_PROPOSED',
  actorKind: 'AGENT',
  reasonLabel: 'Sentetik öneri oluşturuldu',
  occurredAt: '2026-07-13T10:00:00.000Z',
  sequence: 1,
  previousEventDigest: null,
  eventDigest: d('1'),
};

const reviewEvent: GovernedAgenticEvent = {
  eventId: 'event_2222222222222222',
  fromState: 'AI_PROPOSED',
  toState: 'HUMAN_REVIEW',
  actorKind: 'HUMAN',
  reasonLabel: 'Yetkili insan incelemesi açıldı',
  occurredAt: '2026-07-13T10:01:00.000Z',
  sequence: 2,
  previousEventDigest: proposedEvent.eventDigest,
  eventDigest: d('2'),
};

const approvedEvent: GovernedAgenticEvent = {
  eventId: 'event_3333333333333333',
  fromState: 'HUMAN_REVIEW',
  toState: 'APPROVED_FOR_ACTION',
  actorKind: 'HUMAN',
  reasonLabel: 'Yalnız exact payload eylem incelemesi için onaylandı',
  occurredAt: '2026-07-13T10:02:00.000Z',
  sequence: 3,
  previousEventDigest: reviewEvent.eventDigest,
  eventDigest: d('3'),
};

const approval: GovernedApprovalReceipt = {
  approvalId: 'approval_1111111111111111',
  approvalDigest: d('c'),
  approvedPayloadDigest: d('4'),
  reviewOutcome: 'APPROVED_FOR_ACTION',
  approvalScope: 'SYNTHETIC_PREVIEW_ONLY',
  executionAuthority: 'NONE',
  bearerCredential: false,
  currentProposalStateCheckRequired: true,
  requiresIndependentExecutionAuthorization: true,
  executionPerformedByContract: false,
  executionEvidence: null,
  finalizedEmploymentDecision: false,
  productionEligible: false,
};

function lineage(
  events: readonly GovernedAgenticEvent[],
  digestCharacters: readonly string[],
): readonly GovernedAgenticEvent[] {
  return events.map((event, index) => ({
    ...event,
    eventId: `event_${digestCharacters[index]?.repeat(16)}`,
    previousEventDigest: index === 0 ? null : d(digestCharacters[index - 1] ?? '0'),
    eventDigest: d(digestCharacters[index] ?? '0'),
  }));
}

export const SYNTHETIC_GOVERNED_AGENTIC_PROPOSALS: readonly SyntheticGovernedAgenticProposal[] = [
  {
    ...base,
    displayLabel: 'Kanıt takip taslağı',
    proposalId: 'proposal_1111111111111111',
    proposalDigest: d('d'),
    actionKind: 'EVIDENCE_FOLLOW_UP_DRAFT',
    requiredTier: 'T1',
    payloadRef: 'payload_1111111111111111',
    payloadDigest: d('5'),
    sourceEvidenceRefs: ['evidence_1111111111111111'],
    state: 'AI_PROPOSED',
    reviewerAuthorization: null,
    approval: null,
    externalExecution: null,
    externalRollback: null,
    history: lineage([proposedEvent], ['1']),
  },
  {
    ...base,
    displayLabel: 'Mülakat zamanlama değişikliği taslağı',
    proposalId: 'proposal_2222222222222222',
    proposalDigest: d('e'),
    actionKind: 'INTERVIEW_SCHEDULE_CHANGE_DRAFT',
    requiredTier: 'T2',
    payloadRef: 'payload_2222222222222222',
    payloadDigest: d('6'),
    sourceEvidenceRefs: ['evidence_2222222222222222'],
    state: 'HUMAN_REVIEW',
    reviewerAuthorization,
    approval: null,
    externalExecution: null,
    externalRollback: null,
    history: lineage([proposedEvent, reviewEvent], ['2', '3']),
  },
  {
    ...base,
    displayLabel: 'Aday iletişim taslağı',
    proposalId: 'proposal_3333333333333333',
    proposalDigest: d('f'),
    actionKind: 'CANDIDATE_COMMUNICATION_DRAFT',
    requiredTier: 'T2',
    payloadRef: 'payload_3333333333333333',
    payloadDigest: d('4'),
    sourceEvidenceRefs: ['evidence_3333333333333333'],
    state: 'APPROVED_FOR_ACTION',
    reviewerAuthorization,
    approval,
    externalExecution: null,
    externalRollback: null,
    history: lineage([proposedEvent, reviewEvent, approvedEvent], ['4', '5', '6']),
  },
  {
    ...base,
    displayLabel: 'Dış icra ve rollback gözlem örneği',
    proposalId: 'proposal_4444444444444444',
    proposalDigest: d('9'),
    actionKind: 'INTERNAL_REVIEW_TASK',
    requiredTier: 'T1',
    payloadRef: 'payload_4444444444444444',
    payloadDigest: d('4'),
    sourceEvidenceRefs: ['evidence_4444444444444444'],
    state: 'APPROVED_FOR_ACTION',
    reviewerAuthorization,
    approval: { ...approval, approvalId: 'approval_2222222222222222', approvalDigest: d('8') },
    externalExecution: {
      executionId: 'execution_1111111111111111',
      executionReceiptDigest: d('7'),
      approvalDigest: d('8'),
      payloadDigest: d('4'),
      externalSystemRef: 'external_1111111111111111',
      externalEvidenceRef: 'evidence_5555555555555555',
      observation: 'EXTERNAL_EXECUTION_RECORDED',
      executionPerformedByContract: false,
      executionAuthorityGrantedByContract: false,
    },
    externalRollback: {
      rollbackId: 'rollbackreceipt_1111111111111111',
      rollbackReceiptDigest: d('0'),
      executionReceiptDigest: d('7'),
      approvalDigest: d('8'),
      rollbackPlanDigest: base.rollbackPlanDigest,
      rollbackEvidenceRef: 'evidence_6666666666666666',
      observation: 'EXTERNAL_ROLLBACK_ATTESTED',
      rollbackPerformedByContract: false,
      proposalReactivated: false,
      newExecutionAuthorityCreated: false,
    },
    history: lineage(
      [
        proposedEvent,
        reviewEvent,
        approvedEvent,
        {
          eventId: 'event_4444444444444444',
          fromState: 'APPROVED_FOR_ACTION',
          toState: 'APPROVED_FOR_ACTION',
          actorKind: 'SYSTEM',
          reasonLabel: 'Dış icra kanıtı gözlem olarak kaydedildi',
          occurredAt: '2026-07-13T10:03:00.000Z',
          sequence: 4,
          previousEventDigest: approvedEvent.eventDigest,
          eventDigest: d('6'),
        },
        {
          eventId: 'event_5555555555555555',
          fromState: 'APPROVED_FOR_ACTION',
          toState: 'APPROVED_FOR_ACTION',
          actorKind: 'HUMAN',
          reasonLabel: 'Dış rollback kanıtı gözlem olarak kaydedildi',
          occurredAt: '2026-07-13T10:04:00.000Z',
          sequence: 5,
          previousEventDigest: d('6'),
          eventDigest: d('5'),
        },
      ],
      ['7', '8', '9', 'a', 'b'],
    ),
  },
] as const;

const DIGEST = /^sha256:[a-f0-9]{64}$/;

export function validateGovernedAgenticProposal(
  proposal: SyntheticGovernedAgenticProposal,
): boolean {
  if (
    proposal.schemaVersion !== 'governed-agentic-proposal/v1' ||
    !proposal.synthetic ||
    proposal.productionEligible ||
    proposal.evidenceGate !== 'NOT_MET' ||
    proposal.legalGate !== 'NOT_MET' ||
    proposal.ownerGate !== 'NOT_MET' ||
    proposal.containsRawPii ||
    proposal.containsRawContent ||
    proposal.containsProtectedAttributes ||
    proposal.autoExecute ||
    proposal.mutationAllowed ||
    proposal.batchApproval ||
    proposal.automatedEmploymentDecision ||
    proposal.candidateRanking !== 'DISALLOWED' ||
    proposal.candidateRejection !== 'DISALLOWED' ||
    proposal.candidateHiring !== 'DISALLOWED'
  ) {
    return false;
  }

  const expectedTier =
    proposal.actionKind === 'CANDIDATE_COMMUNICATION_DRAFT' ||
    proposal.actionKind === 'INTERVIEW_SCHEDULE_CHANGE_DRAFT'
      ? 'T2'
      : 'T1';
  if (proposal.requiredTier !== expectedTier) return false;
  if (
    ![proposal.proposalDigest, proposal.payloadDigest, proposal.rollbackPlanDigest].every((value) =>
      DIGEST.test(value),
    )
  ) {
    return false;
  }

  const auth = proposal.reviewerAuthorization;
  if (proposal.state === 'HUMAN_REVIEW' && !auth) return false;
  if (auth) {
    const tierValue = (tier: 'T1' | 'T2') => (tier === 'T1' ? 1 : 2);
    if (
      auth.tenantRef !== proposal.tenantRef ||
      !auth.allowedScopeRefs.includes(proposal.scopeRef) ||
      !auth.allowedActionKinds.includes(proposal.actionKind) ||
      tierValue(auth.tierCeiling) < tierValue(proposal.requiredTier) ||
      auth.verificationMode !== 'REFERENCE_ONLY_PRE_G0' ||
      !DIGEST.test(auth.authorizationDigest)
    ) {
      return false;
    }
  }
  if (proposal.state === 'APPROVED_FOR_ACTION' && !proposal.approval) return false;
  if (proposal.approval) {
    if (
      proposal.approval.approvedPayloadDigest !== proposal.payloadDigest ||
      proposal.approval.approvalScope !== 'SYNTHETIC_PREVIEW_ONLY' ||
      proposal.approval.executionAuthority !== 'NONE' ||
      proposal.approval.bearerCredential ||
      !proposal.approval.currentProposalStateCheckRequired ||
      !proposal.approval.requiresIndependentExecutionAuthorization ||
      proposal.approval.executionPerformedByContract ||
      proposal.approval.executionEvidence !== null ||
      proposal.approval.finalizedEmploymentDecision ||
      proposal.approval.productionEligible
    ) {
      return false;
    }
  }
  if (proposal.externalExecution) {
    if (
      !proposal.approval ||
      proposal.externalExecution.approvalDigest !== proposal.approval.approvalDigest ||
      proposal.externalExecution.payloadDigest !== proposal.payloadDigest ||
      proposal.externalExecution.executionPerformedByContract ||
      proposal.externalExecution.executionAuthorityGrantedByContract
    ) {
      return false;
    }
  }
  if (proposal.externalRollback) {
    if (
      !proposal.externalExecution ||
      proposal.externalRollback.executionReceiptDigest !==
        proposal.externalExecution.executionReceiptDigest ||
      proposal.externalRollback.approvalDigest !== proposal.approval?.approvalDigest ||
      proposal.externalRollback.rollbackPlanDigest !== proposal.rollbackPlanDigest ||
      proposal.externalRollback.rollbackPerformedByContract ||
      proposal.externalRollback.proposalReactivated ||
      proposal.externalRollback.newExecutionAuthorityCreated
    ) {
      return false;
    }
  }

  if (proposal.history.at(-1)?.toState !== proposal.state) return false;
  return proposal.history.every((event, index) => {
    const previous = proposal.history[index - 1];
    return (
      event.sequence === index + 1 &&
      (index === 0 ? event.fromState === null : event.fromState === previous?.toState) &&
      DIGEST.test(event.eventDigest) &&
      event.previousEventDigest === (previous?.eventDigest ?? null)
    );
  });
}

export function evaluateGovernedAgenticSurface(
  proposals: readonly SyntheticGovernedAgenticProposal[],
) {
  const proposalIds = proposals.map((proposal) => proposal.proposalId);
  const proposalDigests = proposals.map((proposal) => proposal.proposalDigest);
  const eventIds = proposals.flatMap((proposal) => proposal.history.map((event) => event.eventId));
  return {
    allBound: proposals.length > 0 && proposals.every(validateGovernedAgenticProposal),
    replaySafe:
      new Set(proposalIds).size === proposalIds.length &&
      new Set(proposalDigests).size === proposalDigests.length &&
      new Set(eventIds).size === eventIds.length,
  } as const;
}
