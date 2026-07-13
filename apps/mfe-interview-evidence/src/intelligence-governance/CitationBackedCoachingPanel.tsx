import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Badge, Button, Card, Stack, Text } from '@mfe/design-system';
import { SYNTHETIC_COACHING_PROPOSAL } from './syntheticCoachingProposal';
import type {
  SyntheticCoachingCitation,
  SyntheticCoachingProposal,
} from './syntheticCoachingProposal';

const SIGNAL_LABELS = {
  OBSERVED: 'GÖZLENDİ',
  NOT_OBSERVED: 'GÖZLENMEDİ',
  INSUFFICIENT_EVIDENCE: 'KANIT YETERSİZ',
} as const;

const ACTION_BLOCK_REASON =
  'PRE-G0 sentetik proposal; insan review/rationale ve legal/audit/owner gate olmadan uygulanamaz.';

export function CitationBackedCoachingPanel({
  proposal = SYNTHETIC_COACHING_PROPOSAL,
}: {
  proposal?: SyntheticCoachingProposal;
}) {
  const citations = useMemo(
    () => proposal.suggestions.flatMap((suggestion) => suggestion.citations),
    [proposal],
  );
  const [selectedCitationRef, setSelectedCitationRef] = useState(citations[0]?.citationRef ?? '');
  const citationDetailRef = useRef<HTMLDivElement>(null);
  const selectedCitation = citations.find(
    (citation) => citation.citationRef === selectedCitationRef,
  );

  useEffect(() => {
    setSelectedCitationRef(citations[0]?.citationRef ?? '');
  }, [citations]);

  const selectCitation = (citationRef: string) => {
    setSelectedCitationRef(citationRef);
    citationDetailRef.current?.focus();
  };

  return (
    <Card variant="outlined" padding="sm">
      <Stack direction="column" gap={3} data-testid="citation-backed-coaching-panel">
        <Stack direction="row" justify="between" align="center" gap={2} wrap>
          <Stack direction="column" gap={1}>
            <Text as="h4" size="lg" weight="semibold">
              Citation-backed Coaching detail
            </Text>
            <Text as="p" size="sm" variant="secondary">
              Her öneri kendi rubric kriteri ve destekli sentetik citation ile kapanır.
            </Text>
          </Stack>
          <Stack direction="row" gap={2} wrap>
            <Badge variant="info">PROPOSAL ONLY</Badge>
            <Badge variant="warning">AI_SUGGESTED</Badge>
            <Badge variant="muted">SENTETİK</Badge>
          </Stack>
        </Stack>

        <div
          data-testid="coaching-suggestion-list"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))',
            gap: 12,
          }}
        >
          {proposal.suggestions.map((suggestion) => {
            const supported = suggestion.citations.filter(
              (citation) => citation.entailment === 'SUPPORTED',
            );
            return (
              <div key={suggestion.suggestionRef} style={{ minWidth: 0 }}>
                <Card variant="outlined" padding="sm">
                <Stack direction="column" gap={2}>
                  <Stack direction="row" justify="between" gap={2} align="start" wrap>
                    <Text as="h5" size="md" weight="semibold">
                      {suggestion.label}
                    </Text>
                    <Badge variant={supported.length > 0 ? 'success' : 'error'}>
                      {supported.length > 0
                        ? `${supported.length} SUPPORTED citation`
                        : 'KANIT YOK · AKSİYON KAPALI'}
                    </Badge>
                  </Stack>
                  <Text as="p" size="sm">
                    <strong>Rubric kriteri:</strong> {suggestion.criterionLabel}
                  </Text>
                  <Text as="p" size="xs" variant="secondary" style={REF_STYLE}>
                    {suggestion.criterionRef}
                  </Text>
                  <Stack direction="row" gap={2} wrap aria-label={`${suggestion.label} citations`}>
                    {supported.map((citation) => (
                      <button
                        key={citation.citationRef}
                        type="button"
                        aria-pressed={selectedCitationRef === citation.citationRef}
                        aria-controls="coaching-citation-detail"
                        onClick={() => selectCitation(citation.citationRef)}
                        style={CITATION_BUTTON_STYLE}
                      >
                        Citation aç · {citation.evidenceType}
                      </button>
                    ))}
                  </Stack>
                </Stack>
                </Card>
              </div>
            );
          })}
        </div>

        {selectedCitation ? (
          <CitationDetail citation={selectedCitation} detailRef={citationDetailRef} />
        ) : (
          <Card variant="outlined" padding="sm">
            <Stack direction="column" gap={1} data-testid="coaching-citation-empty-state">
              <Badge variant="error">CITATION EKSİK</Badge>
              <Text as="p" size="sm">
                Öneri gösterilebilir; fakat citation closure yoksa uygulama ve mutation kapalı kalır.
              </Text>
            </Stack>
          </Card>
        )}

        <Card variant="outlined" padding="sm">
          <Stack direction="column" gap={2} data-testid="coaching-quality-signals">
            <Text as="h5" size="md" weight="semibold">
              Structured quality signals · kategorik
            </Text>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
              {proposal.qualitySignals.map((signal) => (
                <div key={signal.signalRef} style={{ minWidth: 0 }}>
                  <Stack direction="row" gap={2} align="center" wrap>
                    <Badge variant={signal.state === 'INSUFFICIENT_EVIDENCE' ? 'warning' : 'info'}>
                      {SIGNAL_LABELS[signal.state]}
                    </Badge>
                    <Text as="span" size="sm" weight="semibold">
                      {signal.label}
                    </Text>
                  </Stack>
                  <Text as="p" size="xs" variant="secondary">
                    Oturum düzeyi · kişi profili veya sayısal puan değil
                  </Text>
                </div>
              ))}
            </div>
          </Stack>
        </Card>

        <Card variant="outlined" padding="sm">
          <Stack direction="column" gap={2} data-testid="coaching-governance-lineage">
            <Text as="h5" size="md" weight="semibold">
              Correction, appeal ve audit lineage
            </Text>
            <Text as="p" size="sm" style={REF_STYLE}>
              <strong>Appeal:</strong> {proposal.appealPathRef}
            </Text>
            <Text as="p" size="sm" style={REF_STYLE}>
              <strong>Correction:</strong> {proposal.correctionPathRef}
            </Text>
            <Text as="p" size="sm" style={REF_STYLE}>
              <strong>Audit:</strong> {proposal.auditLineageRefs.join(', ')}
            </Text>
            <Text as="p" size="sm" style={REF_STYLE}>
              <strong>AI output:</strong> {proposal.aiOutputVersionRef}
            </Text>
            <Text as="p" size="sm" style={REF_STYLE}>
              <strong>Digest:</strong> {proposal.proposalDigest}
            </Text>
          </Stack>
        </Card>

        <Stack direction="column" gap={2}>
          <Text
            as="p"
            id="coaching-action-block-reason"
            size="sm"
            variant="secondary"
            data-testid="coaching-action-block-reason"
          >
            {ACTION_BLOCK_REASON}
          </Text>
          <Stack direction="row" gap={2} wrap>
            <Button
              variant="outline"
              disabled
              accessReason={ACTION_BLOCK_REASON}
              aria-describedby="coaching-action-block-reason"
            >
              Düzeltme isteği oluştur
            </Button>
            <Button
              variant="primary"
              disabled={!proposal.actionAllowed}
              accessReason={ACTION_BLOCK_REASON}
              aria-describedby="coaching-action-block-reason"
              data-testid="coaching-apply-button"
            >
              Coaching önerisini uygula
            </Button>
          </Stack>
        </Stack>
      </Stack>
    </Card>
  );
}

