import type { SyntheticConnectorDefinition, SyntheticFieldMapping } from './types';

/**
 * P4-WEB-01 contract-neutral fixture.
 *
 * This registry is deliberately local, synthetic and non-executable. A catalog entry is not
 * integration evidence. No entry may be marked VERIFIED until a versioned backend contract,
 * sandbox proof and owner acceptance exist.
 */
export const SYNTHETIC_CONNECTORS: readonly SyntheticConnectorDefinition[] = [
  {
    schemaVersion: 'p4.integration-catalog.v1',
    id: 'ats-generic',
    name: 'Genel ATS bağlayıcısı',
    category: 'ATS',
    description: 'Aday ve mülakat referansları için sağlayıcıdan bağımsız katalog taslağı.',
    status: 'UNVERIFIED',
    apiVerified: false,
    capabilities: ['READ', 'TEST', 'WRITE'],
    statusReason: 'Sürümlemeli API sözleşmesi ve sandbox kanıtı henüz yok.',
  },
  {
    schemaVersion: 'p4.integration-catalog.v1',
    id: 'hris-generic',
    name: 'Genel HRIS bağlayıcısı',
    category: 'HRIS',
    description: 'İşe alım sonrası çalışan devri için yalnız kapsam ve alan önizlemesi.',
    status: 'BLOCKED',
    apiVerified: false,
    capabilities: ['READ', 'WRITE'],
    statusReason: 'G0 ve ücretli partner acceptance tamamlanmadan çalışan verisi açılamaz.',
  },
  {
    schemaVersion: 'p4.integration-catalog.v1',
    id: 'm365-calendar-email',
    name: 'Takvim ve e-posta',
    category: 'CALENDAR_EMAIL',
    description: 'Microsoft 365 benzeri takvim/e-posta kapsamı; mesaj veya davet göndermez.',
    status: 'NOT_CONFIGURED',
    apiVerified: false,
    capabilities: ['READ', 'TEST', 'WRITE'],
    statusReason: 'Tenant, izin kapsamı ve sağlayıcı kontratı yapılandırılmadı.',
  },
  {
    schemaVersion: 'p4.integration-catalog.v1',
    id: 'identity-scim',
    name: 'SSO / SCIM yaşam döngüsü',
    category: 'SSO_SCIM',
    description: 'Kurumsal kimlik ve kullanıcı yaşam döngüsü için salt katalog kaydı.',
    status: 'NOT_CONFIGURED',
    apiVerified: false,
    capabilities: ['TEST', 'PROVISION'],
    statusReason: 'IdP metadata, SCIM base URL ve yetki kanıtı tanımlı değil.',
  },
  {
    schemaVersion: 'p4.integration-catalog.v1',
    id: 'portable-csv-api',
    name: 'CSV / açık API / webhook',
    category: 'CSV_API_WEBHOOK',
    description: 'Taşınabilirlik tabanı: alan eşleme ve dışa aktarım kontratı önizlemesi.',
    status: 'UNVERIFIED',
    apiVerified: false,
    capabilities: ['READ', 'TEST', 'WRITE'],
    statusReason: 'Şema fixture seviyesinde; gerçek import/export çağrısı bulunmuyor.',
  },
] as const;

export const SYNTHETIC_FIELD_MAPPINGS: readonly SyntheticFieldMapping[] = [
  {
    source: 'candidate.external_id',
    target: 'candidate.source_ref',
    classification: 'NON_PII',
    transferMode: 'PREVIEW_ONLY',
    enabled: false,
  },
  {
    source: 'candidate.email',
    target: 'candidate.contact.email',
    classification: 'PII',
    transferMode: 'PREVIEW_ONLY',
    enabled: false,
  },
  {
    source: 'interview.id',
    target: 'interview.external_ref',
    classification: 'NON_PII',
    transferMode: 'PREVIEW_ONLY',
    enabled: false,
  },
  {
    source: 'evidence.packet_digest',
    target: 'evidence.packet_digest',
    classification: 'EVIDENCE_METADATA',
    transferMode: 'PREVIEW_ONLY',
    enabled: false,
  },
] as const;
