/**
 * Browser-safe P4 integration-platform/v1 contract boundary.
 *
 * The embedded registry is the public, fully synthetic ATS fixture. Parsing is
 * deliberately fail-closed: untrusted input is inspected without invoking
 * accessors, copied into an owned graph, validated, adapted to camelCase and
 * deeply frozen before it can reach the product surface.
 */

export const INTEGRATION_PLATFORM_SOURCE_COMMIT =
  '584fb1a407c926189fd8db7ee8b2028d5672d55a' as const;
export const INTEGRATION_PLATFORM_SAMPLE_SHA256 =
  '71eface856d0b77c5d11130dae21032f3a44f5d71106751aad6c7b4060343d32' as const;

const DOMAINS = [
  'ATS',
  'HRIS',
  'CALENDAR_EMAIL',
  'SSO_SCIM',
  'PORTABILITY',
  'DISTRIBUTION',
] as const;
const OPERATIONS = [
  'pull_candidate_ref',
  'pull_interview_ref',
  'pull_role_ref',
  'push_evidence_ref',
  'pull_worker_ref',
  'push_hire_handoff_ref',
  'pull_availability_ref',
  'propose_interview_slot',
  'send_human_approved_invite',
  'send_human_approved_notification',
  'verify_sso_metadata',
  'provision_human_approved_user',
  'deprovision_human_approved_user',
  'import_csv_ref',
  'export_csv_ref',
  'open_api_read',
  'subscribe_signed_webhook',
  'export_tenant_archive',
  'request_tenant_erasure',
  'publish_human_approved_job_ref',
] as const;
const DATA_CLASSES = [
  'opaque_candidate_ref',
  'interview_ref',
  'role_ref',
  'evidence_packet_ref',
  'audit_link',
  'worker_ref',
  'availability_window',
  'identity_admin_ref',
  'dossier_metadata',
  'job_ref',
  'tenant_archive_ref',
] as const;
const VERIFICATION_STATUSES = ['UNVERIFIED', 'VERIFIED', 'BLOCKED', 'NOT_CONFIGURED'] as const;
const DIRECTIONS = ['PULL', 'PUSH', 'BIDIRECTIONAL'] as const;
const AUTH_MODELS = [
  'OAUTH2',
  'OIDC_SAML_METADATA',
  'SERVICE_ACCOUNT',
  'SIGNED_WEBHOOK',
  'NONE',
] as const;
const TRANSFER_PURPOSES = [
  'EVIDENCE_HANDOFF',
  'POST_HIRE_HANDOFF',
  'INTERVIEW_COORDINATION',
  'IDENTITY_ADMINISTRATION',
  'TENANT_PORTABILITY',
  'HUMAN_APPROVED_DISTRIBUTION',
] as const;
const DATA_OWNERS = ['ATS_PLATFORM', 'SOURCE_SYSTEM', 'SHARED_DOCUMENTED'] as const;
const CURSOR_MODELS = ['NONE', 'OPAQUE_CURSOR'] as const;
const DELIVERIES = ['AT_LEAST_ONCE', 'REQUEST_RESPONSE'] as const;

export type IntegrationDomainV1 = (typeof DOMAINS)[number];
export type IntegrationOperationV1 = (typeof OPERATIONS)[number];
export type IntegrationDataClassV1 = (typeof DATA_CLASSES)[number];
export type IntegrationVerificationStatusV1 = (typeof VERIFICATION_STATUSES)[number];
export type IntegrationDirectionV1 = (typeof DIRECTIONS)[number];
export type IntegrationAuthModelV1 = (typeof AUTH_MODELS)[number];
export type IntegrationTransferPurposeV1 = (typeof TRANSFER_PURPOSES)[number];
export type IntegrationDataOwnerV1 = (typeof DATA_OWNERS)[number];
export type IntegrationCursorModelV1 = (typeof CURSOR_MODELS)[number];
export type IntegrationDeliveryV1 = (typeof DELIVERIES)[number];

export interface IntegrationMutationPolicyV1 {
  readonly humanApprovalRequired: true;
  readonly idempotencyRequired: true;
  readonly decisionImpact: 'NONE';
  readonly destructiveOperations: 'DISALLOWED';
  readonly batchApproval: 'DISALLOWED';
}

export interface IntegrationTransferPolicyV1 {
  readonly purpose: IntegrationTransferPurposeV1;
  readonly piiMode: 'OPAQUE_REF_ONLY';
  readonly dsarOwner: IntegrationDataOwnerV1;
  readonly retentionOwner: IntegrationDataOwnerV1;
}

export interface IntegrationReliabilityV1 {
  readonly cursorModel: IntegrationCursorModelV1;
  readonly delivery: IntegrationDeliveryV1;
  readonly tenantScopedIdempotency: true;
  readonly webhookSignatureRequired: boolean;
  readonly replayWindowSeconds: number;
}

export interface IntegrationConnectorV1 {
  readonly connectorId: string;
  readonly domain: IntegrationDomainV1;
  readonly providerRef: string;
  readonly criticalPath: boolean;
  readonly direction: IntegrationDirectionV1;
  readonly operations: readonly IntegrationOperationV1[];
  readonly authModel: IntegrationAuthModelV1;
  readonly dataClasses: readonly IntegrationDataClassV1[];
  readonly verificationStatus: IntegrationVerificationStatusV1;
  readonly apiVerified: false;
  readonly mutationPolicy: IntegrationMutationPolicyV1;
  readonly transferPolicy: IntegrationTransferPolicyV1;
  readonly reliability: IntegrationReliabilityV1;
}

export interface IntegrationSyntheticEnvelopeV1 {
  readonly schemaVersion: 'integration-envelope/v1';
  readonly synthetic: true;
  readonly eventId: string;
  readonly tenantRef: string;
  readonly connectorId: string;
  readonly operation: IntegrationOperationV1;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly payloadDigest: string;
  readonly occurredAt: string;
  readonly dataClasses: readonly IntegrationDataClassV1[];
  readonly cursorRef?: string;
  readonly humanApprovalRef?: string;
}

export interface IntegrationPlatformRegistryV1 {
  readonly schemaVersion: 'integration-platform/v1';
  readonly activationGate: 'PRE_G0_CONTRACT_ONLY';
  readonly connectors: readonly IntegrationConnectorV1[];
  readonly syntheticEnvelopes: readonly IntegrationSyntheticEnvelopeV1[];
}

export type IntegrationPlatformParseResult =
  | { readonly ok: true; readonly value: IntegrationPlatformRegistryV1 }
  | { readonly ok: false; readonly errors: readonly string[] };