function CitationDetail({
  citation,
  detailRef,
}: {
  citation: SyntheticCoachingCitation;
  detailRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={detailRef}
      id="coaching-citation-detail"
      role="region"
      tabIndex={-1}
      aria-live="polite"
      aria-label="Seçilen coaching citation detayı"
      data-testid="coaching-citation-detail"
    >
      <Card variant="outlined" padding="sm">
      <Stack
        direction="column"
        gap={2}
      >
        <Stack direction="row" gap={2} align="center" wrap>
          <Text as="h5" size="md" weight="semibold">
            Citation detayı
          </Text>
          <Badge variant="success">SUPPORTED</Badge>
          <Badge variant="muted">{citation.evidenceType}</Badge>
        </Stack>
        <Text as="p" size="sm">
          {citation.sourceExcerpt}
        </Text>
        <Text as="p" size="xs" variant="secondary" style={REF_STYLE}>
          {citation.citationRef} · {citation.sourceSegmentRef} · {citation.provenanceRef}
        </Text>
      </Stack>
      </Card>
    </div>
  );
}

const REF_STYLE = { overflowWrap: 'anywhere' } as const;

const CITATION_BUTTON_STYLE = {
  appearance: 'none',
  border: '1px solid var(--border-default)',
  borderRadius: 8,
  background: 'var(--surface-default)',
  color: 'inherit',
  padding: '0.5rem 0.625rem',
  cursor: 'pointer',
  textAlign: 'left',
} as const;
