import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Badge, Button, Card, Stack, Text } from '@mfe/design-system';
import {
  SYNTHETIC_QUALITY_OF_HIRE_RECEIPT,
  validateSyntheticQualityOfHireReceipt,
} from './syntheticQualityOfHire';
import type {
  QualityOfHireDimensionResultV1,
  QualityOfHireReceiptValidation,
  QualityOfHireWindowDays,
  SyntheticQualityOfHireEvidenceReceiptV1,
} from './syntheticQualityOfHire';

const DIMENSION_LABELS = {
  RETENTION: 'Retention',
  RAMP_MILESTONE: 'Yapılandırılmış ramp milestone',
  STRUCTURED_MANAGER_OUTCOME: 'Yönetici rubric outcome',
  NEW_HIRE_EXPERIENCE: 'Yeni çalışan deneyimi',
} as const;

const STATUS_LABELS: Record<QualityOfHireReceiptValidation['status'], string> = {
  DESCRIPTIVE_ASSOCIATION_ONLY: 'BETİMLEYİCİ İLİŞKİ · NEDENSELLİK YOK',
  SMALL_COHORT_SUPPRESSED: 'YETERSİZ VERİ · AGGREGATE GİZLENDİ',
  TRACE_FAIL_CLOSED: 'TRACE FAIL-CLOSED',
};

const ACTION_BLOCK_REASON =
  'Yalnız sentetik aggregate evidence. Legal, bağımsız audit, müşteri-controller ve owner gate olmadan gerçek veri, export veya aktivasyon açılamaz.';

function dimensionKey(windowDays: QualityOfHireWindowDays, dimension: QualityOfHireDimensionResultV1) {
  return `${windowDays}:${dimension.kind}`;
}

