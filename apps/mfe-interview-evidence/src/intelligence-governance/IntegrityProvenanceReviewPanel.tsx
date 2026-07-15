import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Badge, Button, Card, Stack, Text } from '@mfe/design-system';
import {
  COVERAGE_LABELS,
  INTEGRITY_REASON_LABELS,
  INTEGRITY_STATUS_BOUNDARIES,
  INTEGRITY_STATUS_LABELS,
  SYNTHETIC_INTEGRITY_PROVENANCE_SURFACE,
} from './syntheticIntegrityProvenance';
import type {
  IntegrityReasonCode,
  IntegrityStatus,
  SyntheticIntegrityProvenanceSurface,
  SyntheticIntegrityReasonBinding,
  SyntheticIntegrityReceipt,
} from './syntheticIntegrityProvenance';

const ACTION_BLOCK_REASON =
  'Screening evidence tek başına workflow mutation, kişi skoru veya adverse action üretemez. Legal ve owner gate NOT_MET; production kapalı.';

export function IntegrityProvenanceReviewPanel({
  surface = SYNTHETIC_INTEGRITY_PROVENANCE_SURFACE,
}: {
  surface?: SyntheticIntegrityProvenanceSurface;
}) {
  const [selectedScreeningId, setSelectedScreeningId] = useState(
    surface.receipts[0]?.screeningId ?? '',
  );
  const selectedReceipt = surface.receipts.find(
    (receipt) => receipt.screeningId === selectedScreeningId,
  );
  const [selectedEvidenceRef, setSelectedEvidenceRef] = useState(
    selectedReceipt?.reasonEvidenceBindings[0]?.evidenceRef ?? '',
  );
  const evidenceDetailRef = useRef<HTMLDivElement>(null);
  const surfaceChecks = useMemo(() => evaluateSurface(surface), [surface]);
  const selectedReceiptValid = selectedReceipt ? validateReceipt(selectedReceipt) : false;

  useEffect(() => {
    const nextReceipt = surface.receipts[0];
    setSelectedScreeningId(nextReceipt?.screeningId ?? '');
    setSelectedEvidenceRef(nextReceipt?.reasonEvidenceBindings[0]?.evidenceRef ?? '');
  }, [surface]);

  const selectReceipt = (receipt: SyntheticIntegrityReceipt) => {
    setSelectedScreeningId(receipt.screeningId);
    setSelectedEvidenceRef(receipt.reasonEvidenceBindings[0]?.evidenceRef ?? '');
  };

  const selectEvidence = (evidenceRef: string) => {
    setSelectedEvidenceRef(evidenceRef);
    evidenceDetailRef.current?.focus();
  };

  return (
    <Card variant="outlined" padding="sm">
      <Stack direction="column" gap={4} data-testid="integrity-provenance-review-panel">
        <Stack direction="row" justify="between" align="start" gap={2} wrap>
          <Stack direction="column" gap={1}>
            <Text as="h4" size="lg" weight="semibold">
              Integrity &amp; Provenance Review
            </Text>
            <Text as="p" size="sm" variant="secondary">
              C2PA/provenance sonuçlarını yalnız digest-bound screening evidence olarak gösterir;
              kişi veya içerik hükmü üretmez.
            </Text>
          </Stack>
          <Stack direction="row" gap={2} wrap>
            <Badge variant="warning">SCREENING ONLY</Badge>
            <Badge variant="muted">SENTETİK</Badge>
            <Badge variant="error">LEGAL · OWNER NOT_MET</Badge>
            <Badge variant="error">PRODUCTION FALSE</Badge>
          </Stack>
        </Stack>

        <Card variant="outlined" padding="sm">
          <Stack direction="column" gap={2} data-testid="integrity-epistemic-boundary">
            <Text as="h5" size="base" weight="semibold">
              Epistemic sınır · sonuç değil kanıt
            </Text>
            <div style={RESPONSIVE_GRID_STYLE}>
              <BoundaryItem
                label="Provenance"
                value="Binding durumu yalnız teknik lineage kanıtıdır"
              />
              <BoundaryItem label="İçerik" value="Doğruluk veya içerik hükmü yok" />
              <BoundaryItem
                label="Kişi"
                value="Kimlik, davranış, emotion veya deception çıkarımı yok"
              />
              <BoundaryItem
                label="Karar"
                value="Skor, ranking, otomatik adverse action veya mutation yok"
              />
            </div>
          </Stack>
        </Card>

        <Card variant="outlined" padding="sm">
          <Stack
            direction="row"
            gap={2}
            align="center"
            wrap
            role="status"
            aria-live="polite"
            data-testid="integrity-surface-status"
          >
            <Badge variant={surfaceChecks.allReceiptsBound ? 'success' : 'error'}>
              {surfaceChecks.allReceiptsBound
                ? 'ALL RECEIPT FIELD BINDINGS CONSISTENT'
                : 'RECEIPT LINEAGE FAIL-CLOSED'}
            </Badge>
            <Badge variant={surfaceChecks.replaySafe ? 'success' : 'error'}>
              {surfaceChecks.replaySafe ? 'REF / DIGEST REPLAY YOK' : 'REPLAY CONFLICT'}
            </Badge>
          </Stack>
        </Card>

        <Stack direction="column" gap={2}>
          <Text as="h5" size="base" weight="semibold">
            Screening receipt’leri
          </Text>
          <div
            role="group"
            aria-label="Integrity screening receipt seçenekleri"
            data-testid="integrity-receipt-selector"
            style={RESPONSIVE_GRID_STYLE}
          >
            {surface.receipts.map((receipt) => (
              <button
                key={receipt.screeningId}
                type="button"
                aria-pressed={selectedScreeningId === receipt.screeningId}
                onClick={() => selectReceipt(receipt)}
                style={{
                  ...SELECTABLE_CARD_STYLE,
                  border:
                    selectedScreeningId === receipt.screeningId
                      ? '2px solid var(--action-primary)'
                      : '1px solid var(--border-default)',
                }}
              >
                <Stack direction="column" gap={1}>
                  <StatusBadge status={receipt.status} />
                  <Text as="span" size="xs" variant="secondary" style={REF_STYLE}>
                    {receipt.screeningId}
                  </Text>
                  <Text as="span" size="sm">
                    {INTEGRITY_STATUS_BOUNDARIES[receipt.status] ??
                      'Bilinmeyen status · fail-closed'}
                  </Text>
                </Stack>
              </button>
            ))}
          </div>
        </Stack>

        {selectedReceipt &&
        selectedReceiptValid &&
        surfaceChecks.allReceiptsBound &&
        surfaceChecks.replaySafe ? (
          <>
            <ReceiptLineageCard receipt={selectedReceipt} />
            <ReasonEvidenceCard
              receipt={selectedReceipt}
              selectedEvidenceRef={selectedEvidenceRef}
              detailRef={evidenceDetailRef}
              onSelectEvidence={selectEvidence}
            />
            <CoverageCard receipt={selectedReceipt} />
            <HumanReviewCard receipt={selectedReceipt} />
          </>
        ) : (
          <Card variant="outlined" padding="sm">
            <Stack direction="column" gap={1} data-testid="integrity-fail-closed-state">
              <Badge variant="error">RECEIPT FAIL-CLOSED</Badge>
              <Text as="p" size="sm">
                Status–reason veya exact evidence lineage eşleşmedi; screening detayı kullanılamaz.
              </Text>
            </Stack>
          </Card>
        )}

        <Card variant="outlined" padding="sm">
          <Stack direction="column" gap={2} data-testid="integrity-activation-gates">
            <Stack direction="row" gap={2} wrap>
              <Badge variant="error">LEGAL GATE · NOT_MET</Badge>
              <Badge variant="error">OWNER GATE · NOT_MET</Badge>
              <Badge variant="error">PRODUCTION · FALSE</Badge>
              <Badge variant="muted">CRYPTO ATTESTATION VERIFY · OUT_OF_SCOPE</Badge>
            </Stack>
            <Text as="p" id="integrity-action-block-reason" size="sm" variant="secondary">
              {ACTION_BLOCK_REASON}
            </Text>
            <Stack direction="row" gap={2} wrap>
              <Button
                variant="primary"
                disabled
                accessReason={ACTION_BLOCK_REASON}
                aria-describedby="integrity-action-block-reason"
                data-testid="integrity-apply-button"
              >
                Screening evidence uygula
              </Button>
              <Button
                variant="outline"
                disabled
                accessReason={ACTION_BLOCK_REASON}
                aria-describedby="integrity-action-block-reason"
              >
                Workflow’a aktar
              </Button>
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </Card>
  );
}

