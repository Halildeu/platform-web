/**
 * Public ATS `deployment-profile/v1` PRE-G0 sample mirror.
 *
 * Source authority:
 * - repository: Halildeu/ats
 * - file: contracts/samples/deployment-profile.sample.json
 * - commit: c68e27883326e4f9c8e35a4c62df0710924f5b75
 *
 * This is a synthetic, non-executable contract fixture. It contains no private
 * RACI/support matrix, customer coordinate, credential, runtime verification,
 * partner acceptance or production-release claim.
 */

export const ATS_DEPLOYMENT_PROFILE_SOURCE_COMMIT =
  'c68e27883326e4f9c8e35a4c62df0710924f5b75' as const;

export const ATS_DEPLOYMENT_PROFILE_RAW_SAMPLE_SHA256 =
  '0397d3dba18c723f374bbf5c0a08dfa57156399f91c76bd2b95e830deadf6440' as const;

export const DEPLOYMENT_PROFILE_SCHEMA_VERSION = 'deployment-profile/v1' as const;

export type DeploymentTopology = 'MANAGED' | 'DEDICATED' | 'BYO_REGION' | 'SOVEREIGN_ON_PREM';

export type DeploymentReadinessState =
  | 'NOT_CONFIGURED'
  | 'CONFIGURED'
  | 'VERIFIED'
  | 'DRILL_PASSED'
  | 'OWNER_ACCEPTED';

export type DeploymentGateKind =
  | 'SUPPLY_CHAIN'
  | 'PROFILE_RENDER'
  | 'IDENTITY'
  | 'EGRESS'
  | 'SECRET_ROTATION'
  | 'BACKUP_RESTORE'
  | 'UPGRADE_ROLLBACK'
  | 'AUDIT_EXPORT';

export type DeploymentControlOwner = 'PLATFORM' | 'SHARED' | 'CUSTOMER';

export type DeploymentIsolationModel =
  | 'LOGICAL_TENANT'
  | 'DEDICATED_TENANT'
  | 'DEDICATED_REGION'
  | 'CUSTOMER_CONTROLLED_BOUNDARY';

export type DeploymentResidencyModel =
  | 'PLATFORM_APPROVED_REGION'
  | 'CUSTOMER_SELECTED_REGION'
  | 'CUSTOMER_CONTROLLED_RESIDENCY';

export type DeploymentEgressModel =
  | 'ALLOWLIST_ONLY'
  | 'DENY_BY_DEFAULT'
  | 'AIR_GAPPED_OR_CUSTOMER_ALLOWLIST';

export type DeploymentIdentityModel =
  | 'PLATFORM_FEDERATED_OIDC_SAML'
  | 'CUSTOMER_FEDERATED_OIDC_SAML'
  | 'CUSTOMER_CONTROLLED_SSO_SCIM_METADATA';

export type DeploymentSecretModel =
  | 'PLATFORM_KMS_ROTATED'
  | 'CUSTOMER_KMS_BYOK'
  | 'CUSTOMER_MANAGED_OFFLINE_KEYS';

export type DeploymentStorageModel =
  | 'ENCRYPTED_LOGICAL_TENANT'
  | 'ENCRYPTED_DEDICATED'
  | 'CUSTOMER_MANAGED_ENCRYPTED';

export type DeploymentAIProviderModel =
  | 'SELF_HOSTED_PRIMARY'
  | 'CUSTOMER_APPROVED_PROVIDER'
  | 'OFFLINE_SELF_HOSTED_ONLY';

export type DeploymentSupportModel =
  | 'PLATFORM_OPERATED'
  | 'SHARED_RESPONSIBILITY'
  | 'CUSTOMER_OPERATED_SIGNED_BUNDLE';

export interface DeploymentGateEvidenceV1 {
  readonly evidence_ref: string;
  readonly verifier_ref: string;
  readonly verified_at: string;
  readonly drill_evidence_ref?: string;
  readonly measured_at?: string;
  readonly observed_rpo_seconds?: number;
  readonly observed_rto_seconds?: number;
  readonly owner_acceptance_ref?: string;
}

export interface DeploymentReadinessGateV1 {
  readonly kind: DeploymentGateKind;
  readonly status: DeploymentReadinessState;
  readonly evidence_verified: boolean;
  readonly drill_required: boolean;
  readonly drill_passed: boolean;
  readonly owner_accepted: boolean;
  readonly evidence?: DeploymentGateEvidenceV1;
}