/** Exact public ATS fixture at INTEGRATION_PLATFORM_SOURCE_COMMIT. */
export const INTEGRATION_PLATFORM_PUBLIC_REGISTRY = deepFreeze({
  schema_version: 'integration-platform/v1',
  activation_gate: 'PRE_G0_CONTRACT_ONLY',
  connectors: [
    {
      connector_id: 'generic-ats-v1',
      domain: 'ATS',
      provider_ref: 'generic-ats',
      critical_path: true,
      direction: 'BIDIRECTIONAL',
      operations: [
        'pull_candidate_ref',
        'pull_interview_ref',
        'pull_role_ref',
        'push_evidence_ref',
      ],
      auth_model: 'OAUTH2',
      data_classes: [
        'opaque_candidate_ref',
        'interview_ref',
        'role_ref',
        'evidence_packet_ref',
        'audit_link',
      ],
      verification_status: 'UNVERIFIED',
      api_verified: false,
      mutation_policy: {
        human_approval_required: true,
        idempotency_required: true,
        decision_impact: 'NONE',
        destructive_operations: 'DISALLOWED',
        batch_approval: 'DISALLOWED',
      },
      transfer_policy: {
        purpose: 'EVIDENCE_HANDOFF',
        pii_mode: 'OPAQUE_REF_ONLY',
        dsar_owner: 'SHARED_DOCUMENTED',
        retention_owner: 'SHARED_DOCUMENTED',
      },
      reliability: {
        cursor_model: 'OPAQUE_CURSOR',
        delivery: 'AT_LEAST_ONCE',
        tenant_scoped_idempotency: true,
        webhook_signature_required: false,
        replay_window_seconds: 0,
      },
    },
    {
      connector_id: 'generic-hris-v1',
      domain: 'HRIS',
      provider_ref: 'generic-hris',
      critical_path: true,
      direction: 'BIDIRECTIONAL',
      operations: ['pull_role_ref', 'pull_worker_ref', 'push_hire_handoff_ref'],
      auth_model: 'OAUTH2',
      data_classes: ['role_ref', 'worker_ref', 'dossier_metadata'],
      verification_status: 'BLOCKED',
      api_verified: false,
      mutation_policy: {
        human_approval_required: true,
        idempotency_required: true,
        decision_impact: 'NONE',
        destructive_operations: 'DISALLOWED',
        batch_approval: 'DISALLOWED',
      },
      transfer_policy: {
        purpose: 'POST_HIRE_HANDOFF',
        pii_mode: 'OPAQUE_REF_ONLY',
        dsar_owner: 'SHARED_DOCUMENTED',
        retention_owner: 'SOURCE_SYSTEM',
      },
      reliability: {
        cursor_model: 'OPAQUE_CURSOR',
        delivery: 'AT_LEAST_ONCE',
        tenant_scoped_idempotency: true,
        webhook_signature_required: false,
        replay_window_seconds: 0,
      },
    },
    {
      connector_id: 'm365-calendar-email-v1',
      domain: 'CALENDAR_EMAIL',
      provider_ref: 'microsoft365-calendar-email',
      critical_path: true,
      direction: 'BIDIRECTIONAL',
      operations: [
        'pull_availability_ref',
        'propose_interview_slot',
        'send_human_approved_invite',
        'send_human_approved_notification',
      ],
      auth_model: 'OAUTH2',
      data_classes: ['interview_ref', 'availability_window'],
      verification_status: 'NOT_CONFIGURED',
      api_verified: false,
      mutation_policy: {
        human_approval_required: true,
        idempotency_required: true,
        decision_impact: 'NONE',
        destructive_operations: 'DISALLOWED',
        batch_approval: 'DISALLOWED',
      },
      transfer_policy: {
        purpose: 'INTERVIEW_COORDINATION',
        pii_mode: 'OPAQUE_REF_ONLY',
        dsar_owner: 'SHARED_DOCUMENTED',
        retention_owner: 'ATS_PLATFORM',
      },
      reliability: {
        cursor_model: 'OPAQUE_CURSOR',
        delivery: 'AT_LEAST_ONCE',
        tenant_scoped_idempotency: true,
        webhook_signature_required: false,
        replay_window_seconds: 0,
      },
    },
    {
      connector_id: 'generic-scim-v1',
      domain: 'SSO_SCIM',
      provider_ref: 'generic-scim',
      critical_path: true,
      direction: 'BIDIRECTIONAL',
      operations: [
        'verify_sso_metadata',
        'provision_human_approved_user',
        'deprovision_human_approved_user',
      ],
      auth_model: 'OIDC_SAML_METADATA',
      data_classes: ['identity_admin_ref'],
      verification_status: 'NOT_CONFIGURED',
      api_verified: false,
      mutation_policy: {
        human_approval_required: true,
        idempotency_required: true,
        decision_impact: 'NONE',
        destructive_operations: 'DISALLOWED',
        batch_approval: 'DISALLOWED',
      },
      transfer_policy: {
        purpose: 'IDENTITY_ADMINISTRATION',
        pii_mode: 'OPAQUE_REF_ONLY',
        dsar_owner: 'SOURCE_SYSTEM',
        retention_owner: 'SOURCE_SYSTEM',
      },
      reliability: {
        cursor_model: 'OPAQUE_CURSOR',
        delivery: 'AT_LEAST_ONCE',
        tenant_scoped_idempotency: true,
        webhook_signature_required: false,
        replay_window_seconds: 0,
      },
    },
    {
      connector_id: 'open-portability-v1',
      domain: 'PORTABILITY',
      provider_ref: 'open-portability',
      critical_path: true,
      direction: 'BIDIRECTIONAL',
      operations: [
        'import_csv_ref',
        'export_csv_ref',
        'open_api_read',
        'subscribe_signed_webhook',
        'export_tenant_archive',
        'request_tenant_erasure',
      ],
      auth_model: 'SIGNED_WEBHOOK',
      data_classes: [
        'opaque_candidate_ref',
        'interview_ref',
        'role_ref',
        'evidence_packet_ref',
        'audit_link',
        'tenant_archive_ref',
      ],
      verification_status: 'UNVERIFIED',
      api_verified: false,
      mutation_policy: {
        human_approval_required: true,
        idempotency_required: true,
        decision_impact: 'NONE',
        destructive_operations: 'DISALLOWED',
        batch_approval: 'DISALLOWED',
      },
      transfer_policy: {
        purpose: 'TENANT_PORTABILITY',
        pii_mode: 'OPAQUE_REF_ONLY',
        dsar_owner: 'ATS_PLATFORM',
        retention_owner: 'ATS_PLATFORM',
      },
      reliability: {
        cursor_model: 'OPAQUE_CURSOR',
        delivery: 'AT_LEAST_ONCE',
        tenant_scoped_idempotency: true,
        webhook_signature_required: true,
        replay_window_seconds: 300,
      },
    },
    {
      connector_id: 'kariyer-net-optional-v1',
      domain: 'DISTRIBUTION',
      provider_ref: 'kariyer-net-optional',
      critical_path: false,
      direction: 'PUSH',
      operations: ['publish_human_approved_job_ref'],
      auth_model: 'NONE',
      data_classes: ['job_ref'],
      verification_status: 'NOT_CONFIGURED',
      api_verified: false,
      mutation_policy: {
        human_approval_required: true,
        idempotency_required: true,
        decision_impact: 'NONE',
        destructive_operations: 'DISALLOWED',
        batch_approval: 'DISALLOWED',
      },
      transfer_policy: {
        purpose: 'HUMAN_APPROVED_DISTRIBUTION',
        pii_mode: 'OPAQUE_REF_ONLY',
        dsar_owner: 'SOURCE_SYSTEM',
        retention_owner: 'SOURCE_SYSTEM',
      },
      reliability: {
        cursor_model: 'NONE',
        delivery: 'REQUEST_RESPONSE',
        tenant_scoped_idempotency: true,
        webhook_signature_required: false,
        replay_window_seconds: 0,
      },
    },
  ],
  synthetic_envelopes: [
    {
      schema_version: 'integration-envelope/v1',
      synthetic: true,
      event_id: 'evt.synthetic.ats.001',
      tenant_ref: 'tenant.synthetic',
      connector_id: 'generic-ats-v1',
      operation: 'push_evidence_ref',
      correlation_id: 'corr.synthetic.ats.001',
      idempotency_key: 'tenant.synthetic:push-evidence:001',
      payload_digest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      occurred_at: '1970-01-01T00:00:00Z',
      data_classes: ['evidence_packet_ref', 'audit_link'],
      cursor_ref: 'cursor.synthetic.ats.001',
      human_approval_ref: 'approval.synthetic.ats.001',
    },
    {
      schema_version: 'integration-envelope/v1',
      synthetic: true,
      event_id: 'evt.synthetic.webhook.001',
      tenant_ref: 'tenant.synthetic',
      connector_id: 'open-portability-v1',
      operation: 'subscribe_signed_webhook',
      correlation_id: 'corr.synthetic.webhook.001',
      idempotency_key: 'tenant.synthetic:webhook-subscription:001',
      payload_digest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      occurred_at: '1970-01-01T00:00:00Z',
      data_classes: ['audit_link'],
      human_approval_ref: 'approval.synthetic.webhook.001',
    },
    {
      schema_version: 'integration-envelope/v1',
      synthetic: true,
      event_id: 'evt.synthetic.scim.001',
      tenant_ref: 'tenant.synthetic',
      connector_id: 'generic-scim-v1',
      operation: 'provision_human_approved_user',
      correlation_id: 'corr.synthetic.scim.001',
      idempotency_key: 'tenant.synthetic:scim-provision:001',
      payload_digest: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      occurred_at: '1970-01-01T00:00:00Z',
      data_classes: ['identity_admin_ref'],
      human_approval_ref: 'approval.synthetic.scim.001',
    },
  ],
} as const);

