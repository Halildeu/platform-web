import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Badge, Button, Card, Stack, Text } from '@mfe/design-system';
import {
  SYNTHETIC_GOVERNED_AGENTIC_PROPOSALS,
  evaluateGovernedAgenticSurface,
  validateGovernedAgenticProposal,
} from './syntheticGovernedAgenticProposals';
import type {
  GovernedAgenticState,
  SyntheticGovernedAgenticProposal,
} from './syntheticGovernedAgenticProposals';

const STATE_PRESENTATION: Record<
  GovernedAgenticState,
  { label: string; variant: 'info' | 'warning' | 'success' | 'error' | 'muted' }
> = {
  AI_PROPOSED: { label: 'AI ÖNERİSİ', variant: 'info' },
  HUMAN_REVIEW: { label: 'İNSAN İNCELEMESİNDE', variant: 'warning' },
  RETURNED_FOR_REVISION: { label: 'REVİZYON İSTENDİ', variant: 'warning' },
  APPROVED_FOR_ACTION: { label: 'EYLEM İÇİN ONAYLANDI · ÇALIŞTIRILMADI', variant: 'warning' },
  REJECTED: { label: 'ÖNERİ REDDEDİLDİ', variant: 'error' },
  WITHDRAWN: { label: 'GERİ ÇEKİLDİ', variant: 'muted' },
  EXPIRED: { label: 'SÜRESİ DOLDU', variant: 'muted' },
  SUPERSEDED: { label: 'YENİ REVİZYONLA DEĞİŞTİ', variant: 'muted' },
};

const ACTION_BLOCK_REASON =
  'PRE-G0 sentetik yüzey: approval execution değildir. Trusted identity/issuer, legal, owner ve production gate kapalıdır.';

