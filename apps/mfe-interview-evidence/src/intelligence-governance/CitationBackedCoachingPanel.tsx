import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Badge, Button, Card, Stack, Text } from '@mfe/design-system';
import {
  resolveSyntheticCoachingSource,
  SYNTHETIC_COACHING_SOURCE,
  verifyCanonicalCoachingDigest,
} from './syntheticCoachingProposal';
import type {
  SyntheticCoachingCitation,
  SyntheticCoachingSourceEnvelope,
} from './syntheticCoachingProposal';

const SIGNAL_LABELS = {
  OBSERVED: 'GÖZLENDİ',
  NOT_OBSERVED: 'GÖZLENMEDİ',
  INSUFFICIENT_EVIDENCE: 'KANIT YETERSİZ',
} as const;

const ACTION_BLOCK_REASON =
  'PRE-G0 sentetik proposal; insan review/rationale ve legal/audit/owner gate olmadan uygulanamaz.';

const SOURCE_BLOCK_REASON =
  'Canonical ATS sözleşmesi ve içerik digest’i doğrulanmadı; öneriler gösterilmez, uygulama ve mutation kapalı kalır.';

type DigestStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export function CitationBackedCoachingPanel({
  source = SYNTHETIC_COACHING_SOURCE,
}: {
  source?: SyntheticCoachingSourceEnvelope;
}) {
  const resolution = useMemo(() => resolveSyntheticCoachingSource(source), [source]);
  const [digestStatus, setDigestStatus] = useState<DigestStatus>('PENDING');

  useEffect(() => {
    let active = true;
    if (resolution.status === 'REJECTED') {
      setDigestStatus('REJECTED');
      return () => {
        active = false;
      };
    }
    setDigestStatus('PENDING');
    void verifyCanonicalCoachingDigest(resolution.receipt).then((verified) => {
      if (active) setDigestStatus(verified ? 'VERIFIED' : 'REJECTED');
    });
    return () => {
      active = false;
    };
  }, [resolution]);

  const proposal =
    resolution.status === 'VALIDATED' && digestStatus === 'VERIFIED' ? resolution.proposal : null;
  const citations = useMemo(
    () => proposal?.suggestions.flatMap((suggestion) => suggestion.citations) ?? [],
    [proposal],
  );
  const [selectedCitationRef, setSelectedCitationRef] = useState('');
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

  const rejectionReason =
    resolution.status === 'REJECTED'
      ? resolution.reasonCode
      : digestStatus === 'REJECTED'
        ? 'PROPOSAL_DIGEST_MISMATCH_OR_CRYPTO_UNAVAILABLE'
        : null;
  const actionBlockReason = proposal ? ACTION_BLOCK_REASON : SOURCE_BLOCK_REASON;
  const archivalWindowExpired = proposal ? Date.now() >= Date.parse(proposal.expiresAt) : false;

  return (
    <Card variant="outlined" padding="sm">
      <Stack direction="column" gap={3} data-testid="citation-backed-coaching-panel">
        <Stack direction="row" justify="between" align="center" gap={2} wrap>
          <Stack direction="column" gap={1}>
            <Text as="h4" size="lg" weight="semibold">
              Citation-backed Coaching detail
            </Text>
            <Text as="p" size="sm" variant="secondary">
              Yalnız canonical ATS sözleşmesine, izinli kanıta ve içerik digest’ine bağlanan
              öneriler gösterilir.
            </Text>
          </Stack>
          <Stack direction="row" gap={2} wrap>
            <Badge variant="info">PROPOSAL ONLY</Badge>
            <Badge variant="warning">AI_SUGGESTED</Badge>
            <Badge variant="muted">ARŞİV SENTETİK</Badge>
            {proposal ? (
              <Badge variant="success">PINNED PROFILE + DIGEST VERIFIED</Badge>
            ) : digestStatus === 'PENDING' ? (
              <Badge variant="warning">KAYNAK DOĞRULANIYOR</Badge>
            ) : (
              <Badge variant="error">KAYNAK REDDEDİLDİ</Badge>
            )}
            {archivalWindowExpired ? (
              <Badge variant="warning">ARCHIVAL WINDOW EXPIRED</Badge>
            ) : null}
          </Stack>
        </Stack>

        {proposal ? (
          <div
            data-testid="coaching-suggestion-list"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))',
              gap: 12,
            }}
          >
            {proposal.suggestions.map((suggestion) => (
              <div
                key={suggestion.suggestionRef}
                data-testid="coaching-suggestion"
                data-suggestion-ref={suggestion.suggestionRef}
                style={{ minWidth: 0 }}
              >
                <Card variant="outlined" padding="sm">
                  <Stack direction="column" gap={2}>
                    <Stack direction="row" justify="between" gap={2} align="start" wrap>
                      <Text as="h5" size="base" weight="semibold">
                        {suggestion.label}
                      </Text>
                      <Badge variant="success">
                        {suggestion.citations.length} SUPPORTED citation
                      </Badge>
                    </Stack>
                    <Text as="p" size="sm">
                      <strong>Rubric kriteri:</strong> {suggestion.criterionLabel}
                    </Text>
                    <Text as="p" size="xs" variant="secondary" style={REF_STYLE}>
                      {suggestion.criterionRef} · {suggestion.templateRef}
                    </Text>
                    <Stack
                      direction="row"
                      gap={2}
                      wrap
                      aria-label={`${suggestion.label} citations`}
                    >
                      {suggestion.citations.map((citation) => (
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
            ))}
          </div>
        ) : (
          <Card variant="outlined" padding="sm">
            <Stack
              direction="column"
              gap={1}
              role="alert"
              data-testid="coaching-source-rejected-state"
            >
              <Badge variant={digestStatus === 'PENDING' ? 'warning' : 'error'}>
                {digestStatus === 'PENDING' ? 'DOĞRULAMA BEKLENİYOR' : 'ÖNERİLER GİZLENDİ'}
              </Badge>
              <Text as="p" size="sm">
                {SOURCE_BLOCK_REASON}
              </Text>
              {rejectionReason ? (
                <Text as="p" size="xs" variant="secondary" style={REF_STYLE}>
                  Güvenli hata kodu: {rejectionReason}
                </Text>
              ) : null}
            </Stack>
          </Card>
        )}

        {proposal && selectedCitation ? (
          <CitationDetail citation={selectedCitation} detailRef={citationDetailRef} />
        ) : null}

        {proposal ? (
          <>
            <Card variant="outlined" padding="sm">
              <Stack direction="column" gap={2} data-testid="coaching-quality-signals">
                <Text as="h5" size="base" weight="semibold">
                  Structured quality signals · kategorik
                </Text>
                <div
                  data-testid="coaching-quality-signal-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))',
                    gap: 8,
                    minWidth: 0,
                  }}
                >
                  {proposal.qualitySignals.map((signal) => (
                    <div key={signal.signalRef} style={{ minWidth: 0 }}>
                      <Stack direction="row" gap={2} align="center" wrap>
                        <Badge
                          variant={signal.state === 'INSUFFICIENT_EVIDENCE' ? 'warning' : 'info'}
                        >
                          {SIGNAL_LABELS[signal.state]}
                        </Badge>
                        <Text as="span" size="sm" weight="semibold">
                          {signal.label}
                        </Text>
                      </Stack>
                      <Text as="p" size="xs" variant="secondary">
                        Oturum düzeyi · kişi profili veya sayısal puan değil
                      </Text>
                      <Text as="p" size="xs" variant="secondary" style={REF_STYLE}>
                        Kanıt: {signal.citationRefs.join(', ')}
                      </Text>
                    </div>
                  ))}
                </div>
              </Stack>
            </Card>

            <Card variant="outlined" padding="sm">
              <Stack direction="column" gap={2} data-testid="coaching-governance-lineage">
                <Text as="h5" size="base" weight="semibold">
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
                <Text as="p" size="sm" style={REF_STYLE}>
                  <strong>Arşiv receipt window:</strong> {proposal.createdAt} → {proposal.expiresAt}
                  {archivalWindowExpired
                    ? ' · EXPIRED — yalnız arşiv demo; canlı freshness için geçersiz'
                    : ' · arşiv penceresi içinde'}
                </Text>
                <Text as="p" size="xs" variant="secondary" style={REF_STYLE}>
                  <strong>Canonical contract:</strong> {proposal.contractRef} ·{' '}
                  {proposal.contractSha256}
                </Text>
                <Text as="p" size="xs" variant="secondary">
                  Yerel pinned contract profili ve içerik bütünlüğü doğrulandı; bu rozet ATS kaynak
                  deposunun imzası, canlı freshness veya production authenticity kanıtı değildir.
                </Text>
              </Stack>
            </Card>
          </>
        ) : null}

        <Stack direction="column" gap={2}>
          <Text
            as="p"
            id="coaching-action-block-reason"
            size="sm"
            variant="secondary"
            data-testid="coaching-action-block-reason"
          >
            {actionBlockReason}
          </Text>
          <Stack direction="row" gap={2} wrap>
            <Button
              variant="outline"
              disabled
              accessReason={actionBlockReason}
              aria-describedby="coaching-action-block-reason"
              style={RESPONSIVE_ACTION_BUTTON_STYLE}
            >
              Düzeltme isteği oluştur
            </Button>
            <Button
              variant="primary"
              disabled
              accessReason={actionBlockReason}
              aria-describedby="coaching-action-block-reason"
              data-testid="coaching-apply-button"
              style={RESPONSIVE_ACTION_BUTTON_STYLE}
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
  detailRef: RefObject<HTMLDivElement>;
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
        <Stack direction="column" gap={2}>
          <Stack direction="row" gap={2} align="center" wrap>
            <Text as="h5" size="base" weight="semibold">
              Citation detayı
            </Text>
            <Badge variant="success">{citation.entailment}</Badge>
            <Badge variant="muted">{citation.evidenceType}</Badge>
          </Stack>
          <Text as="p" size="sm">
            {citation.sourceExcerpt}
          </Text>
          <Text as="p" size="xs" variant="secondary" style={REF_STYLE}>
            {citation.evidenceRef} · {citation.citationRef} · {citation.criterionRef} ·{' '}
            {citation.sourceSegmentRefs.join(', ')} · {citation.provenanceRef}
          </Text>
        </Stack>
      </Card>
    </div>
  );
}

const REF_STYLE = { overflowWrap: 'anywhere' } as const;

const RESPONSIVE_ACTION_BUTTON_STYLE = {
  minWidth: 0,
  maxWidth: '100%',
  height: 'auto',
  minHeight: '2.25rem',
  paddingBlock: '0.5rem',
  whiteSpace: 'normal',
  overflowWrap: 'anywhere',
  textAlign: 'center',
} as const;

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
