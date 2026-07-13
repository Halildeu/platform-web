import type {
  IntelligenceHardBan,
  SyntheticApprovalCheckpoint,
  SyntheticIntelligenceCapability,
} from './types';

export const BANNED_INTELLIGENCE_FIELDS = [
  'affectScore',
  'sentimentScore',
  'personalityProfile',
  'rankingScore',
  'candidateRank',
] as const;

export const INTELLIGENCE_HARD_BANS: readonly IntelligenceHardBan[] = [
  {
    id: 'no-affect',
    label: 'Affect / emotion / personality çıkarımı yok',
    reason: 'İstihdam kararında bilimsel geçerlilik ve temel hak riski kabul edilemez.',
  },
  {
    id: 'no-auto-decision',
    label: 'Otomatik red veya işe-alım kararı yok',
    reason: 'AI yalnız kanıt veya proposal üretir; nihai kararı yetkili insan verir.',
  },
  {
    id: 'no-hidden-ranking',
    label: 'Doğrulanmamış ranking veya gizli skor yok',
    reason:
      'Aday ve çalışan sırası ölçüm protokolü, açıklama ve bağımsız evidence olmadan üretilemez.',
  },
  {
    id: 'no-deepfake-adverse',
    label: 'Deepfake/provenance sinyali tek başına olumsuz karar değildir',
    reason: 'Sinyal yalnız insan incelemesine yönlendirebilir; otomatik adverse action tetiklemez.',
  },
  {
    id: 'no-proxy-optimization',
    label: 'Protected attribute veya proxy optimizasyonu yok',
    reason:
      'Korunan özellikler karar özelliği değil, yalnız kontrollü fairness audit cohort alanıdır.',
  },
  {
    id: 'no-agentic-mutation',
    label: 'İnsan onayı olmadan agentic mutation yok',
    reason: 'Mesaj, red, teklif, profil veya workflow state değişikliği proposal-only kalır.',
  },
] as const;

export const SYNTHETIC_APPROVAL_CHECKPOINTS: readonly SyntheticApprovalCheckpoint[] = [
  {
    id: 'MEASUREMENT_PLAN',
    label: 'Measurement plan',
    status: 'PENDING',
    humanApproved: false,
    reason: 'Metric, cohort, ground-truth ve guardrail owner onayı bekliyor.',
  },
  {
    id: 'INDEPENDENT_EVIDENCE',
    label: 'Independent evidence receipt',
    status: 'PENDING',
    humanApproved: false,
    reason: 'Bağımsız fairness/safety evidence receipt bağlı değil.',
  },
  {
    id: 'HUMAN_REVIEW',
    label: 'Human decision review',
    status: 'PENDING',
    humanApproved: false,
    reason: 'Yetkili insan reviewer ayrı checkpoint onayı vermedi.',
  },
  {
    id: 'DOWNSTREAM_MUTATION',
    label: 'Downstream mutation / export',
    status: 'BLOCKED',
    humanApproved: false,
    reason: 'Önceki her checkpoint ayrı ayrı onaylanmadan mutation açılamaz.',
  },
] as const;