const REF_PATTERN = /^[A-Za-z][A-Za-z0-9._:/-]*$/;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const UTC_TIMESTAMP_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*Z$/;
const MAX_DEPTH = 16;
const MAX_NODES = 2_048;
const MAX_ARRAY_ITEMS = 128;
const MAX_STRING_LENGTH = 2_048;
const MAX_ERRORS = 128;

const FORBIDDEN_KEY_PATTERNS = [
  /candidate_?(email|phone|name)/i,
  /(^|_)(access_?token|refresh_?token|client_?secret|password|cookie|bearer)($|_)/i,
  /(^|_)(ranking_?score|candidate_?rank|auto_?reject|auto_?hire)($|_)/i,
  /^(raw_)?payload$/i,
] as const;
const FORBIDDEN_VALUE_PATTERNS = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\+\d[\d ()-]{7,}\d/,
  /\b\d{3}[-. ]\d{3}[-. ]\d{4}\b/,
  /\bBearer\s+[A-Za-z0-9._~+-]+=*\b/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:access_?token|refresh_?token|client_?secret|password|cookie)\s*[:=]/i,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
  /\b(?:ranking_?score|candidate_?rank|auto[-_ ]?(?:reject|hire))\b/i,
] as const;
const PROTOTYPE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const READ_ONLY_OPERATIONS = new Set<IntegrationOperationV1>([
  'pull_candidate_ref',
  'pull_interview_ref',
  'pull_role_ref',
  'pull_worker_ref',
  'pull_availability_ref',
  'open_api_read',
]);

interface DomainProfile {
  readonly connectorId: string;
  readonly providerRef: string;
  readonly criticalPath: boolean;
  readonly direction: IntegrationDirectionV1;
  readonly operations: readonly IntegrationOperationV1[];
  readonly authModel: IntegrationAuthModelV1;
  readonly dataClasses: readonly IntegrationDataClassV1[];
  readonly verificationStatus: Exclude<IntegrationVerificationStatusV1, 'VERIFIED'>;
  readonly purpose: IntegrationTransferPurposeV1;
  readonly dsarOwner: IntegrationDataOwnerV1;
  readonly retentionOwner: IntegrationDataOwnerV1;
  readonly cursorModel: IntegrationCursorModelV1;
  readonly delivery: IntegrationDeliveryV1;
  readonly webhookSignatureRequired: boolean;
  readonly replayWindowSeconds: number;
}