export function GovernedAgenticProposalPanel({
  proposals = SYNTHETIC_GOVERNED_AGENTIC_PROPOSALS,
}: {
  proposals?: readonly SyntheticGovernedAgenticProposal[];
}) {
  const [selectedProposalId, setSelectedProposalId] = useState(proposals[0]?.proposalId ?? '');
  const detailRef = useRef<HTMLDivElement>(null);
  const selected = proposals.find((proposal) => proposal.proposalId === selectedProposalId);
  const surface = useMemo(() => evaluateGovernedAgenticSurface(proposals), [proposals]);
  const selectedValid = selected ? validateGovernedAgenticProposal(selected) : false;

  useEffect(() => {
    setSelectedProposalId(proposals[0]?.proposalId ?? '');
  }, [proposals]);

  const selectProposal = (proposalId: string) => {
    setSelectedProposalId(proposalId);
    detailRef.current?.focus();
  };

  return (
    <Card variant="outlined" padding="sm">
      <Stack direction="column" gap={4} data-testid="governed-agentic-proposal-panel">
        <Stack direction="row" justify="between" align="start" gap={2} wrap>
          <Stack direction="column" gap={1}>
            <Text as="h4" size="lg" weight="semibold">
              Governed Agentic Proposals
            </Text>
            <Text as="p" size="sm" variant="secondary">
              Değişmez öneri, exact insan yetkisi ve ayrı dış-icra kanıtını aynı denetim yüzeyinde
              gösterir; contract hiçbir eylemi çalıştırmaz.
            </Text>
          </Stack>
          <Stack direction="row" gap={2} wrap>
            <Badge variant="warning">HUMAN APPROVAL CEILING</Badge>
            <Badge variant="error">EXECUTION AUTHORITY · NONE</Badge>
            <Badge variant="muted">PRE-G0 · SENTETİK</Badge>
            <Badge variant="error">UMBRELLA CAPABILITY KAPALI</Badge>
          </Stack>
        </Stack>

        <Card variant="outlined" padding="sm">
          <Stack direction="column" gap={2} data-testid="agentic-authority-boundary">
            <Text as="h5" size="base" weight="semibold">
              Yetki sınırı · dört ayrı gerçek
            </Text>
            <div style={RESPONSIVE_GRID_STYLE}>
              <BoundaryItem label="Öneri" value="AI taslağıdır; karar veya mutation değildir" />
              <BoundaryItem
                label="İnsan onayı"
                value="Exact payload için review outcome; FINALIZED veya bearer credential değildir"
              />
              <BoundaryItem
                label="Dış icra"
                value="Ayrı yetkilendirilmiş dış eylemin observation receipt’idir"
              />
              <BoundaryItem
                label="Rollback"
                value="Dış kanıt kaydıdır; proposal’ı yeniden aktive etmez"
              />
            </div>
          </Stack>
        </Card>

        <Stack
          direction="row"
          gap={2}
          align="center"
          wrap
          role="status"
          aria-live="polite"
          data-testid="agentic-surface-status"
        >
          <Badge variant={surface.allBound ? 'success' : 'error'}>
            {surface.allBound ? 'EXACT RECEIPT BINDINGS CONSISTENT' : 'RECEIPT BINDING FAIL-CLOSED'}
          </Badge>
          <Badge variant={surface.replaySafe ? 'success' : 'error'}>
            {surface.replaySafe ? 'PROPOSAL / EVENT REPLAY YOK' : 'REPLAY CONFLICT'}
          </Badge>
        </Stack>

        <Stack direction="column" gap={2}>
          <Text as="h5" size="base" weight="semibold">
            Sentetik proposal kuyruğu
          </Text>
          <div
            role="group"
            aria-label="Governed agentic proposal seçenekleri"
            data-testid="agentic-proposal-selector"
            style={RESPONSIVE_GRID_STYLE}
          >
            {proposals.map((proposal) => (
              <button
                key={proposal.proposalId}
                type="button"
                aria-pressed={selectedProposalId === proposal.proposalId}
                onClick={() => selectProposal(proposal.proposalId)}
                style={{
                  ...SELECTABLE_CARD_STYLE,
                  border:
                    selectedProposalId === proposal.proposalId
                      ? '2px solid var(--action-primary)'
                      : '2px solid var(--border-default)',
                }}
              >
                <Stack direction="column" gap={1}>
                  <Stack direction="row" gap={2} align="center" wrap>
                    <StateBadge state={proposal.state} />
                    <Badge variant={proposal.requiredTier === 'T2' ? 'warning' : 'info'}>
                      {proposal.requiredTier}
                    </Badge>
                  </Stack>
                  <Text as="span" size="sm" weight="semibold">
                    {proposal.displayLabel}
                  </Text>
                  <Text as="span" size="xs" variant="secondary" style={REF_STYLE}>
                    {proposal.proposalId}
                  </Text>
                </Stack>
              </button>
            ))}
          </div>
        </Stack>

        {selected && selectedValid && surface.allBound && surface.replaySafe ? (
          <ProposalDetail proposal={selected} detailRef={detailRef} />
        ) : (
          <Card variant="outlined" padding="sm">
            <Stack direction="column" gap={1} data-testid="agentic-fail-closed-state">
              <Badge variant="error">PROPOSAL FAIL-CLOSED</Badge>
              <Text as="p" size="sm">
                Exact payload, approval, execution, rollback veya audit lineage uyuşmadı; detay ve
                aksiyon yüzeyi kapatıldı.
              </Text>
            </Stack>
          </Card>
        )}

        <Card variant="outlined" padding="sm">
          <Stack direction="column" gap={2} data-testid="agentic-closed-gates">
            <Stack direction="row" gap={2} wrap>
              <Badge variant="error">EVIDENCE · NOT_MET</Badge>
              <Badge variant="error">LEGAL · NOT_MET</Badge>
              <Badge variant="error">OWNER · NOT_MET</Badge>
              <Badge variant="error">PRODUCTION · FALSE</Badge>
              <Badge variant="muted">AUTH TRUST · REFERENCE ONLY</Badge>
            </Stack>
            <Text as="p" id="agentic-action-block-reason" size="sm" variant="secondary">
              {ACTION_BLOCK_REASON}
            </Text>
            <Stack direction="row" gap={2} wrap>
              <Button
                variant="outline"
                disabled
                accessReason={ACTION_BLOCK_REASON}
                aria-describedby="agentic-action-block-reason"
              >
                İncelemeyi başlat
              </Button>
              <Button
                variant="outline"
                disabled
                accessReason={ACTION_BLOCK_REASON}
                aria-describedby="agentic-action-block-reason"
              >
                Revizyon iste
              </Button>
              <Button
                variant="outline"
                disabled
                accessReason={ACTION_BLOCK_REASON}
                aria-describedby="agentic-action-block-reason"
              >
                Öneriyi reddet · proposal only
              </Button>
              <Button
                variant="primary"
                disabled
                accessReason={ACTION_BLOCK_REASON}
                aria-describedby="agentic-action-block-reason"
                data-testid="agentic-approve-button"
              >
                Aksiyon için onayla · çalıştırmaz
              </Button>
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </Card>
  );
}