function ReceiptLineageCard({ receipt }: { receipt: SyntheticIntegrityReceipt }) {
  return (
    <Card variant="outlined" padding="sm">
      <Stack direction="column" gap={2} data-testid="integrity-receipt-lineage">
        <Stack direction="row" justify="between" align="center" gap={2} wrap>
          <Text as="h5" size="base" weight="semibold">
            Exact receipt ve snapshot lineage
          </Text>
          <StatusBadge status={receipt.status} />
        </Stack>
        <Text as="p" size="sm" variant="secondary">
          {INTEGRITY_STATUS_BOUNDARIES[receipt.status]}
        </Text>
        <div style={RESPONSIVE_GRID_STYLE}>
          <ReferenceBlock
            label="Schema / screening"
            value={`${receipt.schemaVersion} · ${receipt.screeningId}`}
          />
          <ReferenceBlock
            label="Tenant / scope"
            value={`${receipt.tenantRef} · ${receipt.scopeRef}`}
          />
          <ReferenceBlock
            label="Asset / snapshot"
            value={`${receipt.assetRef} · ${receipt.assetSnapshotRef}`}
          />
          <ReferenceBlock label="Asset digest" value={receipt.assetDigest} />
          <ReferenceBlock label="Scope material digest" value={receipt.scopeBindingDigest} />
          <ReferenceBlock
            label="Manifest / claim"
            value={`${receipt.manifestPresence} · ${receipt.manifestDigest ?? 'null'} · ${receipt.claimDigest ?? 'null'}`}
          />
          <ReferenceBlock
            label="Verifier / trust / policy"
            value={`${receipt.verifierVersionRef} · ${receipt.trustListVersionRef} · ${receipt.policyVersionRef}`}
          />
          <ReferenceBlock
            label="Claimed attestation"
            value={`${receipt.scopeBindingAttestationRef} · ${receipt.scopeBindingAttestationDigest} · ${receipt.scopeBindingKeyVersionRef} · CRYPTO VERIFY OUT_OF_SCOPE`}
          />
          <ReferenceBlock
            label="Time / retention"
            value={`${receipt.timestampAuthorityRef} · ${receipt.verifiedAt} · ${receipt.retentionPolicyRef} · ${receipt.retentionExpiresAt} · ${receipt.deletionMechanism}`}
          />
        </div>
      </Stack>
    </Card>
  );
}