const DOMAIN_PROFILES: Readonly<Record<IntegrationDomainV1, DomainProfile>> = {
  ATS: {
    connectorId: 'generic-ats-v1',
    providerRef: 'generic-ats',
    criticalPath: true,
    direction: 'BIDIRECTIONAL',
    operations: ['pull_candidate_ref', 'pull_interview_ref', 'pull_role_ref', 'push_evidence_ref'],
    authModel: 'OAUTH2',
    dataClasses: [
      'opaque_candidate_ref',
      'interview_ref',
      'role_ref',
      'evidence_packet_ref',
      'audit_link',
    ],
    verificationStatus: 'UNVERIFIED',
    purpose: 'EVIDENCE_HANDOFF',
    dsarOwner: 'SHARED_DOCUMENTED',
    retentionOwner: 'SHARED_DOCUMENTED',
    cursorModel: 'OPAQUE_CURSOR',
    delivery: 'AT_LEAST_ONCE',
    webhookSignatureRequired: false,
    replayWindowSeconds: 0,
  },
  HRIS: {
    connectorId: 'generic-hris-v1',
    providerRef: 'generic-hris',
    criticalPath: true,
    direction: 'BIDIRECTIONAL',
    operations: ['pull_role_ref', 'pull_worker_ref', 'push_hire_handoff_ref'],
    authModel: 'OAUTH2',
    dataClasses: ['role_ref', 'worker_ref', 'dossier_metadata'],
    verificationStatus: 'BLOCKED',
    purpose: 'POST_HIRE_HANDOFF',
    dsarOwner: 'SHARED_DOCUMENTED',
    retentionOwner: 'SOURCE_SYSTEM',
    cursorModel: 'OPAQUE_CURSOR',
    delivery: 'AT_LEAST_ONCE',
    webhookSignatureRequired: false,
    replayWindowSeconds: 0,
  },
  CALENDAR_EMAIL: {
    connectorId: 'm365-calendar-email-v1',
    providerRef: 'microsoft365-calendar-email',
    criticalPath: true,
    direction: 'BIDIRECTIONAL',
    operations: [
      'pull_availability_ref',
      'propose_interview_slot',
      'send_human_approved_invite',
      'send_human_approved_notification',
    ],
    authModel: 'OAUTH2',
    dataClasses: ['interview_ref', 'availability_window'],
    verificationStatus: 'NOT_CONFIGURED',
    purpose: 'INTERVIEW_COORDINATION',
    dsarOwner: 'SHARED_DOCUMENTED',
    retentionOwner: 'ATS_PLATFORM',
    cursorModel: 'OPAQUE_CURSOR',
    delivery: 'AT_LEAST_ONCE',
    webhookSignatureRequired: false,
    replayWindowSeconds: 0,
  },
  SSO_SCIM: {
    connectorId: 'generic-scim-v1',
    providerRef: 'generic-scim',
    criticalPath: true,
    direction: 'BIDIRECTIONAL',
    operations: [
      'verify_sso_metadata',
      'provision_human_approved_user',
      'deprovision_human_approved_user',
    ],
    authModel: 'OIDC_SAML_METADATA',
    dataClasses: ['identity_admin_ref'],
    verificationStatus: 'NOT_CONFIGURED',
    purpose: 'IDENTITY_ADMINISTRATION',
    dsarOwner: 'SOURCE_SYSTEM',
    retentionOwner: 'SOURCE_SYSTEM',
    cursorModel: 'OPAQUE_CURSOR',
    delivery: 'AT_LEAST_ONCE',
    webhookSignatureRequired: false,
    replayWindowSeconds: 0,
  },
  PORTABILITY: {
    connectorId: 'open-portability-v1',
    providerRef: 'open-portability',
    criticalPath: true,
    direction: 'BIDIRECTIONAL',
    operations: [
      'import_csv_ref',
      'export_csv_ref',
      'open_api_read',
      'subscribe_signed_webhook',
      'export_tenant_archive',
      'request_tenant_erasure',
    ],
    authModel: 'SIGNED_WEBHOOK',
    dataClasses: [
      'opaque_candidate_ref',
      'interview_ref',
      'role_ref',
      'evidence_packet_ref',
      'audit_link',
      'tenant_archive_ref',
    ],
    verificationStatus: 'UNVERIFIED',
    purpose: 'TENANT_PORTABILITY',
    dsarOwner: 'ATS_PLATFORM',
    retentionOwner: 'ATS_PLATFORM',
    cursorModel: 'OPAQUE_CURSOR',
    delivery: 'AT_LEAST_ONCE',
    webhookSignatureRequired: true,
    replayWindowSeconds: 300,
  },
  DISTRIBUTION: {
    connectorId: 'kariyer-net-optional-v1',
    providerRef: 'kariyer-net-optional',
    criticalPath: false,
    direction: 'PUSH',
    operations: ['publish_human_approved_job_ref'],
    authModel: 'NONE',
    dataClasses: ['job_ref'],
    verificationStatus: 'NOT_CONFIGURED',
    purpose: 'HUMAN_APPROVED_DISTRIBUTION',
    dsarOwner: 'SOURCE_SYSTEM',
    retentionOwner: 'SOURCE_SYSTEM',
    cursorModel: 'NONE',
    delivery: 'REQUEST_RESPONSE',
    webhookSignatureRequired: false,
    replayWindowSeconds: 0,
  },
};

const ENVELOPE_PROFILES = [
  {
    schemaVersion: 'integration-envelope/v1',
    synthetic: true,
    eventId: 'evt.synthetic.ats.001',
    tenantRef: 'tenant.synthetic',
    connectorId: 'generic-ats-v1',
    operation: 'push_evidence_ref',
    correlationId: 'corr.synthetic.ats.001',
    idempotencyKey: 'tenant.synthetic:push-evidence:001',
    payloadDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    occurredAt: '1970-01-01T00:00:00Z',
    dataClasses: ['evidence_packet_ref', 'audit_link'],
    cursorRef: 'cursor.synthetic.ats.001',
    humanApprovalRef: 'approval.synthetic.ats.001',
  },
  {
    schemaVersion: 'integration-envelope/v1',
    synthetic: true,
    eventId: 'evt.synthetic.webhook.001',
    tenantRef: 'tenant.synthetic',
    connectorId: 'open-portability-v1',
    operation: 'subscribe_signed_webhook',
    correlationId: 'corr.synthetic.webhook.001',
    idempotencyKey: 'tenant.synthetic:webhook-subscription:001',
    payloadDigest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    occurredAt: '1970-01-01T00:00:00Z',
    dataClasses: ['audit_link'],
    humanApprovalRef: 'approval.synthetic.webhook.001',
  },
  {
    schemaVersion: 'integration-envelope/v1',
    synthetic: true,
    eventId: 'evt.synthetic.scim.001',
    tenantRef: 'tenant.synthetic',
    connectorId: 'generic-scim-v1',
    operation: 'provision_human_approved_user',
    correlationId: 'corr.synthetic.scim.001',
    idempotencyKey: 'tenant.synthetic:scim-provision:001',
    payloadDigest: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    occurredAt: '1970-01-01T00:00:00Z',
    dataClasses: ['identity_admin_ref'],
    humanApprovalRef: 'approval.synthetic.scim.001',
  },
] as const satisfies readonly IntegrationSyntheticEnvelopeV1[];