function ProposalDetail({
  proposal,
  detailRef,
}: {
  proposal: SyntheticGovernedAgenticProposal;
  detailRef: RefObject<HTMLDivElement>;
}) {
  return (
    <div
      ref={detailRef}
      tabIndex={-1}
      role="region"
      aria-live="polite"
      aria-label="Seçilen governed agentic proposal detayı"
      data-testid="agentic-proposal-detail"
    >
      <Stack direction="column" gap={3}>
        <ImmutableEnvelope proposal={proposal} />
        <ReviewerAuthorizationCard proposal={proposal} />
        <ApprovalCard proposal={proposal} />
        <ExternalObservationCard proposal={proposal} />
        <AuditTimeline proposal={proposal} />
      </Stack>
    </div>
  );
}

function ImmutableEnvelope({ proposal }: { proposal: SyntheticGovernedAgenticProposal }) {
  return (
    <Card variant="outlined" padding="sm">
      <Stack direction="column" gap={2} data-testid="agentic-immutable-envelope">
        <Stack direction="row" justify="between" align="center" gap={2} wrap>
          <Text as="h5" size="base" weight="semibold">
            Değişmez proposal envelope
          </Text>
          <Stack direction="row" gap={2} wrap>
            <StateBadge state={proposal.state} />
            <Badge variant="info">{proposal.requiredTier}</Badge>
            <Badge variant="muted">IMMUTABLE</Badge>
          </Stack>
        </Stack>
        <div style={RESPONSIVE_GRID_STYLE}>
          <ReferenceBlock label="Action" value={proposal.actionKind} />
          <ReferenceBlock
            label="Tenant / scope"
            value={`${proposal.tenantRef} · ${proposal.scopeRef}`}
          />
          <ReferenceBlock
            label="Target version"
            value={`${proposal.targetResourceRef} · ${proposal.targetResourceVersionRef}`}
          />
          <ReferenceBlock
            label="Payload"
            value={`${proposal.payloadRef} · ${proposal.payloadDigest}`}
          />
          <ReferenceBlock label="Evidence" value={proposal.sourceEvidenceRefs.join(', ')} />
          <ReferenceBlock
            label="Rollback plan"
            value={`${proposal.rollbackPlanRef} · ${proposal.rollbackPlanDigest}`}
          />
          <ReferenceBlock
            label="AI / policy version"
            value={`${proposal.aiOutputVersionRef} · ${proposal.policyVersionRef}`}
          />
          <ReferenceBlock label="TTL" value={`${proposal.createdAt} → ${proposal.expiresAt}`} />
          <ReferenceBlock label="Proposal digest" value={proposal.proposalDigest} />
        </div>
      </Stack>
    </Card>
  );
}