export const SYNTHETIC_INTELLIGENCE_CAPABILITIES: readonly SyntheticIntelligenceCapability[] = [
  {
    schemaVersion: 'p6.intelligence-governance.v1',
    id: 'QUALITY_OF_HIRE',
    name: 'Quality of Hire outcomes',
    description: 'İşe alım sonrası sonuçları işe-alım kanıtıyla ilişkilendiren ölçüm hipotezi.',
    status: 'RESEARCH_ONLY',
    standard:
      'NIST AI RMF / ISO/IEC 42001 evidence-input alignment · sertifika veya uygunluk beyanı değil',
    allowedUse: '90/180 günlük aggregate outcome hipotezi ve ölçüm planı taslağı.',
    prohibitedUse: 'Tek çalışana performans skoru veya geçmiş adaylar için geriye dönük ranking.',
    measurement: {
      metric: '90/180 gün retention + yapılandırılmış manager/candidate outcome',
      cohort: 'Rol, lokasyon ve işe-alım dönemi; minimum örnek eşiği gerekli',
      groundTruth: 'HRIS outcome + insan doğrulamalı performans rubric receipt',
      guardrail: 'Proxy feature ve tek-metrik başarı tanımı yasak',
    },
    fullAtsAccepted: false,
    evidenceVerified: false,
    humanApproved: false,
  },
  {
    schemaVersion: 'p6.intelligence-governance.v1',
    id: 'FAIRNESS_EVIDENCE',
    name: 'Fairness / bias evidence',
    description: 'Seçim oranı ve hata dağılımını bağımsız audit için görünür kılan ölçüm alanı.',
    status: 'EVIDENCE_REQUIRED',
    standard: 'EEOC 4/5 screening indicator + NYC LL144-style independent audit',
    allowedUse: 'Adverse-impact risk sinyali ve bağımsız inceleme kuyruğu oluşturmak.',
    prohibitedUse: '4/5 oranını tek başına adil/adil değil kararı veya aday özelliği yapmak.',
    measurement: {
      metric: 'Selection-rate ratio + TPR/FPR farkları; belirsizlik aralığıyla',
      cohort: 'Yasal dayanaklı korunan cohort; yalnız audit düzleminde',
      groundTruth: 'Bağımsız audit dataset ve versioned decision receipts',
      guardrail: 'Küçük örnek, missingness ve intersectional cohort uyarıları zorunlu',
    },
    fullAtsAccepted: false,
    evidenceVerified: false,
    humanApproved: false,
  },
  {
    schemaVersion: 'p6.intelligence-governance.v1',
    id: 'INTERVIEWER_COACHING',
    name: 'Interviewer coaching',
    description:
      'Yapılandırılmış görüşme rubric uyumuna ilişkin insan-onaylı geri bildirim taslağı.',
    status: 'PROPOSAL_ONLY',
    standard: 'Structured hiring / human oversight',
    allowedUse: 'Soru kapsama ve rubric tutarlılığı için coaching proposal üretmek.',
    prohibitedUse: 'Aday ranking, emotion inference veya intervieweri otomatik cezalandırmak.',
    measurement: {
      metric: 'Rubric coverage, evidence citation rate ve inter-rater consistency',
      cohort: 'Rubric version + rol ailesi; aday kimliği aggregate edilir',
      groundTruth: 'İnsan reviewer onaylı coaching receipt',
      guardrail: 'Aday sonucu coaching hedef değişkeni olamaz',
    },
    fullAtsAccepted: false,
    evidenceVerified: false,
    humanApproved: false,
  },
  {
    schemaVersion: 'p6.intelligence-governance.v1',
    id: 'SKILLS_ONTOLOGY',
    name: 'Skills ontology',
    description:
      'Rol ve kanıt etiketlerini sürümlü, taşınabilir beceri kavramlarına bağlama hipotezi.',
    status: 'RESEARCH_ONLY',
    standard: 'ESCO / O*NET versioned mapping',
    allowedUse: 'İnsan doğrulamalı skill mapping proposal ve ontology drift analizi.',
    prohibitedUse: 'Kanıtsız skill çıkarımı, kişilik etiketi veya açıklamasız ranking.',
    measurement: {
      metric: 'Mapping precision/coverage + ontology version drift',
      cohort: 'Rol ailesi ve dil; locale bazlı coverage raporu',
      groundTruth: 'Domain-expert onaylı mapping seti',
      guardrail: 'Her skill etiketi citation ve ontology version taşır',
    },
    fullAtsAccepted: false,
    evidenceVerified: false,
    humanApproved: false,
  },
  {
    schemaVersion: 'p6.intelligence-governance.v1',
    id: 'DEEPFAKE_PROVENANCE',
    name: 'Deepfake / provenance signals',
    description:
      'Medya provenance sinyalini karar değil inceleme girdisi olarak ele alan guardrail.',
    status: 'BLOCKED',
    standard: 'C2PA provenance + integrity screening protocol (no liveness biometrics)',
    allowedUse: 'Düşük güven sinyalini insan inceleme kuyruğuna proposal olarak göndermek.',
    prohibitedUse: 'Tek sinyalle red, fraud etiketi veya aday profilinde kalıcı risk skoru.',
    measurement: {
      metric: 'False-positive/negative rate + provenance coverage',
      cohort: 'Cihaz, codec, ağ kalitesi ve accessibility senaryoları',
      groundTruth: 'Kontrollü attack corpus + bağımsız insan adjudication',
      guardrail: 'Sinyal adverse action değildir; appeal yolu zorunlu',
    },
    fullAtsAccepted: false,
    evidenceVerified: false,
    humanApproved: false,
  },
  {
    schemaVersion: 'p6.intelligence-governance.v1',
    id: 'INTERNAL_MOBILITY',
    name: 'Internal mobility',
    description: 'Çalışan becerisi ile açık rol arasında rızalı ve açıklanabilir keşif hipotezi.',
    status: 'BLOCKED',
    standard: 'Consent + purpose limitation + ESCO/O*NET evidence',
    allowedUse: 'Çalışana opt-in fırsat proposal ve açıklanabilir skill gap göstermek.',
    prohibitedUse: 'Gizli çalışan ranking, yöneticiden saklı profil veya otomatik eleme.',
    measurement: {
      metric: 'Opt-in coverage, suggestion relevance ve appeal outcome',
      cohort: 'Rızalı çalışanlar; organizasyon/rol bazlı minimum örnek',
      groundTruth: 'Çalışan onayı + recruiter/hiring-manager adjudication',
      guardrail: 'Opt-out ve purpose-limited retention zorunlu',
    },
    fullAtsAccepted: false,
    evidenceVerified: false,
    humanApproved: false,
  },
  {
    schemaVersion: 'p6.intelligence-governance.v1',
    id: 'AGENTIC_WORKFLOW',
    name: 'Agentic workflow',
    description:
      'Yalnız açıklanabilir sonraki-adım proposal üreten, mutation yapmayan son-aşama alanı.',
    status: 'DISALLOWED',
    standard: 'EU AI Act human oversight + auditable approval checkpoint',
    allowedUse: 'Taslak sonraki-adım, gerekçe ve gerekli approval listesini göstermek.',
    prohibitedUse: 'Mesaj gönderme, red/teklif, scheduling veya workflow mutation çalıştırmak.',
    measurement: {
      metric: 'Proposal acceptance/rejection + override reason dağılımı',
      cohort: 'Workflow tipi ve risk sınıfı',
      groundTruth: 'Yetkili insan approval receipt ve immutable audit trail',
      guardrail: 'Her mutation öncesi ayrı human checkpoint; toplu onay yok',
    },
    fullAtsAccepted: false,
    evidenceVerified: false,
    humanApproved: false,
  },
] as const;