const ROOT_KEYS = [
  'schema_version',
  'activation_gate',
  'connectors',
  'synthetic_envelopes',
] as const;
const CONNECTOR_KEYS = [
  'connector_id',
  'domain',
  'provider_ref',
  'critical_path',
  'direction',
  'operations',
  'auth_model',
  'data_classes',
  'verification_status',
  'api_verified',
  'mutation_policy',
  'transfer_policy',
  'reliability',
] as const;
const MUTATION_KEYS = [
  'human_approval_required',
  'idempotency_required',
  'decision_impact',
  'destructive_operations',
  'batch_approval',
] as const;
const TRANSFER_KEYS = ['purpose', 'pii_mode', 'dsar_owner', 'retention_owner'] as const;
const RELIABILITY_KEYS = [
  'cursor_model',
  'delivery',
  'tenant_scoped_idempotency',
  'webhook_signature_required',
  'replay_window_seconds',
] as const;
const ENVELOPE_REQUIRED_KEYS = [
  'schema_version',
  'synthetic',
  'event_id',
  'tenant_ref',
  'connector_id',
  'operation',
  'correlation_id',
  'idempotency_key',
  'payload_digest',
  'occurred_at',
  'data_classes',
] as const;
const ENVELOPE_OPTIONAL_KEYS = ['cursor_ref', 'human_approval_ref'] as const;

type PlainRecord = Record<string, unknown>;
const INVALID = Symbol('invalid-contract-node');
type Invalid = typeof INVALID;
interface CloneState {
  readonly seen: WeakSet<object>;
  readonly errors: string[];
  nodes: number;
}

function addError(errors: string[], message: string): void {
  if (errors.length < MAX_ERRORS) errors.push(message);
}

function scanForbiddenString(value: string, path: string, errors: string[]): void {
  if (value.length > MAX_STRING_LENGTH) {
    addError(errors, `${path}: string budget exceeded`);
  } else if (FORBIDDEN_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
    addError(errors, `${path}: forbidden raw PII, credential or decision value`);
  }
}

/** Copy JSON-like input without calling getters; reject cycles and aliases. */
function cloneUntrusted(
  value: unknown,
  path: string,
  depth: number,
  state: CloneState,
): unknown | Invalid {
  state.nodes += 1;
  if (state.nodes > MAX_NODES) {
    addError(state.errors, `${path}: node budget exceeded`);
    return INVALID;
  }
  if (depth > MAX_DEPTH) {
    addError(state.errors, `${path}: depth budget exceeded`);
    return INVALID;
  }
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    scanForbiddenString(value, path, state.errors);
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      addError(state.errors, `${path}: non-finite number is forbidden`);
      return INVALID;
    }
    return value;
  }
  if (typeof value !== 'object') {
    addError(state.errors, `${path}: non-JSON value is forbidden`);
    return INVALID;
  }
  if (state.seen.has(value)) {
    addError(state.errors, `${path}: repeated or cyclic object reference`);
    return INVALID;
  }
  state.seen.add(value);

  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        addError(state.errors, `${path}: non-plain array prototype`);
        return INVALID;
      }
      if (value.length > MAX_ARRAY_ITEMS) {
        addError(state.errors, `${path}: array budget exceeded`);
        return INVALID;
      }
      const ownKeys = Reflect.ownKeys(value);
      if (
        ownKeys.some(
          (key) => typeof key !== 'string' || (key !== 'length' && !/^(0|[1-9][0-9]*)$/.test(key)),
        )
      ) {
        addError(state.errors, `${path}: array has non-index properties`);
        return INVALID;
      }
      const output: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor) {
          addError(state.errors, `${path}[${index}]: sparse arrays are forbidden`);
          output.push(null);
          continue;
        }
        if (!('value' in descriptor) || !descriptor.enumerable) {
          addError(state.errors, `${path}[${index}]: accessor or hidden value is forbidden`);
          output.push(null);
          continue;
        }
        const child = cloneUntrusted(descriptor.value, `${path}[${index}]`, depth + 1, state);
        output.push(child === INVALID ? null : child);
      }
      return output;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      addError(state.errors, `${path}: non-plain object prototype`);
      return INVALID;
    }
    const output: PlainRecord = {};
    const ownKeys = Reflect.ownKeys(value).sort((left, right) =>
      String(left).localeCompare(String(right)),
    );
    for (const key of ownKeys) {
      if (typeof key !== 'string') {
        addError(state.errors, `${path}: symbol properties are forbidden`);
        continue;
      }
      if (PROTOTYPE_KEYS.has(key)) {
        addError(state.errors, `${path}.${key}: prototype pollution key is forbidden`);
        continue;
      }
      if (FORBIDDEN_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
        addError(state.errors, `${path}.${key}: forbidden raw PII, credential or decision field`);
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
        addError(state.errors, `${path}.${key}: accessor or hidden value is forbidden`);
        continue;
      }
      const child = cloneUntrusted(descriptor.value, `${path}.${key}`, depth + 1, state);
      if (child !== INVALID) output[key] = child;
    }
    return output;
  } catch {
    addError(state.errors, `${path}: object inspection failed closed`);
    return INVALID;
  }
}