function ReviewerAuthorizationCard({ proposal }: { proposal: SyntheticGovernedAgenticProposal }) {
  const auth = proposal.reviewerAuthorization;
  return (
    <Card variant="outlined" padding="sm">
      <Stack direction="column" gap={2} data-testid="agentic-reviewer-authorization">
        <Stack direction="row" justify="between" align="center" gap={2} wrap>
          <Text as="h5" size="base" weight="semibold">
            İnsan reviewer yetki kapsamı
          </Text>
          <Badge variant={auth ? 'warning' : 'muted'}>
            {auth ? auth.verificationMode : 'REVIEW HENÜZ AÇILMADI'}
          </Badge>
        </Stack>
        {auth ? (
          <div style={RESPONSIVE_GRID_STYLE}>
            <ReferenceBlock
              label="Reviewer / tier ceiling"
              value={`${auth.reviewerRef} · ${auth.tierCeiling}`}
            />
            <ReferenceBlock label="Allowed scope" value={auth.allowedScopeRefs.join(', ')} />
            <ReferenceBlock label="Allowed actions" value={auth.allowedActionKinds.join(', ')} />
            <ReferenceBlock label="Authorization digest" value={auth.authorizationDigest} />
          </div>
        ) : (
          <Text as="p" size="sm" variant="secondary">
            AI önerisi vardır; insan review session ve reviewer authorization receipt henüz yoktur.
          </Text>
        )}
        <Text as="p" size="xs" variant="secondary">
          PRE-G0 ref/digest zarfı gerçek kimliği, imzayı veya issuer trust chain’ini doğruladığını
          iddia etmez.
        </Text>
      </Stack>
    </Card>
  );
}

function ApprovalCard({ proposal }: { proposal: SyntheticGovernedAgenticProposal }) {
  const approval = proposal.approval;
  return (
    <Card variant="outlined" padding="sm">
      <Stack direction="column" gap={2} data-testid="agentic-approval-receipt">
        <Stack direction="row" justify="between" align="center" gap={2} wrap>
          <Text as="h5" size="base" weight="semibold">
            İnsan approval receipt
          </Text>
          <Badge variant={approval ? 'warning' : 'muted'}>
            {approval ? 'REVIEW OUTCOME VAR' : 'APPROVAL YOK'}
          </Badge>
        </Stack>
        {approval ? (
          <>
            <Stack direction="row" gap={2} wrap>
              <Badge variant="warning">APPROVED_FOR_ACTION · ÇALIŞTIRILMADI</Badge>
              <Badge variant="error">EXECUTION AUTHORITY · NONE</Badge>
              <Badge variant="error">BEARER CREDENTIAL · FALSE</Badge>
              <Badge variant="warning">CURRENT STATE CHECK REQUIRED</Badge>
            </Stack>
            <div style={RESPONSIVE_GRID_STYLE}>
              <ReferenceBlock
                label="Approval"
                value={`${approval.approvalId} · ${approval.approvalDigest}`}
              />
              <ReferenceBlock label="Exact payload" value={approval.approvedPayloadDigest} />
              <ReferenceBlock label="Scope" value={approval.approvalScope} />
              <ReferenceBlock
                label="Independent execution authorization"
                value={approval.requiresIndependentExecutionAuthorization ? 'REQUIRED' : 'MISSING'}
              />
            </div>
            <Text as="p" size="sm" variant="secondary">
              Bu tarihsel receipt FINALIZED değildir. Proposal sonradan geri çekilir veya süresi
              dolarsa downstream güncel state’i ayrıca kontrol etmek zorundadır.
            </Text>
          </>
        ) : (
          <Text as="p" size="sm" variant="secondary">
            Proposal state’i insan approval sonucu taşımıyor; execution ve mutation kapalıdır.
          </Text>
        )}
      </Stack>
    </Card>
  );
}