export function QualityOfHireEvidencePanel({
  receipt = SYNTHETIC_QUALITY_OF_HIRE_RECEIPT,
}: {
  receipt?: SyntheticQualityOfHireEvidenceReceiptV1;
}) {
  const validation = validateSyntheticQualityOfHireReceipt(receipt);
  const safeObservationWindows = validation.valid ? receipt.observationWindows : [];
  const firstWindow = safeObservationWindows[0];
  const firstDimension = firstWindow?.dimensions[0];
  const firstDimensionKey =
    firstWindow && firstDimension ? dimensionKey(firstWindow.windowDays, firstDimension) : '';
  const [selectedDimensionKey, setSelectedDimensionKey] = useState(firstDimensionKey);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedDimensionKey(firstDimensionKey);
  }, [firstDimensionKey, receipt]);

  const selected = safeObservationWindows
    .flatMap((window) =>
      window.dimensions.map((dimension) => ({ windowDays: window.windowDays, dimension })),
    )
    .find(({ windowDays, dimension }) => dimensionKey(windowDays, dimension) === selectedDimensionKey);

  if (!validation.valid) {
    return (
      <Card variant="outlined" padding="sm">
        <Stack direction="column" gap={2} data-testid="quality-of-hire-evidence-panel">
          <Badge variant="error">TRACE FAIL-CLOSED</Badge>
          <Text as="h4" size="lg" weight="semibold">
            Quality-of-Hire evidence gösterilemedi
          </Text>
          <Text as="p" size="sm">
            Authority, receipt digest, aggregate türetimi, privacy, action veya activation
            sınırlarından biri doğrulanmadı.
          </Text>
          <Text as="p" size="xs" variant="secondary" style={REF_STYLE}>
            {validation.issues.join(' · ')}
          </Text>
        </Stack>
      </Card>
    );
  }

  const suppressed = validation.status === 'SMALL_COHORT_SUPPRESSED';

  return (
    <Card variant="outlined" padding="sm">
      <Stack direction="column" gap={3} data-testid="quality-of-hire-evidence-panel">
        <Stack direction="row" justify="between" align="start" gap={2} wrap>
          <Stack direction="column" gap={1}>
            <Text as="h4" size="lg" weight="semibold">
              Quality-of-Hire Evidence Loop (P6.0)
            </Text>
            <Text as="p" size="sm" variant="secondary">
              Kanonik ATS receipt’inden 90/180 günlük post-hire aggregate outcome lineage’ını
              gösterir; kişi puanı veya seçim kararı üretmez.
            </Text>
          </Stack>
          <Stack direction="row" gap={2} wrap>
            <Badge variant="muted">SENTETİK</Badge>
            <Badge variant="info">AGGREGATE ONLY</Badge>
            <Badge variant="error">REAL ACTIVATION · FALSE</Badge>
          </Stack>
        </Stack>

        <Card variant="outlined" padding="sm">
          <Stack direction="column" gap={2} data-testid="qoh-decision-boundary">
            <Stack direction="row" justify="between" align="center" gap={2} wrap>
              <Text as="h5" size="sm" weight="semibold">
                Karar, mahremiyet ve nedensellik sınırı
              </Text>
              <Badge variant={suppressed ? 'warning' : 'info'}>
                {STATUS_LABELS[validation.status]}
              </Badge>
            </Stack>
            <Stack direction="row" gap={2} wrap>
              <Badge variant="error">TEK QoH SKORU YOK</Badge>
              <Badge variant="warning">KORELASYON · NEDENSELLİK DEĞİL</Badge>
              <Badge variant="error">MODEL EĞİTİMİ / OPTİMİZASYON YOK</Badge>
            </Stack>
            <Text as="p" size="sm" variant="secondary">
              Manager rubric, retention ve çalışan deneyimi contestable association input’tur;
              doğrulanmış ground truth değildir. Aday/çalışan ranking, geriye dönük puanlama ve
              performans aksiyonu kalıcı olarak kapalıdır.
            </Text>
            {suppressed && (
              <Text as="p" size="sm" data-testid="qoh-suppression-notice">
                En az bir pencere/boyut measurement veya disclosure eşiğini geçmedi. Kanonik
                receipt bütün count, rate ve uncertainty interval alanlarını null tuttu; bu yüzey
                hiçbir aggregate değer göstermiyor.
              </Text>
            )}
          </Stack>
        </Card>

        <Stack direction="column" gap={2} data-testid="qoh-cohort-windows">
          <Stack direction="row" justify="between" align="center" gap={2} wrap>
            <Text as="h5" size="sm" weight="semibold">
              Kohort ve gözlem pencereleri
            </Text>
            <Badge variant="muted">{receipt.cohortRef}</Badge>
          </Stack>
          <div style={RESPONSIVE_GRID_STYLE}>
            {receipt.observationWindows.map((window) => (
              <Card key={window.windowDays} variant="outlined" padding="sm">
                <Stack
                  direction="column"
                  gap={2}
                  data-testid={`qoh-window-DAY_${window.windowDays}`}
                >
                  <Stack direction="row" justify="between" align="center" gap={2} wrap>
                    <Text as="h6" size="sm" weight="semibold">
                      {window.windowDays} gün
                    </Text>
                    <Badge variant={suppressed ? 'warning' : 'info'}>
                      {suppressed ? 'AGGREGATE GİZLENDİ' : 'BETİMLEYİCİ KANIT'}
                    </Badge>
                  </Stack>
                  <div
                    role="group"
                    aria-label={`${window.windowDays} gün Quality-of-Hire outcome boyutları`}
                    style={DIMENSION_GRID_STYLE}
                  >
                    {window.dimensions.map((dimension) => {
                      const key = dimensionKey(window.windowDays, dimension);
                      if (suppressed) {
                        return (
                          <div key={key} style={SUPPRESSED_DIMENSION_STYLE}>
                            <Text as="span" size="sm" weight="semibold">
                              {DIMENSION_LABELS[dimension.kind]}
                            </Text>
                            <Text as="span" size="xs" variant="secondary">
                              Aggregate değer gizlendi
                            </Text>
                          </div>
                        );
                      }
                      return (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={selectedDimensionKey === key}
                          aria-controls="qoh-dimension-detail"
                          onClick={() => {
                            setSelectedDimensionKey(key);
                            detailRef.current?.focus();
                          }}
                          style={{
                            ...DIMENSION_BUTTON_STYLE,
                            border:
                              selectedDimensionKey === key
                                ? '2px solid var(--action-primary)'
                                : '1px solid var(--border-default)',
                          }}
                        >
                          <Stack direction="column" gap={1}>
                            <Text as="span" size="sm" weight="semibold">
                              {DIMENSION_LABELS[dimension.kind]}
                            </Text>
                            <Text as="span" size="xs" variant="secondary">
                              Eligible {dimension.eligibleCount} · Observed {dimension.observedCount}
                            </Text>
                            <Text as="span" size="xs" variant="secondary">
                              Missing {dimension.missingCount} · Censored {dimension.censoredCount}
                            </Text>
                            <Text as="span" size="xs" variant="secondary">
                              Outcome category {dimension.outcomeCategoryCount} ·{' '}
                              {((dimension.outcomeCategoryRate ?? 0) * 100).toFixed(1)}%
                            </Text>
                          </Stack>
                        </button>
                      );
                    })}
                  </div>
                </Stack>
              </Card>
            ))}
          </div>
          {!suppressed && selected && (
            <DimensionDetail
              dimension={selected.dimension}
              windowDays={selected.windowDays}
              detailRef={detailRef}
            />
          )}
        </Stack>

        <div style={RESPONSIVE_GRID_STYLE}>
          <Card variant="outlined" padding="sm">
            <Stack direction="column" gap={2} data-testid="qoh-measurement-privacy">
              <Text as="h5" size="sm" weight="semibold">
                Measurement ve mahremiyet
              </Text>
              <ReferenceLine label="Authority" value={receipt.intelligenceEvaluationAuthority} />
              <ReferenceLine label="Measurement plan" value={receipt.measurementPlanRef} />
              <ReferenceLine label="Comparison" value={receipt.comparisonProtocol.protocolRef} />
              <ReferenceLine label="Missingness" value={receipt.missingnessPlanRef} />
              <ReferenceLine label="Suppression" value={receipt.governance.suppressionPolicyRef} />
              <ReferenceLine
                label="Differencing"
                value={receipt.governance.differencingControlRef}
              />
              <ReferenceLine label="Query budget" value={receipt.governance.queryBudgetPolicyRef} />
              {!suppressed && (
                <Text as="p" size="sm">
                  İstatistik minimumu {receipt.minimumStatisticalSampleSize} · disclosure minimumu{' '}
                  {receipt.minimumDisclosureSampleSize} · {receipt.uncertaintyMethod}
                </Text>
              )}
              <Text as="p" size="xs" variant="secondary">
                Bu eşikler sentetik measurement plan girdisidir; sektör-geneli yeterlilik iddiası
                değildir.
              </Text>
            </Stack>
          </Card>

          <Card variant="outlined" padding="sm">
            <Stack direction="column" gap={2} data-testid="qoh-outcome-lineage">
              <Text as="h5" size="sm" weight="semibold">
                Hiring evidence → post-hire lineage
              </Text>
              <ReferenceLine
                label="Hiring evidence"
                value={receipt.lineage.hiringEvidenceAggregateRef}
              />
              <ReferenceLine label="HRIS outcome" value={receipt.lineage.hrisOutcomeSnapshotRef} />
              <ReferenceLine
                label="Human outcome"
                value={receipt.lineage.structuredHumanOutcomeReceiptRef}
              />
              <ReferenceLine
                label="New-hire experience"
                value={receipt.lineage.newHireExperienceReceiptRef}
              />
              <ReferenceLine label="Linkage" value={receipt.lineage.linkageProtocolRef} />
              {receipt.lineage.sourceSchemaVersionRefs.map((ref) => (
                <ReferenceLine key={ref} label="Source schema" value={ref} />
              ))}
              <ReferenceLine label="Provenance" value={receipt.lineage.provenanceChainRef} />
              <ReferenceLine label="Receipt" value={receipt.receiptDigest} />
            </Stack>
          </Card>
        </div>

        <div style={RESPONSIVE_GRID_STYLE}>
          <Card variant="outlined" padding="sm">
            <Stack direction="column" gap={2} data-testid="qoh-governance-lineage">
              <Text as="h5" size="sm" weight="semibold">
                Correction, appeal, retention ve access
              </Text>
              <ReferenceLine label="Correction" value={receipt.governance.correctionPathRef} />
              <ReferenceLine label="Appeal" value={receipt.governance.appealPathRef} />
              <ReferenceLine label="Retention" value={receipt.governance.retentionPolicyRef} />
              <ReferenceLine label="Access" value={receipt.governance.accessPolicyRef} />
              <ReferenceLine label="Erasure" value={receipt.governance.erasurePropagationRef} />
              <ReferenceLine label="Audit" value={receipt.governance.auditPolicyRef} />
              <Text as="p" size="xs" variant="secondary">
                Düzeltme eski receipt’i sessizce değiştirmez; yeni digest lineage ile supersede
                eder.
              </Text>
            </Stack>
          </Card>

          <Card variant="outlined" padding="sm">
            <Stack direction="column" gap={2} data-testid="qoh-activation-gates">
              <Stack direction="row" justify="between" align="center" gap={2} wrap>
                <Text as="h5" size="sm" weight="semibold">
                  Gerçek aktivasyon kapıları
                </Text>
                <Badge variant="error">PRODUCTION · FALSE</Badge>
              </Stack>
              <GateLine label="Evidence" value={receipt.evidenceGate} />
              <GateLine label="Legal" value={receipt.legalGate} />
              <GateLine label="Independent audit" value={receipt.independentAuditGate} />
              <GateLine label="Customer controller" value={receipt.customerControllerGate} />
              <GateLine label="Owner" value={receipt.ownerGate} />
            </Stack>
          </Card>
        </div>

        <Stack direction="column" gap={2}>
          <Text
            as="p"
            id="qoh-action-block-reason"
            size="sm"
            variant="secondary"
            data-testid="qoh-action-block-reason"
          >
            {ACTION_BLOCK_REASON}
          </Text>
          <Stack direction="row" gap={2} wrap>
            <Button
              variant="outline"
              disabled
              accessReason={ACTION_BLOCK_REASON}
              aria-describedby="qoh-action-block-reason"
            >
              Düzeltme isteği oluştur
            </Button>
            <Button
              variant="outline"
              disabled
              accessReason={ACTION_BLOCK_REASON}
              aria-describedby="qoh-action-block-reason"
            >
              Aggregate evidence dışa aktar
            </Button>
            <Button
              variant="primary"
              disabled
              accessReason={ACTION_BLOCK_REASON}
              aria-describedby="qoh-action-block-reason"
              data-testid="qoh-activate-button"
            >
              Gerçek veri aktivasyonu
            </Button>
          </Stack>
        </Stack>
      </Stack>
    </Card>
  );
}