function isPlainRecord(value: unknown): value is PlainRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function validateKeys(
  record: PlainRecord,
  required: readonly string[],
  optional: readonly string[],
  path: string,
  errors: string[],
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of required)
    if (!Object.prototype.hasOwnProperty.call(record, key))
      addError(errors, `${path}.${key}: required field missing`);
  for (const key of Object.keys(record))
    if (!allowed.has(key)) addError(errors, `${path}.${key}: unknown field`);
}
function parseRecord(value: unknown, path: string, errors: string[]): PlainRecord | undefined {
  if (!isPlainRecord(value)) {
    addError(errors, `${path}: object required`);
    return undefined;
  }
  return value;
}
function parseLiteral<T extends string | boolean>(
  value: unknown,
  expected: T,
  path: string,
  errors: string[],
): T | undefined {
  if (value !== expected) {
    addError(errors, `${path}: exact literal required`);
    return undefined;
  }
  return expected;
}
function parseEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  path: string,
  errors: string[],
): T[number] | undefined {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    addError(errors, `${path}: enum value required`);
    return undefined;
  }
  return value as T[number];
}
function parseBoolean(value: unknown, path: string, errors: string[]): boolean | undefined {
  if (typeof value !== 'boolean') {
    addError(errors, `${path}: boolean required`);
    return undefined;
  }
  return value;
}
function parseInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  path: string,
  errors: string[],
): number | undefined {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    addError(errors, `${path}: integer in range ${minimum}..${maximum} required`);
    return undefined;
  }
  return value as number;
}
function parseRef(value: unknown, path: string, errors: string[]): string | undefined {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 160 ||
    !REF_PATTERN.test(value)
  ) {
    addError(errors, `${path}: opaque ref required`);
    return undefined;
  }
  return value;
}
function parsePatternString(
  value: unknown,
  pattern: RegExp,
  message: string,
  path: string,
  errors: string[],
): string | undefined {
  if (typeof value !== 'string' || !pattern.test(value)) {
    addError(errors, `${path}: ${message}`);
    return undefined;
  }
  return value;
}
function parseUniqueEnumArray<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  path: string,
  errors: string[],
): readonly T[number][] | undefined {
  if (!Array.isArray(value) || value.length < 1) {
    addError(errors, `${path}: non-empty array required`);
    return undefined;
  }
  const parsed: T[number][] = [];
  value.forEach((item, index) => {
    const parsedItem = parseEnum(item, allowed, `${path}[${index}]`, errors);
    if (parsedItem !== undefined) parsed.push(parsedItem);
  });
  if (new Set(parsed).size !== parsed.length)
    addError(errors, `${path}: duplicate items are forbidden`);
  return parsed.length === value.length ? parsed : undefined;
}

function parseMutationPolicy(
  value: unknown,
  path: string,
  errors: string[],
): IntegrationMutationPolicyV1 | undefined {
  const start = errors.length;
  const record = parseRecord(value, path, errors);
  if (!record) return undefined;
  validateKeys(record, MUTATION_KEYS, [], path, errors);
  parseLiteral(record.human_approval_required, true, `${path}.human_approval_required`, errors);
  parseLiteral(record.idempotency_required, true, `${path}.idempotency_required`, errors);
  parseLiteral(record.decision_impact, 'NONE', `${path}.decision_impact`, errors);
  parseLiteral(
    record.destructive_operations,
    'DISALLOWED',
    `${path}.destructive_operations`,
    errors,
  );
  parseLiteral(record.batch_approval, 'DISALLOWED', `${path}.batch_approval`, errors);
  return errors.length === start
    ? {
        humanApprovalRequired: true,
        idempotencyRequired: true,
        decisionImpact: 'NONE',
        destructiveOperations: 'DISALLOWED',
        batchApproval: 'DISALLOWED',
      }
    : undefined;
}
function parseTransferPolicy(
  value: unknown,
  path: string,
  errors: string[],
): IntegrationTransferPolicyV1 | undefined {
  const start = errors.length;
  const record = parseRecord(value, path, errors);
  if (!record) return undefined;
  validateKeys(record, TRANSFER_KEYS, [], path, errors);
  const purpose = parseEnum(record.purpose, TRANSFER_PURPOSES, `${path}.purpose`, errors);
  parseLiteral(record.pii_mode, 'OPAQUE_REF_ONLY', `${path}.pii_mode`, errors);
  const dsarOwner = parseEnum(record.dsar_owner, DATA_OWNERS, `${path}.dsar_owner`, errors);
  const retentionOwner = parseEnum(
    record.retention_owner,
    DATA_OWNERS,
    `${path}.retention_owner`,
    errors,
  );
  return errors.length === start && purpose && dsarOwner && retentionOwner
    ? { purpose, piiMode: 'OPAQUE_REF_ONLY', dsarOwner, retentionOwner }
    : undefined;
}
function parseReliability(
  value: unknown,
  path: string,
  errors: string[],
): IntegrationReliabilityV1 | undefined {
  const start = errors.length;
  const record = parseRecord(value, path, errors);
  if (!record) return undefined;
  validateKeys(record, RELIABILITY_KEYS, [], path, errors);
  const cursorModel = parseEnum(record.cursor_model, CURSOR_MODELS, `${path}.cursor_model`, errors);
  const delivery = parseEnum(record.delivery, DELIVERIES, `${path}.delivery`, errors);
  parseLiteral(record.tenant_scoped_idempotency, true, `${path}.tenant_scoped_idempotency`, errors);
  const webhookSignatureRequired = parseBoolean(
    record.webhook_signature_required,
    `${path}.webhook_signature_required`,
    errors,
  );
  const replayWindowSeconds = parseInteger(
    record.replay_window_seconds,
    0,
    86_400,
    `${path}.replay_window_seconds`,
    errors,
  );
  if (
    webhookSignatureRequired === false &&
    replayWindowSeconds !== undefined &&
    replayWindowSeconds !== 0
  )
    addError(errors, `${path}: unsigned connector must have zero replay window`);
  if (webhookSignatureRequired === true && replayWindowSeconds === 0)
    addError(errors, `${path}: signed webhook requires a positive replay window`);
  return errors.length === start &&
    cursorModel &&
    delivery &&
    webhookSignatureRequired !== undefined &&
    replayWindowSeconds !== undefined
    ? {
        cursorModel,
        delivery,
        tenantScopedIdempotency: true,
        webhookSignatureRequired,
        replayWindowSeconds,
      }
    : undefined;
}

