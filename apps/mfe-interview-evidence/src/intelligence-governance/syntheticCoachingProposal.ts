export type CoachingEvidenceType =
  | 'interview_response'
  | 'work_sample'
  | 'portfolio'
  | 'reference_check';

export type CoachingSignalState = 'OBSERVED' | 'NOT_OBSERVED' | 'INSUFFICIENT_EVIDENCE';

export interface SyntheticCoachingCitation {
  readonly citationRef: string;
  readonly evidenceType: CoachingEvidenceType;
  readonly entailment: 'SUPPORTED';
  readonly sourceSegmentRef: string;
  readonly sourceExcerpt: string;
  readonly provenanceRef: string;
}

export interface SyntheticCoachingSuggestion {
  readonly suggestionRef: string;
  readonly label: string;
  readonly kind:
    | 'RUBRIC_COVERAGE_FOLLOW_UP'
    | 'EVIDENCE_GAP_REVIEW'
    | 'PROCESS_PERSPECTIVE_FOLLOW_UP';
  readonly criterionRef: string;
  readonly criterionLabel: string;
  readonly templateRef: string;
  readonly citations: readonly SyntheticCoachingCitation[];
}

export interface SyntheticCoachingSignal {
  readonly signalRef: string;
  readonly label: string;
  readonly state: CoachingSignalState;
  readonly criterionRef: string;
  readonly sessionLevelOnly: true;
}

export interface SyntheticCoachingProposal {
  readonly schemaVersion: 'citation-backed-coaching/v1';
  readonly synthetic: true;
  readonly oversightState: 'AI_SUGGESTED';
  readonly proposalOnly: true;
  readonly aiOutputVersionRef: string;
  readonly proposalDigest: string;
  readonly suggestions: readonly SyntheticCoachingSuggestion[];
  readonly qualitySignals: readonly SyntheticCoachingSignal[];
  readonly appealPathRef: string;
  readonly correctionPathRef: string;
  readonly auditLineageRefs: readonly string[];
  readonly actionAllowed: false;
  readonly mutationAllowed: false;
  readonly productionEligible: false;
}

export const SYNTHETIC_COACHING_PROPOSAL: SyntheticCoachingProposal = {
  schemaVersion: 'citation-backed-coaching/v1',
  synthetic: true,
  oversightState: 'AI_SUGGESTED',
  proposalOnly: true,
  aiOutputVersionRef: 'ai-output:coaching:synthetic:v3',
  proposalDigest: `sha256:${'7'.repeat(64)}`,
  suggestions: [
    {
      suggestionRef: 'suggestion_aaaaaaaaaaaaaaaa',
      label: 'Kriter kapsamını kanıta bağlı takip sorusuyla netleştir',
      kind: 'RUBRIC_COVERAGE_FOLLOW_UP',
      criterionRef: 'criterion_aaaaaaaaaaaaaaaa',
      criterionLabel: 'Sistem tasarımında trade-off açıklığı',
      templateRef: 'template:coaching:rubric-coverage-follow-up:v1',
      citations: [
        {
          citationRef: 'citation_aaaaaaaaaaaaaaaa',
          evidenceType: 'interview_response',
          entailment: 'SUPPORTED',
          sourceSegmentRef: 'segment_aaaaaaaaaaaaaaaa',
          sourceExcerpt:
            'Sentetik segment: Tasarım seçeneğinin gecikme, maliyet ve geri dönüş etkileri birlikte açıklandı.',
          provenanceRef: 'provenance:citation:a:v1',
        },
      ],
    },
    {
      suggestionRef: 'suggestion_bbbbbbbbbbbbbbbb',
      label: 'Eksik kanıt alanını insan incelemesinde görünür tut',
      kind: 'EVIDENCE_GAP_REVIEW',
      criterionRef: 'criterion_bbbbbbbbbbbbbbbb',
      criterionLabel: 'Rollback ve incident öğrenimi',
      templateRef: 'template:coaching:evidence-gap-review:v1',
      citations: [
        {
          citationRef: 'citation_bbbbbbbbbbbbbbbb',
          evidenceType: 'work_sample',
          entailment: 'SUPPORTED',
          sourceSegmentRef: 'segment_bbbbbbbbbbbbbbbb',
          sourceExcerpt:
            'Sentetik segment: Çalışma örneği rollback adımlarını içeriyor; ölçülen kurtarma süresi belirtilmemiş.',
          provenanceRef: 'provenance:citation:b:v1',
        },
      ],
    },
  ],
  qualitySignals: [
    {
      signalRef: 'signal_aaaaaaaaaaaaaaaa',
      label: 'Rubric kapsamı',
      state: 'OBSERVED',
      criterionRef: 'criterion_aaaaaaaaaaaaaaaa',
      sessionLevelOnly: true,
    },
    {
      signalRef: 'signal_bbbbbbbbbbbbbbbb',
      label: 'Süreç perspektifi kapsamı',
      state: 'INSUFFICIENT_EVIDENCE',
      criterionRef: 'criterion_bbbbbbbbbbbbbbbb',
      sessionLevelOnly: true,
    },
  ],
  appealPathRef: 'appeal:coaching:synthetic:v1',
  correctionPathRef: 'correction-path:coaching:synthetic:v1',
  auditLineageRefs: ['audit:coaching:synthetic:v1'],
  actionAllowed: false,
  mutationAllowed: false,
  productionEligible: false,
};

export const BANNED_COACHING_FIXTURE_FIELDS = [
  'candidateId',
  'personName',
  'numericScore',
  'rating',
  'ranking',
  'candidateRank',
  'affect',
  'emotion',
  'personality',
  'deception',
  'audioWaveform',
  'voiceTone',
  'biometricSignal',
  'actionReceipt',
] as const;
