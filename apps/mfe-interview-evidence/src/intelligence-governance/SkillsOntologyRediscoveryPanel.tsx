import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Badge, Button, Card, Stack, Text } from '@mfe/design-system';
import {
  SYNTHETIC_SKILL_CITATION_REGISTRY,
  SYNTHETIC_SKILL_LABEL_REGISTRY,
  SYNTHETIC_SKILLS_ONTOLOGY_SURFACE,
} from './syntheticSkillsOntology';
import type {
  SyntheticOntologyConcept,
  SyntheticSkillEvidence,
  SyntheticSkillsOntologySurface,
} from './syntheticSkillsOntology';

const ACTION_BLOCK_REASON =
  'PRE-G0 sentetik ve sırasız proposal; insan review/rationale ile legal, bağımsız-audit ve owner gate olmadan uygulanamaz, dışa aktarılamaz veya kişiye aksiyon üretemez.';

export function SkillsOntologyRediscoveryPanel({
  surface = SYNTHETIC_SKILLS_ONTOLOGY_SURFACE,
  labelRegistry = SYNTHETIC_SKILL_LABEL_REGISTRY,
  citationRegistry = SYNTHETIC_SKILL_CITATION_REGISTRY,
}: {
  surface?: SyntheticSkillsOntologySurface;
  labelRegistry?: Readonly<Record<string, string>>;
  citationRegistry?: Readonly<Record<string, string>>;
}) {
  const initialConceptRef = surface.release.concepts[0]?.conceptRef ?? '';
  const [selectedConceptRef, setSelectedConceptRef] = useState(initialConceptRef);
  const evidenceForSelectedConcept = useMemo(
    () =>
      surface.mappingProposal.evidenceInventory.filter(
        (evidence) => evidence.conceptRef === selectedConceptRef,
      ),
    [selectedConceptRef, surface.mappingProposal.evidenceInventory],
  );
  const [selectedEvidenceRef, setSelectedEvidenceRef] = useState(
    evidenceForSelectedConcept[0]?.evidenceRef ?? '',
  );
  const evidenceDetailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nextConceptRef = surface.release.concepts[0]?.conceptRef ?? '';
    setSelectedConceptRef(nextConceptRef);
    setSelectedEvidenceRef(
      surface.mappingProposal.evidenceInventory.find(
        (evidence) => evidence.conceptRef === nextConceptRef,
      )?.evidenceRef ?? '',
    );
  }, [surface]);

  const selectedConcept = surface.release.concepts.find(
    (concept) => concept.conceptRef === selectedConceptRef,
  );
  const selectedEvidence = evidenceForSelectedConcept.find(
    (evidence) => evidence.evidenceRef === selectedEvidenceRef,
  );
  const activeMatches = surface.rediscoveryProposal.matches.filter(
    (match) => match.traceStatus === 'TRACE_CURRENT' && isCurrentMatchBound(match, surface),
  );
  const rejectedCurrentMatchCount = surface.rediscoveryProposal.matches.filter(
    (match) => match.traceStatus === 'TRACE_CURRENT' && !isCurrentMatchBound(match, surface),
  ).length;
  const invalidatedMatches = surface.rediscoveryProposal.matches.filter(
    (match) => match.traceStatus === 'TRACE_INVALIDATED_BY_TOMBSTONE',
  );
  const surfaceChecks = evaluateSurface(surface);

  const selectConcept = (concept: SyntheticOntologyConcept) => {
    setSelectedConceptRef(concept.conceptRef);
    setSelectedEvidenceRef(
      surface.mappingProposal.evidenceInventory.find(
        (evidence) => evidence.conceptRef === concept.conceptRef,
      )?.evidenceRef ?? '',
    );
  };

  const selectEvidence = (evidenceRef: string) => {
    setSelectedEvidenceRef(evidenceRef);
    evidenceDetailRef.current?.focus();
  };

  return (
    <Card variant="outlined" padding="sm">
      <Stack direction="column" gap={4} data-testid="skills-ontology-rediscovery-panel">
        <Stack direction="row" justify="between" align="start" gap={2} wrap>
          <Stack direction="column" gap={1}>
            <Text as="h4" size="lg" weight="semibold">
              Versioned Skills Ontology &amp; Talent Rediscovery
            </Text>
            <Text as="p" size="sm" variant="secondary">
              Sürümlü kavramları exact citation lineage ile bağlar; sonuç sırası puan veya öncelik
              değildir.
            </Text>
          </Stack>
          <Stack direction="row" gap={2} wrap>
            <Badge variant="info">PROPOSAL ONLY</Badge>
            <Badge variant="warning">AI_SUGGESTED</Badge>
            <Badge variant="muted">SENTETİK</Badge>
            <Badge variant="error">UNORDERED · RANKING YOK</Badge>
          </Stack>
        </Stack>

        <ReleaseLineageCard surface={surface} />

        <Card variant="outlined" padding="sm">
          <Stack direction="row" gap={2} align="center" wrap data-testid="skills-binding-status">
            <Badge variant={surfaceChecks.releaseBound ? 'success' : 'error'}>
              {surfaceChecks.releaseBound ? 'MAPPING RELEASE BOUND' : 'MAPPING RELEASE MISMATCH'}
            </Badge>
            <Badge variant={surfaceChecks.currentMatchesBound ? 'success' : 'error'}>
              {surfaceChecks.currentMatchesBound
                ? 'REDISCOVERY EXACT TRACE BOUND'
                : 'REDISCOVERY TRACE FAIL-CLOSED'}
            </Badge>
            {rejectedCurrentMatchCount > 0 && (
              <Badge variant="error">{rejectedCurrentMatchCount} TRACE REDDEDİLDİ</Badge>
            )}
          </Stack>
        </Card>

        <Stack direction="column" gap={2}>
          <Stack direction="row" justify="between" align="center" gap={2} wrap>
            <Text as="h5" size="base" weight="semibold">
              Ontology kavramları · label registry
            </Text>
            <Badge variant="muted">Serbest label yok</Badge>
          </Stack>
          <div
            role="group"
            aria-label="Skills ontology kavramları"
            data-testid="skills-concept-list"
            style={RESPONSIVE_GRID_STYLE}
          >
            {surface.release.concepts.map((concept) => (
              <button
                key={concept.conceptRef}
                type="button"
                aria-pressed={selectedConceptRef === concept.conceptRef}
                onClick={() => selectConcept(concept)}
                style={{
                  ...SELECTABLE_CARD_STYLE,
                  border:
                    selectedConceptRef === concept.conceptRef
                      ? '2px solid var(--action-primary)'
                      : '1px solid var(--border-default)',
                }}
              >
                <Stack direction="column" gap={1}>
                  <Text as="span" weight="semibold">
                    {labelRegistry[concept.labelRef] ?? 'LABEL REF ÇÖZÜLEMEDİ'}
                  </Text>
                  <Text as="span" size="xs" variant="secondary" style={REF_STYLE}>
                    {concept.labelRef} · {concept.labelLocale}
                  </Text>
                  <Text as="span" size="xs" variant="secondary" style={REF_STYLE}>
                    {concept.conceptRef}
                  </Text>
                  <Badge variant={concept.deprecated ? 'error' : 'success'}>
                    {concept.deprecated ? 'DEPRECATED · YENİ EŞLEME YOK' : 'AKTİF KAVRAM'}
                  </Badge>
                </Stack>
              </button>
            ))}
          </div>
        </Stack>

        {selectedConcept && (
          <MappingEvidenceCard
            concept={selectedConcept}
            surface={surface}
            evidence={evidenceForSelectedConcept}
            selectedEvidence={selectedEvidence}
            citationRegistry={citationRegistry}
            detailRef={evidenceDetailRef}
            onSelectEvidence={selectEvidence}
          />
        )}

        <ConsentPurposeCard surface={surface} checks={surfaceChecks} />

        <Stack direction="column" gap={2} data-testid="skills-rediscovery-results">
          <Stack direction="row" justify="between" align="center" gap={2} wrap>
            <Text as="h5" size="base" weight="semibold">
              Talent rediscovery önerileri
            </Text>
            <Badge variant="info">{activeMatches.length} CURRENT · DISPLAY ORDER UNSPECIFIED</Badge>
          </Stack>
          <Text as="p" size="sm" variant="secondary">
            Kartların görsel sırası relevance, score, confidence veya işe-alım önceliği değildir.
          </Text>
          {activeMatches.length > 0 ? (
            <div style={RESPONSIVE_GRID_STYLE}>
              {activeMatches.map((match) => (
                <Card key={match.matchRef} variant="outlined" padding="sm">
                  <Stack direction="column" gap={2}>
                    <Stack direction="row" justify="between" align="start" gap={2} wrap>
                      <Text as="span" weight="semibold">
                        Eşleşme önerisi
                      </Text>
                      <Badge variant="success">TRACE CURRENT</Badge>
                    </Stack>
                    <ReferenceLine label="Subject" value={match.subjectRef} />
                    <ReferenceLine label="Concept" value={match.conceptRef} />
                    <ReferenceLine
                      label="Source proposal"
                      value={`${match.sourceProposalId} · ${match.sourceProposalDigest}`}
                    />
                    <ReferenceLine
                      label="Evidence / citation"
                      value={`${match.evidenceRef} · ${match.citationRef} · ${match.evidenceEntailment}`}
                    />
                    <ReferenceLine
                      label="Exact release"
                      value={`${match.ontologyReleaseRef} · ${match.ontologyReleaseVersion} · ${match.ontologyReleaseDigest}`}
                    />
                  </Stack>
                </Card>
              ))}
            </div>
          ) : (
            <Card variant="outlined" padding="sm">
              <Stack direction="column" gap={1} data-testid="skills-rediscovery-empty-state">
                <Badge variant="error">CURRENT TRACE YOK</Badge>
                <Text as="p" size="sm">
                  Exact evidence veya consent closure yoksa rediscovery önerisi gösterilmez.
                </Text>
              </Stack>
            </Card>
          )}
        </Stack>

        <Card variant="outlined" padding="sm">
          <Stack direction="column" gap={2} data-testid="skills-tombstone-audit">
            <Stack direction="row" justify="between" align="center" gap={2} wrap>
              <Text as="h5" size="base" weight="semibold">
                Tombstone ve historical trace
              </Text>
              <Badge variant={invalidatedMatches.length > 0 ? 'error' : 'muted'}>
                {invalidatedMatches.length} INVALIDATED
              </Badge>
            </Stack>
            <Text as="p" size="sm" variant="secondary">
              Geçersizleşmiş historical receipt current sonuç listesine dönemez ve yeniden aksiyon
              kaynağı olamaz.
            </Text>
            {invalidatedMatches.map((match) => (
              <div key={match.matchRef} style={AUDIT_ROW_STYLE}>
                <Badge variant="error">TRACE INVALIDATED BY TOMBSTONE</Badge>
                <Text as="span" size="xs" variant="secondary" style={REF_STYLE}>
                  {match.sourceProposalId} · {match.sourceProposalDigest} · {match.citationRef}
                </Text>
              </div>
            ))}
          </Stack>
        </Card>

        <Card variant="outlined" padding="sm">
          <Stack direction="column" gap={2} data-testid="skills-governance-lineage">
            <Text as="h5" size="base" weight="semibold">
              Appeal, correction ve audit sınırı
            </Text>
            <ReferenceLine label="Appeal" value={surface.rediscoveryProposal.appealPathRef} />
            <ReferenceLine
              label="Correction"
              value={surface.rediscoveryProposal.correctionPathRef}
            />
            <ReferenceLine label="Tombstone" value={surface.rediscoveryProposal.tombstonePathRef} />
            <ReferenceLine
              label="Rediscovery digest"
              value={surface.rediscoveryProposal.proposalDigest}
            />
          </Stack>
        </Card>

        <Stack direction="column" gap={2}>
          <Text
            as="p"
            id="skills-action-block-reason"
            size="sm"
            variant="secondary"
            data-testid="skills-action-block-reason"
          >
            {ACTION_BLOCK_REASON}
          </Text>
          <Stack direction="row" gap={2} wrap>
            <Button
              variant="outline"
              disabled
              accessReason={ACTION_BLOCK_REASON}
              aria-describedby="skills-action-block-reason"
            >
              Düzeltme isteği oluştur
            </Button>
            <Button
              variant="outline"
              disabled
              accessReason={ACTION_BLOCK_REASON}
              aria-describedby="skills-action-block-reason"
            >
              Sonucu dışa aktar
            </Button>
            <Button
              variant="primary"
              disabled={!surfaceChecks.actionAllowed}
              accessReason={ACTION_BLOCK_REASON}
              aria-describedby="skills-action-block-reason"
              data-testid="skills-apply-button"
            >
              Rediscovery önerisini uygula
            </Button>
          </Stack>
        </Stack>
      </Stack>
    </Card>
  );
}