function ReasonEvidenceCard({
  receipt,
  selectedEvidenceRef,
  detailRef,
  onSelectEvidence,
}: {
  receipt: SyntheticIntegrityReceipt;
  selectedEvidenceRef: string;
  detailRef: RefObject<HTMLDivElement>;
  onSelectEvidence: (evidenceRef: string) => void;
}) {
  const selected = receipt.reasonEvidenceBindings.find(
    (binding) => binding.evidenceRef === selectedEvidenceRef,
  );
  return (
    <Card variant="outlined" padding="sm">
      <Stack direction="column" gap={2} data-testid="integrity-reason-evidence">
        <Stack direction="row" justify="between" align="center" gap={2} wrap>
          <Text as="h5" size="base" weight="semibold">
            Reason → evidence exact binding
          </Text>
          <Badge variant="info">{receipt.reasonCodes.length} REASON · ORPHAN YOK</Badge>
        </Stack>
        <div style={RESPONSIVE_GRID_STYLE}>
          {receipt.reasonEvidenceBindings.map((binding) => (
            <button
              key={binding.evidenceRef}
              type="button"
              aria-pressed={selectedEvidenceRef === binding.evidenceRef}
              aria-controls="integrity-evidence-detail"
              aria-label={`Evidence aç · ${binding.reasonCode}`}
              onClick={() => onSelectEvidence(binding.evidenceRef)}
              style={SELECTABLE_CARD_STYLE}
            >
              <Stack direction="column" gap={1}>
                <Text as="span" weight="semibold">
                  {INTEGRITY_REASON_LABELS[binding.reasonCode]}
                </Text>
                <Text as="span" size="xs" variant="secondary" style={REF_STYLE}>
                  {binding.reasonCode}
                </Text>
                <Text as="span" size="xs" variant="secondary" style={REF_STYLE}>
                  {binding.evidenceRef}
                </Text>
              </Stack>
            </button>
          ))}
        </div>
        {selected && <EvidenceDetail binding={selected} detailRef={detailRef} />}
      </Stack>
    </Card>
  );
}