function DimensionDetail({
  dimension,
  windowDays,
  detailRef,
}: {
  dimension: QualityOfHireDimensionResultV1;
  windowDays: QualityOfHireWindowDays;
  detailRef: RefObject<HTMLDivElement>;
}) {
  const interval = dimension.uncertaintyInterval;
  return (
    <div
      ref={detailRef}
      id="qoh-dimension-detail"
      role="region"
      tabIndex={-1}
      aria-live="polite"
      aria-label="Seçilen Quality-of-Hire outcome lineage detayı"
      data-testid="qoh-dimension-detail"
    >
      <Card variant="outlined" padding="sm">
        <Stack direction="column" gap={2}>
          <Stack direction="row" justify="between" align="center" gap={2} wrap>
            <Text as="h5" size="sm" weight="semibold">
              {windowDays} gün · {DIMENSION_LABELS[dimension.kind]}
            </Text>
            <Badge variant="warning">CONTESTABLE ASSOCIATION INPUT</Badge>
          </Stack>
          <ReferenceLine label="Outcome category" value={dimension.outcomeCategoryRef} />
          <Text as="p" size="sm">
            Eligible {dimension.eligibleCount} · Observed {dimension.observedCount} · Missing{' '}
            {dimension.missingCount} · Censored {dimension.censoredCount}
          </Text>
          <Text as="p" size="sm">
            Outcome category {dimension.outcomeCategoryCount} ·{' '}
            {((dimension.outcomeCategoryRate ?? 0) * 100).toFixed(1)}% · Wilson %95{' '}
            {interval ? `${interval.lower.toFixed(3)}–${interval.upper.toFixed(3)}` : 'gizlendi'}
          </Text>
          <Text as="p" size="xs" variant="secondary">
            İnsan-bildirimli ve organizasyon koşullarından etkilenen outcome; nedensel kalite hükmü
            değildir.
          </Text>
        </Stack>
      </Card>
    </div>
  );
}