function ReleaseLineageCard({ surface }: { surface: SyntheticSkillsOntologySurface }) {
  const { release } = surface;
  return (
    <Card variant="outlined" padding="sm">
      <Stack direction="column" gap={2} data-testid="skills-release-lineage">
        <Stack direction="row" justify="between" align="center" gap={2} wrap>
          <Text as="h5" size="base" weight="semibold">
            Immutable release lineage
          </Text>
          <Stack direction="row" gap={2} wrap>
            <Badge variant="success">IMMUTABLE</Badge>
            <Badge variant="info">{release.digestAlgorithm}</Badge>
            <Badge variant="muted">{release.schemaVersion}</Badge>
          </Stack>
        </Stack>
        <div style={RESPONSIVE_GRID_STYLE}>
          <ReferenceLine
            label="Release"
            value={`${release.releaseRef} · ${release.releaseVersion}`}
          />
          <ReferenceLine label="Digest" value={release.releaseDigest} />
          <ReferenceLine
            label="Supersedes"
            value={`${release.supersedesReleaseRef} · ${release.supersedesReleaseDigest}`}
          />
          <ReferenceLine
            label="Source"
            value={`${release.sourceKind} · ${release.sourceVersion} · ${release.sourceUriRef}`}
          />
          <ReferenceLine label="License" value={`${release.licenseKind} · ${release.licenseRef}`} />
          <ReferenceLine label="Provenance" value={release.provenanceChainRef} />
        </div>
      </Stack>
    </Card>
  );
}