function EvidenceDetail({
  binding,
  detailRef,
}: {
  binding: SyntheticIntegrityReasonBinding;
  detailRef: RefObject<HTMLDivElement>;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div
      id="integrity-evidence-detail"
      ref={detailRef}
      role="region"
      aria-label="Seçilen integrity reason exact evidence detayı"
      tabIndex={-1}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      data-testid="integrity-evidence-detail"
      style={{ ...DETAIL_STYLE, ...(focused ? DETAIL_FOCUS_STYLE : {}) }}
    >
      <Stack direction="column" gap={1}>
        <Text as="span" weight="semibold">
          {INTEGRITY_REASON_LABELS[binding.reasonCode]}
        </Text>
        <ReferenceLine
          label="Evidence"
          value={`${binding.evidenceRef} · ${binding.evidenceDigest}`}
        />
        <ReferenceLine
          label="Snapshot"
          value={`${binding.assetSnapshotRef} · ${binding.assetSnapshotDigest}`}
        />
        <ReferenceLine
          label="Manifest / claim"
          value={`${binding.manifestDigest ?? 'null'} · ${binding.claimDigest ?? 'null'}`}
        />
        <ReferenceLine
          label="Verifier / trust / policy"
          value={`${binding.verifierVersionRef} · ${binding.trustListVersionRef} · ${binding.policyVersionRef}`}
        />
      </Stack>
    </div>
  );
}

function CoverageCard({ receipt }: { receipt: SyntheticIntegrityReceipt }) {
  return (
    <Card variant="outlined" padding="sm">
      <Stack direction="column" gap={2} data-testid="integrity-coverage">
        <Stack direction="row" justify="between" align="center" gap={2} wrap>
          <Text as="h5" size="base" weight="semibold">
            Uncertainty ve coverage receipts
          </Text>
          <Badge variant="warning">SYNTHETIC_ONLY · BAĞIMSIZ KABUL YOK</Badge>
        </Stack>
        <div style={RESPONSIVE_GRID_STYLE}>
          {(Object.keys(COVERAGE_LABELS) as Array<keyof typeof COVERAGE_LABELS>).map((key) => {
            const coverage = receipt.coverage[key];
            return (
              <ReferenceBlock
                key={key}
                label={COVERAGE_LABELS[key]}
                value={`${coverage.measurementState} · ${coverage.evidenceRef} · ${coverage.evidenceDigest} · ${coverage.measurementPolicyVersionRef}`}
              />
            );
          })}
        </div>
      </Stack>
    </Card>
  );
}

function HumanReviewCard({ receipt }: { receipt: SyntheticIntegrityReceipt }) {
  return (
    <Card variant="outlined" padding="sm">
      <Stack direction="column" gap={2} data-testid="integrity-human-review">
        <Stack direction="row" gap={2} wrap>
          <Badge variant="warning">HUMAN REVIEW REQUIRED</Badge>
          <Badge variant="error">ACTION ALLOWED · FALSE</Badge>
          <Badge variant="error">VERDICT · NONE</Badge>
        </Stack>
        <ReferenceLine label="Human review" value={receipt.humanReviewPathRef} />
        <ReferenceLine label="Appeal" value={receipt.appealPathRef} />
        <ReferenceLine label="Correction" value={receipt.correctionPathRef} />
        <ReferenceLine label="Audit" value={receipt.auditLineageRefs.join(' · ')} />
      </Stack>
    </Card>
  );
}