function ReferenceLine({ label, value }: { label: string; value: string }) {
  return (
    <Text as="p" size="xs" variant="secondary" style={REF_STYLE}>
      <strong>{label}:</strong> {value}
    </Text>
  );
}

function GateLine({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" justify="between" align="center" gap={2} wrap>
      <Text as="span" size="sm">
        {label}
      </Text>
      <Badge variant={value === 'SYNTHETIC_EVIDENCE_ONLY' ? 'warning' : 'error'}>{value}</Badge>
    </Stack>
  );
}

const REF_STYLE = { overflowWrap: 'anywhere', minWidth: 0 } as const;

const RESPONSIVE_GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))',
  gap: 12,
} as const;

const DIMENSION_GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))',
  gap: 8,
} as const;

const DIMENSION_BUTTON_STYLE = {
  appearance: 'none',
  borderRadius: 10,
  background: 'var(--surface-default)',
  color: 'inherit',
  padding: 12,
  textAlign: 'left',
  cursor: 'pointer',
  minWidth: 0,
  overflowWrap: 'anywhere',
} as const;

const SUPPRESSED_DIMENSION_STYLE = {
  border: '1px solid var(--border-default)',
  borderRadius: 10,
  padding: 12,
  minWidth: 0,
  overflowWrap: 'anywhere',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
} as const;
