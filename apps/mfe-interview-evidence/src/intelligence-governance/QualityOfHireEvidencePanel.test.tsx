import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { QualityOfHireEvidencePanel } from './QualityOfHireEvidencePanel';
import {
  BANNED_QUALITY_OF_HIRE_SURFACE_FIELDS,
  SYNTHETIC_QUALITY_OF_HIRE_RECEIPT,
  computeSyntheticQualityOfHireReceiptDigest,
  validateSyntheticQualityOfHireReceipt,
} from './syntheticQualityOfHire';
import type { SyntheticQualityOfHireEvidenceReceiptV1 } from './syntheticQualityOfHire';

function reseal(
  unsigned: Omit<SyntheticQualityOfHireEvidenceReceiptV1, 'receiptDigest'>,
): SyntheticQualityOfHireEvidenceReceiptV1 {
  return {
    ...unsigned,
    receiptDigest: computeSyntheticQualityOfHireReceiptDigest(unsigned),
  };
}

function suppressedReceipt(): SyntheticQualityOfHireEvidenceReceiptV1 {
  const { receiptDigest: _digest, ...unsigned } = structuredClone(
    SYNTHETIC_QUALITY_OF_HIRE_RECEIPT,
  );
  const suppressedUnsigned = {
    ...unsigned,
    status: 'INSUFFICIENT_DATA',
    insufficiencyReasons: ['DISCLOSURE_SAMPLE_BELOW_MINIMUM'],
    observationWindows: unsigned.observationWindows.map((window) => ({
      ...window,
      dimensions: window.dimensions.map((dimension) => ({
        kind: dimension.kind,
        outcomeCategoryRef: dimension.outcomeCategoryRef,
        visibility: 'SUPPRESSED_INSUFFICIENT_DATA',
        eligibleCount: null,
        observedCount: null,
        missingCount: null,
        censoredCount: null,
        outcomeCategoryCount: null,
        missingnessRate: null,
        outcomeCategoryRate: null,
        uncertaintyInterval: null,
      })),
    })),
  } as const satisfies Omit<SyntheticQualityOfHireEvidenceReceiptV1, 'receiptDigest'>;
  return reseal(suppressedUnsigned);
}

function receiptWithMalformedWindows(
  observationWindows: unknown,
): SyntheticQualityOfHireEvidenceReceiptV1 {
  const { receiptDigest: _digest, ...unsigned } = structuredClone(
    SYNTHETIC_QUALITY_OF_HIRE_RECEIPT,
  );
  const malformed = {
    ...unsigned,
    observationWindows,
  } as unknown as Omit<SyntheticQualityOfHireEvidenceReceiptV1, 'receiptDigest'>;
  return reseal(malformed);
}