function parseConnector(
  value: unknown,
  index: number,
  errors: string[],
): IntegrationConnectorV1 | undefined {
  const path = `$.connectors[${index}]`;
  const start = errors.length;
  const record = parseRecord(value, path, errors);
  if (!record) return undefined;
  validateKeys(record, CONNECTOR_KEYS, ['activation_evidence'], path, errors);
  if (Object.prototype.hasOwnProperty.call(record, 'activation_evidence'))
    addError(errors, `${path}.activation_evidence: forbidden before G0`);
  const connectorId = parseRef(record.connector_id, `${path}.connector_id`, errors);
  const domain = parseEnum(record.domain, DOMAINS, `${path}.domain`, errors);
  const providerRef = parseRef(record.provider_ref, `${path}.provider_ref`, errors);
  const criticalPath = parseBoolean(record.critical_path, `${path}.critical_path`, errors);
  const direction = parseEnum(record.direction, DIRECTIONS, `${path}.direction`, errors);
  const operations = parseUniqueEnumArray(
    record.operations,
    OPERATIONS,
    `${path}.operations`,
    errors,
  );
  const authModel = parseEnum(record.auth_model, AUTH_MODELS, `${path}.auth_model`, errors);
  const dataClasses = parseUniqueEnumArray(
    record.data_classes,
    DATA_CLASSES,
    `${path}.data_classes`,
    errors,
  );
  const verificationStatus = parseEnum(
    record.verification_status,
    VERIFICATION_STATUSES,
    `${path}.verification_status`,
    errors,
  );
  parseLiteral(record.api_verified, false, `${path}.api_verified`, errors);
  const mutationPolicy = parseMutationPolicy(
    record.mutation_policy,
    `${path}.mutation_policy`,
    errors,
  );
  const transferPolicy = parseTransferPolicy(
    record.transfer_policy,
    `${path}.transfer_policy`,
    errors,
  );
  const reliability = parseReliability(record.reliability, `${path}.reliability`, errors);
  if (verificationStatus === 'VERIFIED')
    addError(errors, `${path}.verification_status: VERIFIED forbidden before G0`);

  if (
    domain &&
    connectorId &&
    providerRef &&
    criticalPath !== undefined &&
    direction &&
    operations &&
    authModel &&
    dataClasses &&
    verificationStatus &&
    transferPolicy &&
    reliability
  ) {
    const profile = DOMAIN_PROFILES[domain];
    const exactChecks: readonly [unknown, unknown, string][] = [
      [connectorId, profile.connectorId, 'connector_id'],
      [providerRef, profile.providerRef, 'provider_ref'],
      [criticalPath, profile.criticalPath, 'critical_path'],
      [direction, profile.direction, 'direction'],
      [authModel, profile.authModel, 'auth_model'],
      [verificationStatus, profile.verificationStatus, 'verification_status'],
      [transferPolicy.purpose, profile.purpose, 'transfer_policy.purpose'],
      [transferPolicy.dsarOwner, profile.dsarOwner, 'transfer_policy.dsar_owner'],
      [transferPolicy.retentionOwner, profile.retentionOwner, 'transfer_policy.retention_owner'],
      [reliability.cursorModel, profile.cursorModel, 'reliability.cursor_model'],
      [reliability.delivery, profile.delivery, 'reliability.delivery'],
      [
        reliability.webhookSignatureRequired,
        profile.webhookSignatureRequired,
        'reliability.webhook_signature_required',
      ],
      [
        reliability.replayWindowSeconds,
        profile.replayWindowSeconds,
        'reliability.replay_window_seconds',
      ],
    ];
    for (const [actual, expected, field] of exactChecks)
      if (actual !== expected)
        addError(errors, `${path}.${field}: canonical domain profile mismatch`);
    if (!sameStringArray(operations, profile.operations))
      addError(errors, `${path}.operations: canonical order or domain authority mismatch`);
    if (!sameStringArray(dataClasses, profile.dataClasses))
      addError(errors, `${path}.data_classes: canonical order or domain authority mismatch`);
    const signedWebhook = operations.includes('subscribe_signed_webhook');
    if (signedWebhook && !reliability.webhookSignatureRequired)
      addError(errors, `${path}.reliability: signed webhook signature required`);
    if (signedWebhook && reliability.replayWindowSeconds <= 0)
      addError(errors, `${path}.reliability: signed webhook replay window required`);
  }
  if (
    errors.length !== start ||
    !connectorId ||
    !domain ||
    !providerRef ||
    criticalPath === undefined ||
    !direction ||
    !operations ||
    !authModel ||
    !dataClasses ||
    !verificationStatus ||
    !mutationPolicy ||
    !transferPolicy ||
    !reliability
  )
    return undefined;
  return {
    connectorId,
    domain,
    providerRef,
    criticalPath,
    direction,
    operations,
    authModel,
    dataClasses,
    verificationStatus,
    apiVerified: false,
    mutationPolicy,
    transferPolicy,
    reliability,
  };
}

function parseEnvelope(
  value: unknown,
  index: number,
  errors: string[],
): IntegrationSyntheticEnvelopeV1 | undefined {
  const path = `$.synthetic_envelopes[${index}]`;
  const start = errors.length;
  const record = parseRecord(value, path, errors);
  if (!record) return undefined;
  validateKeys(record, ENVELOPE_REQUIRED_KEYS, ENVELOPE_OPTIONAL_KEYS, path, errors);
  parseLiteral(record.schema_version, 'integration-envelope/v1', `${path}.schema_version`, errors);
  parseLiteral(record.synthetic, true, `${path}.synthetic`, errors);
  const eventId = parseRef(record.event_id, `${path}.event_id`, errors);
  const tenantRef = parseRef(record.tenant_ref, `${path}.tenant_ref`, errors);
  const connectorId = parseRef(record.connector_id, `${path}.connector_id`, errors);
  const operation = parseEnum(record.operation, OPERATIONS, `${path}.operation`, errors);
  const correlationId = parseRef(record.correlation_id, `${path}.correlation_id`, errors);
  const idempotencyKey = parseRef(record.idempotency_key, `${path}.idempotency_key`, errors);
  const payloadDigest = parsePatternString(
    record.payload_digest,
    DIGEST_PATTERN,
    'sha256 digest required',
    `${path}.payload_digest`,
    errors,
  );
  const occurredAt = parsePatternString(
    record.occurred_at,
    UTC_TIMESTAMP_PATTERN,
    'UTC timestamp required',
    `${path}.occurred_at`,
    errors,
  );
  const dataClasses = parseUniqueEnumArray(
    record.data_classes,
    DATA_CLASSES,
    `${path}.data_classes`,
    errors,
  );
  const cursorRef = Object.prototype.hasOwnProperty.call(record, 'cursor_ref')
    ? parseRef(record.cursor_ref, `${path}.cursor_ref`, errors)
    : undefined;
  const humanApprovalRef = Object.prototype.hasOwnProperty.call(record, 'human_approval_ref')
    ? parseRef(record.human_approval_ref, `${path}.human_approval_ref`, errors)
    : undefined;
  if (tenantRef && idempotencyKey && !idempotencyKey.startsWith(`${tenantRef}:`))
    addError(errors, `${path}.idempotency_key: tenant-scoped prefix required`);
  if (operation && !READ_ONLY_OPERATIONS.has(operation) && !humanApprovalRef)
    addError(errors, `${path}.human_approval_ref: mutating operation approval required`);
  if (
    errors.length !== start ||
    !eventId ||
    !tenantRef ||
    !connectorId ||
    !operation ||
    !correlationId ||
    !idempotencyKey ||
    !payloadDigest ||
    !occurredAt ||
    !dataClasses
  )
    return undefined;
  return {
    schemaVersion: 'integration-envelope/v1',
    synthetic: true,
    eventId,
    tenantRef,
    connectorId,
    operation,
    correlationId,
    idempotencyKey,
    payloadDigest,
    occurredAt,
    dataClasses,
    ...(cursorRef ? { cursorRef } : {}),
    ...(humanApprovalRef ? { humanApprovalRef } : {}),
  };
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}
function normalizeErrors(errors: readonly string[]): readonly string[] {
  const normalized = [...new Set(errors)].sort((left, right) => left.localeCompare(right));
  if (errors.length >= MAX_ERRORS) normalized.push('$: error budget exceeded');
  return Object.freeze(normalized);
}
function failure(errors: readonly string[]): IntegrationPlatformParseResult {
  return Object.freeze({ ok: false as const, errors: normalizeErrors(errors) });
}