function StatusBadge({ status }: { status: IntegrityStatus }) {
  const variant =
    status === 'VERIFIED_BINDING'
      ? 'success'
      : status === 'NOT_PRESENT'
        ? 'muted'
        : status === 'INCONCLUSIVE'
          ? 'warning'
          : 'error';
  return (
    <Badge variant={variant} style={RESPONSIVE_STATUS_BADGE_STYLE}>
      {INTEGRITY_STATUS_LABELS[status] ?? 'UNKNOWN STATUS · FAIL-CLOSED'}
    </Badge>
  );
}

function BoundaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={BOUNDARY_STYLE}>
      <Text as="span" size="xs" variant="secondary">
        {label}
      </Text>
      <Text as="span" size="sm" weight="semibold">
        {value}
      </Text>
    </div>
  );
}

function ReferenceBlock({ label, value }: { label: string; value: string }) {
  return (
    <div style={BOUNDARY_STYLE}>
      <Text as="span" size="xs" variant="secondary">
        {label}
      </Text>
      <Text as="span" size="xs" style={REF_STYLE}>
        {value}
      </Text>
    </div>
  );
}

function ReferenceLine({ label, value }: { label: string; value: string }) {
  return (
    <Text as="span" size="xs" variant="secondary" style={REF_STYLE}>
      <strong>{label}:</strong> {value}
    </Text>
  );
}

function evaluateSurface(surface: SyntheticIntegrityProvenanceSurface) {
  const screeningIds = surface.receipts.map((receipt) => receipt.screeningId);
  const evidenceRefs = surface.receipts.flatMap((receipt) =>
    receipt.reasonEvidenceBindings.map((binding) => binding.evidenceRef),
  );
  const evidenceDigests = surface.receipts.flatMap((receipt) =>
    receipt.reasonEvidenceBindings.map((binding) => binding.evidenceDigest),
  );
  const auditRefs = surface.receipts.flatMap((receipt) => [...receipt.auditLineageRefs]);
  const attestationRefs = surface.receipts.map((receipt) => receipt.scopeBindingAttestationRef);
  return {
    allReceiptsBound: surface.receipts.length > 0 && surface.receipts.every(validateReceipt),
    replaySafe: [screeningIds, evidenceRefs, evidenceDigests, auditRefs, attestationRefs].every(
      (refs) => new Set(refs).size === refs.length,
    ),
  };
}