describe('QualityOfHireEvidencePanel', () => {
  test('ATS evaluatorinin kanonik authority ve digest receiptini tuketir', () => {
    render(<QualityOfHireEvidencePanel />);
    const panel = screen.getByTestId('quality-of-hire-evidence-panel');

    expect(panel).toHaveTextContent('Quality-of-Hire Evidence Loop (P6.0)');
    expect(panel).toHaveTextContent('SENTETİK');
    expect(panel).toHaveTextContent('AGGREGATE ONLY');
    expect(panel).toHaveTextContent('REAL ACTIVATION · FALSE');
    expect(SYNTHETIC_QUALITY_OF_HIRE_RECEIPT.intelligenceEvaluationAuthority).toBe(
      'intelligence-evaluation/v1',
    );
    expect(SYNTHETIC_QUALITY_OF_HIRE_RECEIPT.capabilityRef).toBe('capability:qoh:v1');
    expect(SYNTHETIC_QUALITY_OF_HIRE_RECEIPT.receiptDigest).toBe(
      'sha256:b554cc5e38989be32e69841d554276272d7e72d1aeebf8cb30316e19610c6855',
    );
    expect(validateSyntheticQualityOfHireReceipt(SYNTHETIC_QUALITY_OF_HIRE_RECEIPT)).toEqual({
      valid: true,
      issues: [],
      status: 'DESCRIPTIVE_ASSOCIATION_ONLY',
    });
  });

  test('90 ve 180 gunun her birinde exact dort outcome boyutunu ayirir', () => {
    render(<QualityOfHireEvidencePanel />);
    const day90 = screen.getByTestId('qoh-window-DAY_90');
    const day180 = screen.getByTestId('qoh-window-DAY_180');

    expect(day90).toHaveTextContent('90 gün');
    expect(day180).toHaveTextContent('180 gün');
    expect(within(day90).getAllByRole('button')).toHaveLength(4);
    expect(within(day180).getAllByRole('button')).toHaveLength(4);
    expect(day90).toHaveTextContent('Eligible 200 · Observed 160');
    expect(day90).toHaveTextContent('Missing 20 · Censored 20');
    expect(day180).toHaveTextContent('Outcome category 100 · 62.5%');
    for (const label of [
      'Retention',
      'Yapılandırılmış ramp milestone',
      'Yönetici rubric outcome',
      'Yeni çalışan deneyimi',
    ]) {
      expect(day90).toHaveTextContent(label);
      expect(day180).toHaveTextContent(label);
    }
  });

  test('rate missingness ve Wilson araligini receipt sayimlarindan dogrular', () => {
    render(<QualityOfHireEvidencePanel />);
    const managerOutcome = within(screen.getByTestId('qoh-window-DAY_90')).getByRole('button', {
      name: /Yönetici rubric outcome/,
    });

    fireEvent.click(managerOutcome);

    const detail = screen.getByTestId('qoh-dimension-detail');
    expect(managerOutcome).toHaveAttribute('aria-pressed', 'true');
    expect(detail).toHaveFocus();
    expect(detail).toHaveAccessibleName('Seçilen Quality-of-Hire outcome lineage detayı');
    expect(detail).toHaveTextContent('CONTESTABLE ASSOCIATION INPUT');
    expect(detail).toHaveTextContent('Outcome category: category_3333333333333333');
    expect(detail).toHaveTextContent('Outcome category 100 · 62.5%');
    expect(detail).toHaveTextContent('Wilson %95 0.548–0.696');
    expect(detail).toHaveTextContent('nedensel kalite hükmü değildir');
  });

  test('istatistik ve disclosure minimumlarini privacy guardlardan ayirir', () => {
    render(<QualityOfHireEvidencePanel />);
    const privacy = screen.getByTestId('qoh-measurement-privacy');

    expect(privacy).toHaveTextContent('Authority: intelligence-evaluation/v1');
    expect(privacy).toHaveTextContent('İstatistik minimumu 30 · disclosure minimumu 20');
    expect(privacy).toHaveTextContent('WILSON_SCORE_95');
    expect(privacy).toHaveTextContent('suppression:qoh:small-cohort:v1');
    expect(privacy).toHaveTextContent('differencing-control:qoh:synthetic:v1');
    expect(privacy).toHaveTextContent('query-budget:qoh:synthetic:v1');
    expect(privacy).toHaveTextContent('sektör-geneli yeterlilik iddiası değildir');
  });

  test('lineage correction appeal retention access ve evaluator digestini gorunur tutar', () => {
    render(<QualityOfHireEvidencePanel />);

    const lineage = screen.getByTestId('qoh-outcome-lineage');
    expect(lineage).toHaveTextContent('evidence-aggregate:hiring:synthetic:v1');
    expect(lineage).toHaveTextContent('hris-outcome-snapshot:synthetic:v1');
    expect(lineage).toHaveTextContent(SYNTHETIC_QUALITY_OF_HIRE_RECEIPT.receiptDigest);
    const governance = screen.getByTestId('qoh-governance-lineage');
    expect(governance).toHaveTextContent('correction:qoh:synthetic:v1');
    expect(governance).toHaveTextContent('appeal:qoh:synthetic:v1');
    expect(governance).toHaveTextContent('retention:qoh:synthetic:v1');
    expect(governance).toHaveTextContent('access:qoh:aggregate-only:v1');
    expect(governance).toHaveTextContent('erasure:qoh:propagation:v1');
    expect(governance).toHaveTextContent('yalnız ORIGINAL receipt gösterir');
    expect(governance).toHaveTextContent(
      'doğrulanmış previous receipt chain olmadan fail-closed reddedilir',
    );
  });

  test('legal audit customer owner ve action kapilarini kapali tutar', () => {
    render(<QualityOfHireEvidencePanel />);
    const gates = screen.getByTestId('qoh-activation-gates');
    const panel = screen.getByTestId('quality-of-hire-evidence-panel');

    expect(gates).toHaveTextContent('SYNTHETIC_EVIDENCE_ONLY');
    expect(within(gates).getAllByText('NOT_MET')).toHaveLength(4);
    expect(gates).toHaveTextContent('Customer controller');
    expect(gates).toHaveTextContent('PRODUCTION · FALSE');
    expect(screen.getByTestId('qoh-activate-button')).toBeDisabled();
    expect(within(panel).getByRole('button', { name: 'Düzeltme isteği oluştur' })).toBeDisabled();
    expect(
      within(panel).getByRole('button', { name: 'Aggregate evidence dışa aktar' }),
    ).toBeDisabled();
    expect(
      within(panel).getByRole('button', { name: 'Aggregate evidence dışa aktar' }),
    ).toHaveStyle({
      minWidth: 0,
      maxWidth: '100%',
      height: 'auto',
      minHeight: '2.25rem',
      paddingBlock: '0.5rem',
      whiteSpace: 'normal',
      overflowWrap: 'anywhere',
    });
    expect(screen.getByTestId('qoh-action-block-reason')).toHaveTextContent(
      'Legal, bağımsız audit, müşteri-controller ve owner gate olmadan',
    );

    for (const forbiddenName of [
      'Adayı sırala',
      'Adayı puanla',
      'Adayı reddet',
      'Adayı işe al',
      'Çalışanı puanla',
      'Performans aksiyonu oluştur',
      'Seçim modelini eğit',
      'Modeli optimize et',
    ]) {
      expect(screen.queryByRole('button', { name: forbiddenName })).not.toBeInTheDocument();
    }
  });

  test('fixture raw kisi performance protected veya training label tasimaz', () => {
    const serialized = JSON.stringify(SYNTHETIC_QUALITY_OF_HIRE_RECEIPT);
    for (const field of BANNED_QUALITY_OF_HIRE_SURFACE_FIELDS) {
      expect(serialized).not.toContain(`"${field}"`);
    }
    expect(SYNTHETIC_QUALITY_OF_HIRE_RECEIPT.containsPersonLevelOutcome).toBe(false);
    expect(SYNTHETIC_QUALITY_OF_HIRE_RECEIPT.selectionModelOptimizationAllowed).toBe(false);
    expect(SYNTHETIC_QUALITY_OF_HIRE_RECEIPT.modelTrainingUseAllowed).toBe(false);
  });

  test('tampered rate ve interval digest gecerli gorunse bile trace fail-closed olur', () => {
    const { receiptDigest: _digest, ...unsigned } = structuredClone(
      SYNTHETIC_QUALITY_OF_HIRE_RECEIPT,
    );
    unsigned.observationWindows[0]!.dimensions[0]!.outcomeCategoryRate = 0.01;
    unsigned.observationWindows[0]!.dimensions[0]!.uncertaintyInterval!.lower = 0.01;
    const tampered = reseal(unsigned);

    const validation = validateSyntheticQualityOfHireReceipt(tampered);
    expect(validation.valid).toBe(false);
    expect(validation.issues).toContain('DERIVED_STATISTIC_MISMATCH:90:RETENTION');
    render(<QualityOfHireEvidencePanel receipt={tampered} />);
    expect(screen.getByTestId('quality-of-hire-evidence-panel')).toHaveTextContent(
      'TRACE FAIL-CLOSED',
    );
  });

  test('descriptive receipt sample disclosure veya missingness esigini ihlal edemez', () => {
    const { receiptDigest: _digest, ...unsigned } = structuredClone(
      SYNTHETIC_QUALITY_OF_HIRE_RECEIPT,
    );
    const mutableUnsigned = unsigned as unknown as {
      minimumStatisticalSampleSize: number;
      minimumDisclosureSampleSize: number;
      maximumMissingnessRate: number;
    };
    mutableUnsigned.minimumStatisticalSampleSize = 101;
    mutableUnsigned.minimumDisclosureSampleSize = 101;
    mutableUnsigned.maximumMissingnessRate = 0.01;
    const thresholdBypass = reseal(unsigned);

    const validation = validateSyntheticQualityOfHireReceipt(thresholdBypass);
    expect(validation.valid).toBe(false);
    expect(validation.issues).toContain('STATUS_THRESHOLD_MISMATCH:90:RETENTION');
    expect(validation.issues).toContain('STATUS_THRESHOLD_MISMATCH:180:NEW_HIRE_EXPERIENCE');
  });

  test('visible receipt small category complement missing veya censored hucre sizdiramaz', () => {
    const mutators: Array<
      (dimension: {
        eligibleCount: number | null;
        observedCount: number | null;
        missingCount: number | null;
        censoredCount: number | null;
        outcomeCategoryCount: number | null;
      }) => void
    > = [
      (dimension) => {
        dimension.outcomeCategoryCount = 1;
      },
      (dimension) => {
        dimension.outcomeCategoryCount = 159;
      },
      (dimension) => {
        dimension.missingCount = 1;
        dimension.censoredCount = 39;
      },
      (dimension) => {
        dimension.missingCount = 39;
        dimension.censoredCount = 1;
      },
    ];

    for (const mutate of mutators) {
      const { receiptDigest: _digest, ...unsigned } = structuredClone(
        SYNTHETIC_QUALITY_OF_HIRE_RECEIPT,
      );
      const dimension = unsigned.observationWindows[0]!.dimensions[0]! as {
        eligibleCount: number | null;
        observedCount: number | null;
        missingCount: number | null;
        censoredCount: number | null;
        outcomeCategoryCount: number | null;
      };
      mutate(dimension);
      const validation = validateSyntheticQualityOfHireReceipt(reseal(unsigned));
      expect(validation.valid).toBe(false);
      expect(validation.issues).toContain('STATUS_THRESHOLD_MISMATCH:90:RETENTION');
    }
  });

  test('measurement esikleri positive integer ve bounded rate olmak zorundadir', () => {
    const { receiptDigest: _digest, ...unsigned } = structuredClone(
      SYNTHETIC_QUALITY_OF_HIRE_RECEIPT,
    );
    const mutableUnsigned = unsigned as unknown as {
      minimumStatisticalSampleSize: number;
      maximumMissingnessRate: number;
    };
    mutableUnsigned.minimumStatisticalSampleSize = 0;
    mutableUnsigned.maximumMissingnessRate = 2;
    const invalidThresholds = reseal(unsigned);

    expect(validateSyntheticQualityOfHireReceipt(invalidThresholds).issues).toContain(
      'MEASUREMENT_THRESHOLD_INVALID',
    );
  });

  test('resealed receipt canonical governance ve causality literallerini bypass edemez', () => {
    const { receiptDigest: _digest, ...unsigned } = structuredClone(
      SYNTHETIC_QUALITY_OF_HIRE_RECEIPT,
    );
    const bypass = unsigned as unknown as {
      humanReviewRequired: boolean;
      groundTruthStatus: string;
      complianceConclusion: string;
      uncertaintyMethod: string;
      comparisonProtocol: { preregistered: boolean; causalClaimAllowed: boolean };
      governance: { humanOversightStandardRef: string };
    };
    bypass.humanReviewRequired = false;
    bypass.groundTruthStatus = 'PROVEN';
    bypass.complianceConclusion = 'PASS';
    bypass.uncertaintyMethod = 'UNVERIFIED';
    bypass.comparisonProtocol.preregistered = false;
    bypass.comparisonProtocol.causalClaimAllowed = true;
    bypass.governance.humanOversightStandardRef = 'human-oversight:none';
    const resealedBypass = reseal(
      unsigned as unknown as Omit<SyntheticQualityOfHireEvidenceReceiptV1, 'receiptDigest'>,
    );

    const validation = validateSyntheticQualityOfHireReceipt(resealedBypass);
    expect(validation.valid).toBe(false);
    expect(validation.issues).toContain('ACTION_OR_FEEDBACK_BYPASS');
    expect(validation.issues).toContain('COMPARISON_PROTOCOL_BYPASS');
    expect(validation.issues).toContain('GOVERNANCE_LINEAGE_INCOMPLETE');
  });

  test('resealed receipt forbidden raw employee performance alani tasiyamaz', () => {
    const { receiptDigest: _digest, ...unsigned } = structuredClone(
      SYNTHETIC_QUALITY_OF_HIRE_RECEIPT,
    );
    const withRawPerformance = {
      ...unsigned,
      rawEmployeePerformance: 'secret',
    } as unknown as Omit<SyntheticQualityOfHireEvidenceReceiptV1, 'receiptDigest'>;
    const resealedWithRawPerformance = reseal(withRawPerformance);

    expect(validateSyntheticQualityOfHireReceipt(resealedWithRawPerformance).issues).toContain(
      'FORBIDDEN_FIELD:rawEmployeePerformance',
    );
  });

  test('correction reason supersession ve status atomik kalir', () => {
    const { receiptDigest: _digest, ...unsigned } = structuredClone(
      SYNTHETIC_QUALITY_OF_HIRE_RECEIPT,
    );
    const mismatch = {
      ...unsigned,
      correctionReasonRef: 'correction-reason:qoh:synthetic:v1',
      supersedesReceiptDigest: null,
      correctionStatus: 'ORIGINAL',
    } as unknown as Omit<SyntheticQualityOfHireEvidenceReceiptV1, 'receiptDigest'>;

    expect(validateSyntheticQualityOfHireReceipt(reseal(mismatch)).issues).toContain(
      'CORRECTION_SUPERSESSION_INVALID',
    );
  });

  test('trusted previous receipt olmadan resealed correction lineage fail-closed olur', () => {
    const { receiptDigest: _digest, ...unsigned } = structuredClone(
      SYNTHETIC_QUALITY_OF_HIRE_RECEIPT,
    );
    const correction = {
      ...unsigned,
      correctionReasonRef: 'correction-reason:qoh:synthetic:v1',
      supersedesReceiptDigest: `sha256:${'f'.repeat(64)}`,
      correctionStatus: 'SUPERSEDING_SYNTHETIC_CORRECTION',
    } as const satisfies Omit<SyntheticQualityOfHireEvidenceReceiptV1, 'receiptDigest'>;
    const resealedCorrection = reseal(correction);

    const validation = validateSyntheticQualityOfHireReceipt(resealedCorrection);
    expect(validation.valid).toBe(false);
    expect(validation.issues).toContain('CORRECTION_TRUSTED_PREVIOUS_RECEIPT_REQUIRED');
    render(<QualityOfHireEvidencePanel receipt={resealedCorrection} />);
    expect(screen.getByTestId('quality-of-hire-evidence-panel')).toHaveTextContent(
      'TRACE FAIL-CLOSED',
    );
    expect(screen.queryByTestId('qoh-governance-lineage')).not.toBeInTheDocument();
  });

  test('ATS canonical window ve dimension orderindan sapan resealed receiptleri reddeder', () => {
    const { receiptDigest: _digest, ...unsigned } = structuredClone(
      SYNTHETIC_QUALITY_OF_HIRE_RECEIPT,
    );
    unsigned.observationWindows.reverse();
    const reversedWindows = reseal(unsigned);
    expect(validateSyntheticQualityOfHireReceipt(reversedWindows).issues).toContain(
      'QOH_RECEIPT_WINDOW_ORDER_INVALID',
    );

    const { receiptDigest: _secondDigest, ...secondUnsigned } = structuredClone(
      SYNTHETIC_QUALITY_OF_HIRE_RECEIPT,
    );
    secondUnsigned.observationWindows[0]!.dimensions.reverse();
    const reversedDimensions = reseal(secondUnsigned);
    expect(validateSyntheticQualityOfHireReceipt(reversedDimensions).issues).toContain(
      'QOH_RECEIPT_DIMENSION_ORDER_INVALID:90',
    );
  });

  test.each(['minimumStatisticalSampleSize', 'minimumDisclosureSampleSize'] as const)(
    'ATS %s icin 10 milyon measurement threshold ust sinirini uygular',
    (field) => {
      const { receiptDigest: _digest, ...unsigned } = structuredClone(
        SYNTHETIC_QUALITY_OF_HIRE_RECEIPT,
      );
      const mutable = unsigned as unknown as Record<
        'minimumStatisticalSampleSize' | 'minimumDisclosureSampleSize',
        number
      >;
      mutable[field] = 10_000_001;

      expect(validateSyntheticQualityOfHireReceipt(reseal(unsigned)).issues).toContain(
        'MEASUREMENT_THRESHOLD_INVALID',
      );
    },
  );

  test.each([
    'eligibleCount',
    'observedCount',
    'missingCount',
    'censoredCount',
    'outcomeCategoryCount',
  ] as const)('ATS %s icin 10 milyon visible-count ust sinirini uygular', (field) => {
    const { receiptDigest: _digest, ...unsigned } = structuredClone(
      SYNTHETIC_QUALITY_OF_HIRE_RECEIPT,
    );
    const mutable = unsigned as unknown as {
      observationWindows: Array<{
        dimensions: Array<{
          eligibleCount: number;
          observedCount: number;
          missingCount: number;
          censoredCount: number;
          outcomeCategoryCount: number;
        }>;
      }>;
    };
    const dimension = mutable.observationWindows[0]!.dimensions[0]!;
    dimension[field] = 10_000_001;
    const overLimit = reseal(unsigned);

    const validation = validateSyntheticQualityOfHireReceipt(overLimit);
    expect(validation.issues).toContain('DIMENSION_AGGREGATE_INVALID:90:RETENTION');
  });

  test('ATS exact 10 milyon count ve threshold kabul sinirini korur', () => {
    const thresholdReceipt = suppressedReceipt();
    const { receiptDigest: _thresholdDigest, ...thresholdUnsigned } =
      structuredClone(thresholdReceipt);
    const mutableThresholds = thresholdUnsigned as unknown as {
      minimumStatisticalSampleSize: number;
      minimumDisclosureSampleSize: number;
    };
    mutableThresholds.minimumStatisticalSampleSize = 10_000_000;
    mutableThresholds.minimumDisclosureSampleSize = 10_000_000;
    expect(validateSyntheticQualityOfHireReceipt(reseal(thresholdUnsigned)).valid).toBe(true);

    const { receiptDigest: _countDigest, ...countUnsigned } = structuredClone(
      SYNTHETIC_QUALITY_OF_HIRE_RECEIPT,
    );
    const z = 1.959963984540054;
    const selected = 5_000_000;
    const population = 8_000_000;
    const observed = selected / population;
    const denominator = 1 + (z * z) / population;
    const center = (observed + (z * z) / (2 * population)) / denominator;
    const margin =
      (z * Math.sqrt((observed * (1 - observed) + (z * z) / (4 * population)) / population)) /
      denominator;
    const interval = {
      lower: Number(Math.max(0, center - margin).toFixed(6)),
      upper: Number(Math.min(1, center + margin).toFixed(6)),
      confidenceLevel: 0.95 as const,
      method: 'WILSON_SCORE' as const,
    };
    for (const window of countUnsigned.observationWindows) {
      for (const dimension of window.dimensions) {
        const mutableDimension = dimension as unknown as {
          eligibleCount: number;
          observedCount: number;
          missingCount: number;
          censoredCount: number;
          outcomeCategoryCount: number;
          missingnessRate: number;
          outcomeCategoryRate: number;
          uncertaintyInterval: typeof interval;
        };
        mutableDimension.eligibleCount = 10_000_000;
        mutableDimension.observedCount = population;
        mutableDimension.missingCount = 1_000_000;
        mutableDimension.censoredCount = 1_000_000;
        mutableDimension.outcomeCategoryCount = selected;
        mutableDimension.missingnessRate = 0.1;
        mutableDimension.outcomeCategoryRate = observed;
        mutableDimension.uncertaintyInterval = interval;
      }
    }
    expect(validateSyntheticQualityOfHireReceipt(reseal(countUnsigned)).valid).toBe(true);
  });

  test.each([
    [
      'empty confounder list',
      (unsigned: Omit<SyntheticQualityOfHireEvidenceReceiptV1, 'receiptDigest'>) => {
        (unsigned as unknown as { confounderPlanRefs: string[] }).confounderPlanRefs = [];
      },
      'QOH_CONFOUNDER_REFS_NOT_CANONICAL',
    ],
    [
      'duplicate confounder list',
      (unsigned: Omit<SyntheticQualityOfHireEvidenceReceiptV1, 'receiptDigest'>) => {
        (unsigned as unknown as { confounderPlanRefs: string[] }).confounderPlanRefs = [
          'confounder:qoh:duplicate:v1',
          'confounder:qoh:duplicate:v1',
        ];
      },
      'QOH_CONFOUNDER_REFS_NOT_CANONICAL',
    ],
    [
      'invalid confounder ref',
      (unsigned: Omit<SyntheticQualityOfHireEvidenceReceiptV1, 'receiptDigest'>) => {
        (unsigned as unknown as { confounderPlanRefs: string[] }).confounderPlanRefs = [
          'not a canonical ref',
        ];
      },
      'QOH_CONFOUNDER_REFS_NOT_CANONICAL',
    ],
    [
      'empty source schema list',
      (unsigned: Omit<SyntheticQualityOfHireEvidenceReceiptV1, 'receiptDigest'>) => {
        (
          unsigned.lineage as unknown as { sourceSchemaVersionRefs: string[] }
        ).sourceSchemaVersionRefs = [];
      },
      'QOH_SOURCE_SCHEMA_REFS_NOT_CANONICAL',
    ],
    [
      'duplicate source schema list',
      (unsigned: Omit<SyntheticQualityOfHireEvidenceReceiptV1, 'receiptDigest'>) => {
        (
          unsigned.lineage as unknown as { sourceSchemaVersionRefs: string[] }
        ).sourceSchemaVersionRefs = ['schema:qoh:duplicate:v1', 'schema:qoh:duplicate:v1'];
      },
      'QOH_SOURCE_SCHEMA_REFS_NOT_CANONICAL',
    ],
    [
      'invalid source schema ref',
      (unsigned: Omit<SyntheticQualityOfHireEvidenceReceiptV1, 'receiptDigest'>) => {
        (
          unsigned.lineage as unknown as { sourceSchemaVersionRefs: string[] }
        ).sourceSchemaVersionRefs = ['not a canonical ref'];
      },
      'QOH_SOURCE_SCHEMA_REFS_NOT_CANONICAL',
    ],
    [
      'unsorted confounders',
      (unsigned: Omit<SyntheticQualityOfHireEvidenceReceiptV1, 'receiptDigest'>) => {
        (unsigned.confounderPlanRefs as string[]).reverse();
      },
      'QOH_CONFOUNDER_REFS_NOT_CANONICAL',
    ],
    [
      'unsorted source schemas',
      (unsigned: Omit<SyntheticQualityOfHireEvidenceReceiptV1, 'receiptDigest'>) => {
        (unsigned.lineage.sourceSchemaVersionRefs as string[]).reverse();
      },
      'QOH_SOURCE_SCHEMA_REFS_NOT_CANONICAL',
    ],
    [
      'oversized confounder list',
      (unsigned: Omit<SyntheticQualityOfHireEvidenceReceiptV1, 'receiptDigest'>) => {
        (unsigned as unknown as { confounderPlanRefs: string[] }).confounderPlanRefs = Array.from(
          { length: 21 },
          (_, index) => `confounder:qoh:${String(index).padStart(2, '0')}:v1`,
        );
      },
      'QOH_CONFOUNDER_REFS_NOT_CANONICAL',
    ],
    [
      'oversized source schema list',
      (unsigned: Omit<SyntheticQualityOfHireEvidenceReceiptV1, 'receiptDigest'>) => {
        (
          unsigned.lineage as unknown as { sourceSchemaVersionRefs: string[] }
        ).sourceSchemaVersionRefs = Array.from(
          { length: 21 },
          (_, index) => `schema:qoh:${String(index).padStart(2, '0')}:v1`,
        );
      },
      'QOH_SOURCE_SCHEMA_REFS_NOT_CANONICAL',
    ],
  ])('%s canonical ATS ref-list sinirinda fail-closed olur', (_name, mutate, issue) => {
    const { receiptDigest: _digest, ...unsigned } = structuredClone(
      SYNTHETIC_QUALITY_OF_HIRE_RECEIPT,
    );
    mutate(unsigned);
    expect(validateSyntheticQualityOfHireReceipt(reseal(unsigned)).issues).toContain(issue);
  });

  test('iki canonical ref listesi exact 20 eleman sinirinda kabul edilir', () => {
    const { receiptDigest: _digest, ...unsigned } = structuredClone(
      SYNTHETIC_QUALITY_OF_HIRE_RECEIPT,
    );
    (unsigned as unknown as { confounderPlanRefs: string[] }).confounderPlanRefs = Array.from(
      { length: 20 },
      (_, index) => `confounder:qoh:${String(index).padStart(2, '0')}:v1`,
    );
    (unsigned.lineage as unknown as { sourceSchemaVersionRefs: string[] }).sourceSchemaVersionRefs =
      Array.from({ length: 20 }, (_, index) => `schema:qoh:${String(index).padStart(2, '0')}:v1`);

    expect(validateSyntheticQualityOfHireReceipt(reseal(unsigned)).valid).toBe(true);
  });

  test('bilinmeyen status suppression davranisini descriptive moda dusuremez', () => {
    const { receiptDigest: _digest, ...unsigned } = structuredClone(
      SYNTHETIC_QUALITY_OF_HIRE_RECEIPT,
    );
    const unknownStatus = {
      ...unsigned,
      status: 'INSUFFICIENT',
      insufficiencyReasons: ['DISCLOSURE_SAMPLE_BELOW_MINIMUM'],
    } as unknown as Omit<SyntheticQualityOfHireEvidenceReceiptV1, 'receiptDigest'>;
    const receipt = reseal(unknownStatus);

    expect(validateSyntheticQualityOfHireReceipt(receipt).issues).toContain(
      'STATUS_REASON_MISMATCH',
    );
    render(<QualityOfHireEvidencePanel receipt={receipt} />);
    const panel = screen.getByTestId('quality-of-hire-evidence-panel');
    expect(panel).toHaveTextContent('TRACE FAIL-CLOSED');
    expect(panel).not.toHaveTextContent('Eligible 200');
  });

  test('bilinmeyen comparison kind kapali enum disina cikamaz', () => {
    const { receiptDigest: _digest, ...unsigned } = structuredClone(
      SYNTHETIC_QUALITY_OF_HIRE_RECEIPT,
    );
    const unknownComparison = {
      ...unsigned,
      comparisonProtocol: {
        ...unsigned.comparisonProtocol,
        kind: 'CAUSAL_EXPERIMENT',
      },
    } as unknown as Omit<SyntheticQualityOfHireEvidenceReceiptV1, 'receiptDigest'>;

    expect(validateSyntheticQualityOfHireReceipt(reseal(unknownComparison)).issues).toContain(
      'COMPARISON_PROTOCOL_BYPASS',
    );
  });

  test('exact key set listede olmayan raw payload alanini reddeder', () => {
    const { receiptDigest: _digest, ...unsigned } = structuredClone(
      SYNTHETIC_QUALITY_OF_HIRE_RECEIPT,
    );
    const unknownPayload = {
      ...unsigned,
      rawOutcomeNotes: 'Alice salary and manager notes',
    } as unknown as Omit<SyntheticQualityOfHireEvidenceReceiptV1, 'receiptDigest'>;

    const validation = validateSyntheticQualityOfHireReceipt(reseal(unknownPayload));
    expect(validation.valid).toBe(false);
    expect(validation.issues).toContain(
      'RECEIPT_KEY_SET_INVALID:unexpected=rawOutcomeNotes:missing=none',
    );
  });

  test('malformed nested receipt exception yerine trace fail-closed yuzeyi verir', () => {
    const canonicalWindows = structuredClone(SYNTHETIC_QUALITY_OF_HIRE_RECEIPT.observationWindows);
    const malformedReceipts = [
      receiptWithMalformedWindows([null, canonicalWindows[1]]),
      receiptWithMalformedWindows([{ windowDays: 90 }, canonicalWindows[1]]),
      receiptWithMalformedWindows([
        { ...canonicalWindows[0], dimensions: [null, ...canonicalWindows[0]!.dimensions.slice(1)] },
        canonicalWindows[1],
      ]),
      receiptWithMalformedWindows([
        { ...canonicalWindows[0], dimensions: [7, ...canonicalWindows[0]!.dimensions.slice(1)] },
        canonicalWindows[1],
      ]),
    ];

    for (const receipt of malformedReceipts) {
      expect(() => validateSyntheticQualityOfHireReceipt(receipt)).not.toThrow();
      expect(validateSyntheticQualityOfHireReceipt(receipt).valid).toBe(false);
      const view = render(<QualityOfHireEvidencePanel receipt={receipt} />);
      expect(view.getByTestId('quality-of-hire-evidence-panel')).toHaveTextContent(
        'TRACE FAIL-CLOSED',
      );
      view.unmount();
    }
  });

  test('receipt govdesi digest yenilenmeden degisirse fail-closed olur', () => {
    const tampered = {
      ...SYNTHETIC_QUALITY_OF_HIRE_RECEIPT,
      measurementPlanRef: 'measurement-plan:qoh:tampered:v1',
    } as SyntheticQualityOfHireEvidenceReceiptV1;

    expect(validateSyntheticQualityOfHireReceipt(tampered).issues).toContain(
      'QOH_RECEIPT_DIGEST_MISMATCH',
    );
  });

  test('insufficient receipt butun aggregate count rate ve intervalleri gizler', () => {
    const receipt = suppressedReceipt();
    expect(validateSyntheticQualityOfHireReceipt(receipt)).toEqual({
      valid: true,
      issues: [],
      status: 'SMALL_COHORT_SUPPRESSED',
    });

    render(<QualityOfHireEvidencePanel receipt={receipt} />);
    const panel = screen.getByTestId('quality-of-hire-evidence-panel');
    expect(panel).toHaveTextContent('YETERSİZ VERİ · AGGREGATE GİZLENDİ');
    expect(panel).toHaveTextContent('Aggregate değer gizlendi');
    expect(panel).not.toHaveTextContent('Eligible 200');
    expect(panel).not.toHaveTextContent('Observed 160');
    expect(panel).not.toHaveTextContent('Outcome category 100');
    expect(panel).not.toHaveTextContent('62.5%');
    expect(screen.queryByTestId('qoh-dimension-detail')).not.toBeInTheDocument();
    expect(screen.getByTestId('qoh-window-DAY_90').querySelectorAll('button')).toHaveLength(0);
  });

  test('suppressed receiptte tek aggregate deger sizarsa trace fail-closed olur', () => {
    const suppressed = suppressedReceipt();
    const { receiptDigest: _digest, ...unsigned } = structuredClone(suppressed);
    const mutableUnsigned = unsigned as unknown as {
      observationWindows: Array<{ dimensions: Array<{ observedCount: number | null }> }>;
    };
    mutableUnsigned.observationWindows[0]!.dimensions[0]!.observedCount = 7;
    const leaking = reseal(unsigned);

    const validation = validateSyntheticQualityOfHireReceipt(leaking);
    expect(validation.valid).toBe(false);
    expect(validation.issues).toContain('SUPPRESSION_LEAK:90:RETENTION');
  });

  test('dar yuzeyde outcome kartlari responsive minmax grid kullanir', () => {
    render(<QualityOfHireEvidencePanel />);
    expect(
      screen.getByRole('group', { name: '90 gün Quality-of-Hire outcome boyutları' }),
    ).toHaveStyle({
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))',
    });
  });
});