function ExternalObservationCard({ proposal }: { proposal: SyntheticGovernedAgenticProposal }) {
  const execution = proposal.externalExecution;
  const rollback = proposal.externalRollback;
  return (
    <Card variant="outlined" padding="sm">
      <Stack direction="column" gap={2} data-testid="agentic-external-observations">
        <Text as="h5" size="base" weight="semibold">
          Dış icra ve rollback gözlemleri
        </Text>
        <div style={RESPONSIVE_GRID_STYLE}>
          <ObservationBlock
            title="Dış icra"
            status={execution ? 'EXTERNAL_EXECUTION_RECORDED' : 'KAYIT YOK'}
            detail={
              execution
                ? `${execution.executionId} · ${execution.externalSystemRef} · ${execution.externalEvidenceRef}`
                : 'Approval olsa bile execution otomatik varsayılmaz.'
            }
          />
          <ObservationBlock
            title="Dış rollback"
            status={rollback ? 'EXTERNAL_ROLLBACK_ATTESTED' : 'KAYIT YOK'}
            detail={
              rollback
                ? `${rollback.rollbackId} · ${rollback.rollbackEvidenceRef}`
                : 'Execution kaydı yoksa rollback receipt oluşamaz.'
            }
          />
        </div>
        <Stack direction="row" gap={2} wrap>
          <Badge variant="error">CONTRACT EXECUTION · FALSE</Badge>
          <Badge variant="error">CONTRACT ROLLBACK · FALSE</Badge>
          <Badge variant="muted">PROPOSAL REACTIVATED · FALSE</Badge>
        </Stack>
      </Stack>
    </Card>
  );
}

function AuditTimeline({ proposal }: { proposal: SyntheticGovernedAgenticProposal }) {
  return (
    <Card variant="outlined" padding="sm">
      <Stack direction="column" gap={2} data-testid="agentic-audit-timeline">
        <Text as="h5" size="base" weight="semibold">
          Append-only audit timeline
        </Text>
        <ol style={{ margin: 0, paddingInlineStart: '1.25rem' }}>
          {proposal.history.map((event) => (
            <li key={event.eventId} style={{ marginBlockEnd: '0.75rem' }}>
              <Stack direction="column" gap={1}>
                <Stack direction="row" gap={2} align="center" wrap>
                  <Badge variant="muted">#{event.sequence}</Badge>
                  <StateBadge state={event.toState} />
                  <Badge variant="info">{event.actorKind}</Badge>
                </Stack>
                <Text as="span" size="sm">
                  {event.reasonLabel}
                </Text>
                <Text as="span" size="xs" variant="secondary" style={REF_STYLE}>
                  {event.eventId} · prev {event.previousEventDigest ?? 'GENESIS'} ·{' '}
                  {event.eventDigest}
                </Text>
              </Stack>
            </li>
          ))}
        </ol>
      </Stack>
    </Card>
  );
}

function BoundaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <Text as="p" size="sm" weight="semibold">
        {label}
      </Text>
      <Text as="p" size="sm" variant="secondary">
        {value}
      </Text>
    </div>
  );
}

function ReferenceBlock({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <Text as="p" size="xs" variant="secondary">
        {label}
      </Text>
      <Text as="p" size="sm" weight="semibold" style={REF_STYLE}>
        {value}
      </Text>
    </div>
  );
}

function ObservationBlock({
  title,
  status,
  detail,
}: {
  title: string;
  status: string;
  detail: string;
}) {
  return (
    <Card variant="outlined" padding="sm">
      <Stack direction="column" gap={1}>
        <Text as="h6" size="sm" weight="semibold">
          {title}
        </Text>
        <Badge variant={status === 'KAYIT YOK' ? 'muted' : 'info'}>{status}</Badge>
        <Text as="p" size="xs" variant="secondary" style={REF_STYLE}>
          {detail}
        </Text>
      </Stack>
    </Card>
  );
}

function StateBadge({ state }: { state: GovernedAgenticState }) {
  const presentation = STATE_PRESENTATION[state];
  return <Badge variant={presentation.variant}>{presentation.label}</Badge>;
}

const RESPONSIVE_GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(230px, 100%), 1fr))',
  gap: 12,
} as const;

const SELECTABLE_CARD_STYLE = {
  appearance: 'none',
  borderRadius: 12,
  background: 'var(--surface-default)',
  color: 'inherit',
  padding: '0.875rem',
  textAlign: 'left',
  cursor: 'pointer',
  minWidth: 0,
  font: 'inherit',
} as const;

const REF_STYLE = { overflowWrap: 'anywhere' } as const;