/** Parse the snake_case wire contract into a camelCase, immutable product model. */
export function parseIntegrationPlatformRegistry(input: unknown): IntegrationPlatformParseResult {
  const cloneState: CloneState = { seen: new WeakSet<object>(), errors: [], nodes: 0 };
  const ownedInput = cloneUntrusted(input, '$', 0, cloneState);
  if (ownedInput === INVALID || cloneState.errors.length > 0)
    return failure(cloneState.errors.length > 0 ? cloneState.errors : ['$: invalid input']);

  const errors: string[] = [];
  const root = parseRecord(ownedInput, '$', errors);
  if (!root) return failure(errors);
  validateKeys(root, ROOT_KEYS, [], '$', errors);
  parseLiteral(root.schema_version, 'integration-platform/v1', '$.schema_version', errors);
  parseLiteral(root.activation_gate, 'PRE_G0_CONTRACT_ONLY', '$.activation_gate', errors);

  const connectors: IntegrationConnectorV1[] = [];
  if (!Array.isArray(root.connectors) || root.connectors.length !== 6)
    addError(errors, '$.connectors: exactly six connectors required');
  else
    root.connectors.forEach((value, index) => {
      const parsed = parseConnector(value, index, errors);
      if (parsed) connectors.push(parsed);
    });
  const syntheticEnvelopes: IntegrationSyntheticEnvelopeV1[] = [];
  if (!Array.isArray(root.synthetic_envelopes) || root.synthetic_envelopes.length !== 3)
    addError(errors, '$.synthetic_envelopes: exactly three envelopes required');
  else
    root.synthetic_envelopes.forEach((value, index) => {
      const parsed = parseEnvelope(value, index, errors);
      if (parsed) syntheticEnvelopes.push(parsed);
    });

  if (connectors.length === 6) {
    const ids = connectors.map((connector) => connector.connectorId);
    const domains = connectors.map((connector) => connector.domain);
    if (new Set(ids).size !== ids.length)
      addError(errors, '$.connectors: duplicate connector_id forbidden');
    if (
      new Set(domains).size !== DOMAINS.length ||
      !DOMAINS.every((domain) => domains.includes(domain))
    )
      addError(errors, '$.connectors: each canonical domain must appear exactly once');
  }
  if (syntheticEnvelopes.length === 3) {
    const ids = syntheticEnvelopes.map((envelope) => envelope.eventId);
    if (new Set(ids).size !== ids.length)
      addError(errors, '$.synthetic_envelopes: duplicate event_id forbidden');
    syntheticEnvelopes.forEach((envelope, index) => {
      const profile = ENVELOPE_PROFILES[index];
      const path = `$.synthetic_envelopes[${index}]`;
      if (!profile) {
        addError(errors, `${path}: canonical envelope profile missing`);
        return;
      }
      const exactChecks: readonly [unknown, unknown, string][] = [
        [envelope.eventId, profile.eventId, 'event_id'],
        [envelope.tenantRef, profile.tenantRef, 'tenant_ref'],
        [envelope.connectorId, profile.connectorId, 'connector_id'],
        [envelope.operation, profile.operation, 'operation'],
        [envelope.correlationId, profile.correlationId, 'correlation_id'],
        [envelope.idempotencyKey, profile.idempotencyKey, 'idempotency_key'],
        [envelope.payloadDigest, profile.payloadDigest, 'payload_digest'],
        [envelope.occurredAt, profile.occurredAt, 'occurred_at'],
        [
          envelope.cursorRef ?? null,
          'cursorRef' in profile ? profile.cursorRef : null,
          'cursor_ref',
        ],
        [envelope.humanApprovalRef ?? null, profile.humanApprovalRef ?? null, 'human_approval_ref'],
      ];
      for (const [actual, expected, field] of exactChecks) {
        if (actual !== expected) {
          addError(errors, `${path}.${field}: canonical envelope profile mismatch`);
        }
      }
      if (!sameStringArray(envelope.dataClasses, profile.dataClasses)) {
        addError(errors, `${path}.data_classes: canonical envelope profile mismatch`);
      }
    });
  }
  if (connectors.length === 6 && syntheticEnvelopes.length === 3) {
    const byId = new Map(
      connectors.map((connector) => [connector.connectorId, connector] as const),
    );
    syntheticEnvelopes.forEach((envelope, index) => {
      const path = `$.synthetic_envelopes[${index}]`;
      const connector = byId.get(envelope.connectorId);
      if (!connector) {
        addError(errors, `${path}.connector_id: unknown connector`);
        return;
      }
      if (!connector.operations.includes(envelope.operation))
        addError(errors, `${path}.operation: cross-connector operation laundering forbidden`);
      for (const dataClass of envelope.dataClasses)
        if (!connector.dataClasses.includes(dataClass))
          addError(errors, `${path}.data_classes: cross-connector data-class laundering forbidden`);
      if (
        envelope.operation === 'subscribe_signed_webhook' &&
        (!connector.reliability.webhookSignatureRequired ||
          connector.reliability.replayWindowSeconds <= 0)
      )
        addError(errors, `${path}: signed webhook reliability proof required`);
    });
  }
  if (errors.length > 0) return failure(errors);
  const value = deepFreeze<IntegrationPlatformRegistryV1>({
    schemaVersion: 'integration-platform/v1',
    activationGate: 'PRE_G0_CONTRACT_ONLY',
    connectors,
    syntheticEnvelopes,
  });
  return Object.freeze({ ok: true as const, value });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value))
      deepFreeze((value as Record<PropertyKey, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
}