function MappingEvidenceCard({
  concept,
  surface,
  evidence,
  selectedEvidence,
  citationRegistry,
  detailRef,
  onSelectEvidence,
}: {
  concept: SyntheticOntologyConcept;
  surface: SyntheticSkillsOntologySurface;
  evidence: readonly SyntheticSkillEvidence[];
  selectedEvidence: SyntheticSkillEvidence | undefined;
  citationRegistry: Readonly<Record<string, string>>;
  detailRef: RefObject<HTMLDivElement>;
  onSelectEvidence: (evidenceRef: string) => void;
}) {
  return (
    <Card variant="outlined" padding="sm">
      <Stack direction="column" gap={3} data-testid="skills-mapping-evidence">
        <Stack direction="row" justify="between" align="center" gap={2} wrap>
          <Text as="h5" size="base" weight="semibold">
            Evidence-bound skill mapping
          </Text>
          <Badge variant={evidence.length > 0 ? 'success' : 'error'}>
            {evidence.length > 0 ? `${evidence.length} SUPPORTED CITATION` : 'KANIT YOK'}
          </Badge>
        </Stack>
        <ReferenceLine label="Concept" value={concept.conceptRef} />
        <ReferenceLine
          label="Mapping proposal"
          value={`${surface.mappingProposal.proposalId} · ${surface.mappingProposal.proposalDigest}`}
        />
        <Stack direction="row" gap={2} wrap aria-label="Skill mapping citations">
          {evidence.map((item) => (
            <button
              key={item.evidenceRef}
              type="button"
              aria-pressed={selectedEvidence?.evidenceRef === item.evidenceRef}
              aria-controls="skills-citation-detail"
              onClick={() => onSelectEvidence(item.evidenceRef)}
              style={CITATION_BUTTON_STYLE}
            >
              Citation aç · {item.evidenceType}
            </button>
          ))}
        </Stack>
        {selectedEvidence ? (
          <div
            ref={detailRef}
            id="skills-citation-detail"
            role="region"
            tabIndex={-1}
            aria-live="polite"
            aria-label="Seçilen skill citation exact lineage detayı"
            data-testid="skills-citation-detail"
          >
            <Card variant="outlined" padding="sm">
              <Stack direction="column" gap={2}>
                <Stack direction="row" align="center" gap={2} wrap>
                  <Text as="span" weight="semibold">
                    Exact citation closure
                  </Text>
                  <Badge variant="success">{selectedEvidence.entailment}</Badge>
                  <Badge variant="muted">{selectedEvidence.evidenceType}</Badge>
                </Stack>
                <Text as="p" size="sm">
                  {citationRegistry[selectedEvidence.citationRef] ??
                    'Sentetik citation display kaydı çözülemedi; aksiyon kapalı.'}
                </Text>
                <ReferenceLine
                  label="Evidence / citation"
                  value={`${selectedEvidence.evidenceRef} · ${selectedEvidence.citationRef}`}
                />
                <ReferenceLine
                  label="Subject / concept"
                  value={`${selectedEvidence.subjectRef} · ${selectedEvidence.conceptRef}`}
                />
                <ReferenceLine
                  label="Release"
                  value={`${selectedEvidence.ontologyReleaseRef} · ${selectedEvidence.ontologyReleaseVersion} · ${selectedEvidence.ontologyReleaseDigest}`}
                />
                <ReferenceLine
                  label="Source / provenance"
                  value={`${selectedEvidence.sourceSegmentRef} · ${selectedEvidence.provenanceRef}`}
                />
              </Stack>
            </Card>
          </div>
        ) : (
          <Stack direction="column" gap={1} data-testid="skills-citation-empty-state">
            <Badge variant="error">EXACT CITATION YOK · AKSİYON KAPALI</Badge>
            <Text as="p" size="sm">
              Concept yalnız görünür; evidence closure oluşmadan rediscovery kaynağı olamaz.
            </Text>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

function ConsentPurposeCard({
  surface,
  checks,
}: {
  surface: SyntheticSkillsOntologySurface;
  checks: ReturnType<typeof evaluateSurface>;
}) {
  const proposal = surface.rediscoveryProposal;
  return (
    <Card variant="outlined" padding="sm">
      <Stack direction="column" gap={2} data-testid="skills-consent-purpose">
        <Stack direction="row" justify="between" align="center" gap={2} wrap>
          <Text as="h5" size="base" weight="semibold">
            Consent, purpose ve activation gate
          </Text>
          <Badge variant={checks.consentCurrent ? 'success' : 'error'}>
            {checks.consentCurrent ? 'SENTETİK CONSENT TRACE CURRENT' : 'CONSENT TRACE KAPALI'}
          </Badge>
        </Stack>
        <div style={RESPONSIVE_GRID_STYLE}>
          <ReferenceLine label="Consent receipt" value={proposal.consentReceiptRef} />
          <ReferenceLine label="Processing purpose" value={proposal.processingPurposeRef} />
          <ReferenceLine
            label="Opt-out check"
            value={`${proposal.optOutCheckedAt} · optedOut=false`}
          />
          <ReferenceLine label="Proposal expiry" value={proposal.expiresAt} />
        </div>
        <Stack direction="row" gap={2} wrap>
          <Badge variant="error">REAL SUBJECT KABUL YOK</Badge>
          <Badge variant="error">REAL ACTIVATION YOK</Badge>
          <Badge variant="error">FULL ATS KABUL YOK</Badge>
        </Stack>
      </Stack>
    </Card>
  );
}

function evaluateSurface(surface: SyntheticSkillsOntologySurface) {
  const { release, mappingProposal, rediscoveryProposal } = surface;
  const releaseBound =
    mappingProposal.evidenceInventory.length > 0 &&
    mappingProposal.evidenceInventory.every(
      (evidence) =>
        evidence.ontologyReleaseRef === release.releaseRef &&
        evidence.ontologyReleaseVersion === release.releaseVersion &&
        evidence.ontologyReleaseDigest === release.releaseDigest &&
        evidence.entailment === 'SUPPORTED',
    );
  const currentMatches = rediscoveryProposal.matches.filter(
    (match) => match.traceStatus === 'TRACE_CURRENT',
  );
  const currentMatchesBound =
    currentMatches.length > 0 &&
    currentMatches.every((match) => isCurrentMatchBound(match, surface));
  const consentCurrent =
    rediscoveryProposal.consentReceiptRef.length > 0 &&
    rediscoveryProposal.processingPurposeRef.length > 0 &&
    !rediscoveryProposal.optedOut;
  const actionAllowed = Boolean(
    releaseBound &&
    currentMatchesBound &&
    consentCurrent &&
    rediscoveryProposal.actionAllowed &&
    rediscoveryProposal.mutationAllowed &&
    rediscoveryProposal.productionEligible &&
    rediscoveryProposal.realSubjectAccepted &&
    rediscoveryProposal.realRediscoveryActivated &&
    rediscoveryProposal.fullAtsAccepted,
  );
  return { releaseBound, currentMatchesBound, consentCurrent, actionAllowed };
}

function isCurrentMatchBound(
  match: SyntheticSkillsOntologySurface['rediscoveryProposal']['matches'][number],
  surface: SyntheticSkillsOntologySurface,
) {
  const { release, mappingProposal } = surface;
  return (
    match.sourceProposalId === mappingProposal.proposalId &&
    match.sourceProposalDigest === mappingProposal.proposalDigest &&
    match.ontologyReleaseRef === release.releaseRef &&
    match.ontologyReleaseVersion === release.releaseVersion &&
    match.ontologyReleaseDigest === release.releaseDigest &&
    match.evidenceEntailment === 'SUPPORTED' &&
    mappingProposal.evidenceInventory.some(
      (evidence) =>
        evidence.evidenceRef === match.evidenceRef &&
        evidence.citationRef === match.citationRef &&
        evidence.subjectRef === match.subjectRef &&
        evidence.conceptRef === match.conceptRef,
    )
  );
}

function ReferenceLine({ label, value }: { label: string; value: string }) {
  return (
    <Text as="p" size="xs" variant="secondary" style={REF_STYLE}>
      <strong>{label}:</strong> {value}
    </Text>
  );
}

const RESPONSIVE_GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))',
  gap: 12,
} as const;

const REF_STYLE = { overflowWrap: 'anywhere', margin: 0 } as const;

const SELECTABLE_CARD_STYLE = {
  appearance: 'none',
  borderRadius: 12,
  background: 'var(--surface-default)',
  color: 'inherit',
  padding: '0.875rem',
  textAlign: 'left',
  cursor: 'pointer',
  minWidth: 0,
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

const AUDIT_ROW_STYLE = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  alignItems: 'center',
  minWidth: 0,
} as const;