function validateReceipt(receipt: SyntheticIntegrityReceipt): boolean {
  const exactReasonSets: Partial<Record<IntegrityStatus, ReadonlySet<IntegrityReasonCode>>> = {
    VERIFIED_BINDING: new Set(['MANIFEST_BINDING_VERIFIED']),
    NOT_PRESENT: new Set(['MANIFEST_NOT_PRESENT']),
    UNSUPPORTED: new Set(['UNSUPPORTED_MANIFEST_FORMAT']),
    VERIFICATION_ERROR: new Set(['VERIFIER_ERROR']),
    INCONCLUSIVE: new Set(['TRUST_LIST_STALE']),
  };
  const exactReasons = exactReasonSets[receipt.status];
  const failedAllowed = new Set<IntegrityReasonCode>([
    'MANIFEST_SIGNATURE_INVALID',
    'ASSET_DIGEST_MISMATCH',
    'CLAIM_DIGEST_MISMATCH',
    'DIGEST_MISMATCH_UNKNOWN',
    'DIGEST_MISMATCH_WITH_TRANSCODE_CONTEXT',
    'ACCESSIBILITY_TRANSCODE_OBSERVED',
  ]);
  const failedPrimary = new Set<IntegrityReasonCode>([
    'MANIFEST_SIGNATURE_INVALID',
    'ASSET_DIGEST_MISMATCH',
    'CLAIM_DIGEST_MISMATCH',
    'DIGEST_MISMATCH_UNKNOWN',
    'DIGEST_MISMATCH_WITH_TRANSCODE_CONTEXT',
  ]);
  const hasTranscode = receipt.reasonCodes.includes('DIGEST_MISMATCH_WITH_TRANSCODE_CONTEXT');
  const hasAccessibility = receipt.reasonCodes.includes('ACCESSIBILITY_TRANSCODE_OBSERVED');
  const reasonsExact =
    receipt.status === 'FAILED_BINDING'
      ? receipt.reasonCodes.length > 0 &&
        receipt.reasonCodes.every((reason) => failedAllowed.has(reason)) &&
        receipt.reasonCodes.some((reason) => failedPrimary.has(reason)) &&
        hasTranscode === hasAccessibility
      : Boolean(
          exactReasons &&
          exactReasons.size === receipt.reasonCodes.length &&
          receipt.reasonCodes.every((reason) => exactReasons.has(reason)),
        );
  const presenceValid =
    ((receipt.status === 'VERIFIED_BINDING' ||
      receipt.status === 'FAILED_BINDING' ||
      receipt.status === 'UNSUPPORTED') &&
      receipt.manifestPresence === 'PRESENT') ||
    (receipt.status === 'NOT_PRESENT' && receipt.manifestPresence === 'NOT_PRESENT') ||
    (receipt.status === 'VERIFICATION_ERROR' && receipt.manifestPresence === 'UNKNOWN') ||
    (receipt.status === 'INCONCLUSIVE' && receipt.manifestPresence !== 'NOT_PRESENT');
  const reasonBindingsExact =
    receipt.reasonEvidenceBindings.length === receipt.reasonCodes.length &&
    receipt.reasonCodes.every(
      (reason) =>
        receipt.reasonEvidenceBindings.filter((binding) => binding.reasonCode === reason).length ===
        1,
    ) &&
    receipt.reasonEvidenceBindings.every(
      (binding) =>
        binding.assetSnapshotRef === receipt.assetSnapshotRef &&
        binding.assetSnapshotDigest === receipt.assetSnapshotDigest &&
        binding.manifestDigest === receipt.manifestDigest &&
        binding.claimDigest === receipt.claimDigest &&
        binding.verifierVersionRef === receipt.verifierVersionRef &&
        binding.trustListVersionRef === receipt.trustListVersionRef &&
        binding.policyVersionRef === receipt.policyVersionRef,
    );
  const digestPattern = /^sha256:[a-f0-9]{64}$/;
  const opaqueId = (value: string, prefix: string) =>
    new RegExp(`^${prefix}_[a-f0-9]{16,64}$`).test(value);
  const semanticRef = (value: string, prefix: string) =>
    new RegExp(`^${prefix}:[a-z0-9._-]+(?::[a-z0-9._-]+)*$`).test(value);
  const isCanonicalTime = (value: string) => {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
  };
  const identifiersBound =
    receipt.schemaVersion === 'integrity-provenance-screening/v1' &&
    receipt.synthetic &&
    opaqueId(receipt.screeningId, 'screening') &&
    opaqueId(receipt.tenantRef, 'tenant') &&
    opaqueId(receipt.scopeRef, 'scope') &&
    opaqueId(receipt.assetRef, 'asset') &&
    opaqueId(receipt.assetSnapshotRef, 'snapshot') &&
    opaqueId(receipt.scopeBindingAttestationRef, 'attestation') &&
    opaqueId(receipt.humanReviewPathRef, 'route') &&
    opaqueId(receipt.appealPathRef, 'route') &&
    opaqueId(receipt.correctionPathRef, 'route') &&
    /^key:scope-binding:[a-z0-9._-]+$/.test(receipt.scopeBindingKeyVersionRef) &&
    semanticRef(receipt.verifierVersionRef, 'verifier') &&
    semanticRef(receipt.trustListVersionRef, 'trust-list') &&
    semanticRef(receipt.policyVersionRef, 'policy') &&
    semanticRef(receipt.timestampAuthorityRef, 'timestamp') &&
    semanticRef(receipt.retentionPolicyRef, 'retention') &&
    isCanonicalTime(receipt.verifiedAt) &&
    isCanonicalTime(receipt.retentionExpiresAt) &&
    Date.parse(receipt.retentionExpiresAt) > Date.parse(receipt.verifiedAt) &&
    receipt.auditLineageRefs.length > 0 &&
    receipt.auditLineageRefs.every((ref) => opaqueId(ref, 'audit')) &&
    receipt.reasonEvidenceBindings.every(
      (binding) =>
        opaqueId(binding.evidenceRef, 'evidence') &&
        digestPattern.test(binding.evidenceDigest) &&
        digestPattern.test(binding.assetSnapshotDigest) &&
        semanticRef(binding.verifierVersionRef, 'verifier') &&
        semanticRef(binding.trustListVersionRef, 'trust-list') &&
        semanticRef(binding.policyVersionRef, 'policy'),
    );
  const manifestDigestsBound =
    receipt.manifestPresence === 'PRESENT'
      ? Boolean(
          receipt.manifestDigest &&
          receipt.claimDigest &&
          digestPattern.test(receipt.manifestDigest) &&
          digestPattern.test(receipt.claimDigest),
        )
      : receipt.manifestDigest === null && receipt.claimDigest === null;
  const coverageReceipts = Object.values(receipt.coverage);
  const coverageBound =
    coverageReceipts.length === 5 &&
    new Set(coverageReceipts.map((coverage) => coverage.evidenceRef)).size ===
      coverageReceipts.length &&
    coverageReceipts.every(
      (coverage) =>
        coverage.measurementState === 'SYNTHETIC_ONLY' &&
        opaqueId(coverage.evidenceRef, 'coverage') &&
        digestPattern.test(coverage.evidenceDigest) &&
        semanticRef(coverage.measurementPolicyVersionRef, 'coverage-policy'),
    );
  const snapshotAndAttestationBound =
    digestPattern.test(receipt.assetDigest) &&
    digestPattern.test(receipt.assetSnapshotDigest) &&
    digestPattern.test(receipt.scopeBindingDigest) &&
    digestPattern.test(receipt.scopeBindingAttestationDigest) &&
    receipt.assetSnapshotDigest === receipt.assetDigest &&
    receipt.scopeBindingAttestationDigest === receipt.scopeBindingDigest &&
    receipt.attestationBoundary === 'CLAIMED_EXTERNAL_REF_CRYPTO_VERIFICATION_OUT_OF_SCOPE';
  const gatesClosed =
    receipt.screeningOnly &&
    !receipt.containsRawMedia &&
    !receipt.containsBiometricData &&
    !receipt.containsRawPii &&
    receipt.deepfakeConclusion === 'NONE' &&
    receipt.authenticityConclusion === 'NONE' &&
    receipt.identityConclusion === 'NONE' &&
    receipt.deceptionConclusion === 'NONE' &&
    receipt.emotionConclusion === 'NONE' &&
    !receipt.personRiskScoreAllowed &&
    !receipt.actionAllowed &&
    !receipt.adverseActionAllowed &&
    !receipt.automaticRejectionAllowed &&
    !receipt.mutationAllowed &&
    receipt.verdict === 'NONE' &&
    receipt.humanReviewRequired &&
    receipt.legalGate === 'NOT_MET' &&
    receipt.ownerGate === 'NOT_MET' &&
    !receipt.productionEligible;
  return (
    reasonsExact &&
    presenceValid &&
    reasonBindingsExact &&
    identifiersBound &&
    manifestDigestsBound &&
    coverageBound &&
    snapshotAndAttestationBound &&
    gatesClosed
  );
}

const RESPONSIVE_GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))',
  gap: '0.75rem',
} as const;

const SELECTABLE_CARD_STYLE = {
  appearance: 'none',
  width: '100%',
  border: '1px solid var(--border-default)',
  borderRadius: '0.75rem',
  background: 'var(--surface-default)',
  color: 'inherit',
  padding: '0.75rem',
  textAlign: 'left',
  cursor: 'pointer',
  minWidth: 0,
} as const;

const RESPONSIVE_STATUS_BADGE_STYLE = {
  maxWidth: '100%',
  whiteSpace: 'normal',
  overflowWrap: 'anywhere',
  textAlign: 'center',
} as const;

const BOUNDARY_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  minWidth: 0,
  border: '1px solid var(--border-subtle)',
  borderRadius: '0.625rem',
  padding: '0.625rem',
} as const;

const DETAIL_STYLE = {
  border: '1px solid var(--border-default)',
  borderRadius: '0.75rem',
  padding: '0.75rem',
} as const;

const DETAIL_FOCUS_STYLE = {
  outline: '2px solid var(--action-primary)',
  outlineOffset: 2,
} as const;

const REF_STYLE = {
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
  minWidth: 0,
} as const;