export interface DeploymentProfileControlsV1 {
  readonly control_plane_owner: DeploymentControlOwner;
  readonly data_plane_owner: DeploymentControlOwner;
  readonly isolation: DeploymentIsolationModel;
  readonly residency: DeploymentResidencyModel;
  readonly egress: DeploymentEgressModel;
  readonly identity: DeploymentIdentityModel;
  readonly secrets: DeploymentSecretModel;
  readonly storage: DeploymentStorageModel;
  readonly ai_provider: DeploymentAIProviderModel;
  readonly support: DeploymentSupportModel;
}

export interface DeploymentRecoveryObjectivesV1 {
  readonly targets_defined: boolean;
  readonly target_rpo_seconds?: number;
  readonly target_rto_seconds?: number;
  readonly rollback_window_hours: number;
  readonly immutable_artifacts_required: true;
  readonly signed_release_required: true;
  readonly approval_required: true;
}

export interface DeploymentActivationEvidenceV1 {
  readonly release_receipt_ref: string;
  readonly partner_evidence_refs: readonly string[];
  readonly owner_acceptance_ref: string;
  readonly accepted_at: string;
}

export interface DeploymentProfileV1 {
  readonly profile_id: string;
  readonly topology: DeploymentTopology;
  readonly synthetic: boolean;
  readonly readiness_state: DeploymentReadinessState;
  readonly controls: DeploymentProfileControlsV1;
  readonly release_evidence_manifest_ref: string;
  readonly release_evidence_manifest_digest: `sha256:${string}`;
  readonly release_evidence_manifest_verified: boolean;
  readonly recovery_objectives: DeploymentRecoveryObjectivesV1;
  readonly minimum_paid_partners: 0 | 1 | 2;
  readonly paid_partner_count: number;
  readonly partner_evidence_verified: boolean;
  readonly owner_accepted: boolean;
  readonly production_eligible: boolean;
  readonly release_allowed: boolean;
  readonly gates: readonly DeploymentReadinessGateV1[];
  readonly activation_evidence?: DeploymentActivationEvidenceV1;
}

export interface DeploymentProfileRegistryV1 {
  readonly schema_version: typeof DEPLOYMENT_PROFILE_SCHEMA_VERSION;
  readonly activation_gate: 'PRE_G0_CONTRACT_ONLY' | 'G0_ACCEPTED_RUNTIME';
  readonly profiles: readonly DeploymentProfileV1[];
}

export const CANONICAL_DEPLOYMENT_TOPOLOGIES = Object.freeze([
  'MANAGED',
  'DEDICATED',
  'BYO_REGION',
  'SOVEREIGN_ON_PREM',
] as const) satisfies readonly DeploymentTopology[];

export const CANONICAL_DEPLOYMENT_GATE_KINDS = Object.freeze([
  'SUPPLY_CHAIN',
  'PROFILE_RENDER',
  'IDENTITY',
  'EGRESS',
  'SECRET_ROTATION',
  'BACKUP_RESTORE',
  'UPGRADE_ROLLBACK',
  'AUDIT_EXPORT',
] as const) satisfies readonly DeploymentGateKind[];

const DRILL_REQUIRED_GATE_KINDS = new Set<DeploymentGateKind>([
  'EGRESS',
  'SECRET_ROTATION',
  'BACKUP_RESTORE',
  'UPGRADE_ROLLBACK',
  'AUDIT_EXPORT',
]);

function createClosedPreG0Gates(): readonly DeploymentReadinessGateV1[] {
  return CANONICAL_DEPLOYMENT_GATE_KINDS.map((kind) => ({
    kind,
    status: 'NOT_CONFIGURED',
    evidence_verified: false,
    drill_required: DRILL_REQUIRED_GATE_KINDS.has(kind),
    drill_passed: false,
    owner_accepted: false,
  }));
}

function createClosedPreG0Profile(
  profile_id: string,
  topology: DeploymentTopology,
  controls: DeploymentProfileControlsV1,
  minimum_paid_partners: 0 | 1 | 2,
): DeploymentProfileV1 {
  return {
    profile_id,
    topology,
    synthetic: true,
    readiness_state: 'NOT_CONFIGURED',
    controls,
    release_evidence_manifest_ref: 'release-evidence:synthetic:v1',
    release_evidence_manifest_digest:
      'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    release_evidence_manifest_verified: false,
    recovery_objectives: {
      targets_defined: false,
      rollback_window_hours: 72,
      immutable_artifacts_required: true,
      signed_release_required: true,
      approval_required: true,
    },
    minimum_paid_partners,
    paid_partner_count: 0,
    partner_evidence_verified: false,
    owner_accepted: false,
    production_eligible: false,
    release_allowed: false,
    gates: createClosedPreG0Gates(),
  };
}

const syntheticRegistry = {
  schema_version: DEPLOYMENT_PROFILE_SCHEMA_VERSION,
  activation_gate: 'PRE_G0_CONTRACT_ONLY',
  profiles: [
    createClosedPreG0Profile(
      'profile:managed:synthetic',
      'MANAGED',
      {
        control_plane_owner: 'PLATFORM',
        data_plane_owner: 'PLATFORM',
        isolation: 'LOGICAL_TENANT',
        residency: 'PLATFORM_APPROVED_REGION',
        egress: 'ALLOWLIST_ONLY',
        identity: 'PLATFORM_FEDERATED_OIDC_SAML',
        secrets: 'PLATFORM_KMS_ROTATED',
        storage: 'ENCRYPTED_LOGICAL_TENANT',
        ai_provider: 'SELF_HOSTED_PRIMARY',
        support: 'PLATFORM_OPERATED',
      },
      0,
    ),
    createClosedPreG0Profile(
      'profile:dedicated:synthetic',
      'DEDICATED',
      {
        control_plane_owner: 'PLATFORM',
        data_plane_owner: 'PLATFORM',
        isolation: 'DEDICATED_TENANT',
        residency: 'CUSTOMER_SELECTED_REGION',
        egress: 'DENY_BY_DEFAULT',
        identity: 'CUSTOMER_FEDERATED_OIDC_SAML',
        secrets: 'PLATFORM_KMS_ROTATED',
        storage: 'ENCRYPTED_DEDICATED',
        ai_provider: 'SELF_HOSTED_PRIMARY',
        support: 'PLATFORM_OPERATED',
      },
      1,
    ),
    createClosedPreG0Profile(
      'profile:byo-region:synthetic',
      'BYO_REGION',
      {
        control_plane_owner: 'SHARED',
        data_plane_owner: 'CUSTOMER',
        isolation: 'DEDICATED_REGION',
        residency: 'CUSTOMER_SELECTED_REGION',
        egress: 'DENY_BY_DEFAULT',
        identity: 'CUSTOMER_FEDERATED_OIDC_SAML',
        secrets: 'CUSTOMER_KMS_BYOK',
        storage: 'CUSTOMER_MANAGED_ENCRYPTED',
        ai_provider: 'CUSTOMER_APPROVED_PROVIDER',
        support: 'SHARED_RESPONSIBILITY',
      },
      1,
    ),
    createClosedPreG0Profile(
      'profile:sovereign-on-prem:synthetic',
      'SOVEREIGN_ON_PREM',
      {
        control_plane_owner: 'CUSTOMER',
        data_plane_owner: 'CUSTOMER',
        isolation: 'CUSTOMER_CONTROLLED_BOUNDARY',
        residency: 'CUSTOMER_CONTROLLED_RESIDENCY',
        egress: 'AIR_GAPPED_OR_CUSTOMER_ALLOWLIST',
        identity: 'CUSTOMER_CONTROLLED_SSO_SCIM_METADATA',
        secrets: 'CUSTOMER_MANAGED_OFFLINE_KEYS',
        storage: 'CUSTOMER_MANAGED_ENCRYPTED',
        ai_provider: 'OFFLINE_SELF_HOSTED_ONLY',
        support: 'CUSTOMER_OPERATED_SIGNED_BUNDLE',
      },
      2,
    ),
  ],
} as const satisfies DeploymentProfileRegistryV1;

/**
 * This fixture is an exported runtime value, not just a TypeScript type. Deep
 * freezing prevents another consumer in the same browser process from
 * poisoning the canonical PRE-G0 baseline before validation.
 */
export const CANONICAL_SYNTHETIC_DEPLOYMENT_PROFILE_REGISTRY = deepFreeze(syntheticRegistry);

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
