import {
  CANONICAL_DEPLOYMENT_GATE_KINDS,
  CANONICAL_DEPLOYMENT_TOPOLOGIES,
} from './canonicalDeploymentProfileRegistry';
import type {
  DeploymentGateKind,
  DeploymentProfileControlsV1,
  DeploymentProfileRegistryV1,
  DeploymentProfileV1,
  DeploymentReadinessGateV1,
  DeploymentReadinessState,
  DeploymentTopology,
} from './canonicalDeploymentProfileRegistry';

export type DeploymentProfileValidationResult =
  | { readonly ok: true; readonly registry: DeploymentProfileRegistryV1 }
  | { readonly ok: false; readonly issues: readonly string[] };

export type DeploymentEvidenceClass =
  | 'CONTRACT_ONLY'
  | 'DESIRED_CONFIGURATION'
  | 'VERIFICATION_RECEIPT'
  | 'MEASURED_DRILL'
  | 'OWNER_ACCEPTANCE';

const READINESS_STATES = [
  'NOT_CONFIGURED',
  'CONFIGURED',
  'VERIFIED',
  'DRILL_PASSED',
  'OWNER_ACCEPTED',
] as const satisfies readonly DeploymentReadinessState[];

const STATE_RANK = new Map<DeploymentReadinessState, number>(
  READINESS_STATES.map((state, index) => [state, index]),
);

const EXPECTED_PROFILE_COUNT = 4;
const EXPECTED_GATE_COUNT = 8;

const DRILL_REQUIRED = new Set<DeploymentGateKind>([
  'EGRESS',
  'SECRET_ROTATION',
  'BACKUP_RESTORE',
  'UPGRADE_ROLLBACK',
  'AUDIT_EXPORT',
]);

const RPO_RTO_REQUIRED = new Set<DeploymentGateKind>(['BACKUP_RESTORE', 'UPGRADE_ROLLBACK']);

const ROOT_KEYS = ['schema_version', 'activation_gate', 'profiles'] as const;
const PROFILE_KEYS = [
  'profile_id',
  'topology',
  'synthetic',
  'readiness_state',
  'controls',
  'release_evidence_manifest_ref',
  'release_evidence_manifest_digest',
  'release_evidence_manifest_verified',
  'recovery_objectives',
  'minimum_paid_partners',
  'paid_partner_count',
  'partner_evidence_verified',
  'owner_accepted',
  'production_eligible',
  'release_allowed',
  'gates',
] as const;
const PROFILE_OPTIONAL_KEYS = ['activation_evidence'] as const;
const CONTROL_KEYS = [
  'control_plane_owner',
  'data_plane_owner',
  'isolation',
  'residency',
  'egress',
  'identity',
  'secrets',
  'storage',
  'ai_provider',
  'support',
] as const;
const RECOVERY_KEYS = [
  'targets_defined',
  'rollback_window_hours',
  'immutable_artifacts_required',
  'signed_release_required',
  'approval_required',
] as const;
const RECOVERY_OPTIONAL_KEYS = ['target_rpo_seconds', 'target_rto_seconds'] as const;
const GATE_KEYS = [
  'kind',
  'status',
  'evidence_verified',
  'drill_required',
  'drill_passed',
  'owner_accepted',
] as const;
const GATE_OPTIONAL_KEYS = ['evidence'] as const;
const EVIDENCE_KEYS = ['evidence_ref', 'verifier_ref', 'verified_at'] as const;
const EVIDENCE_OPTIONAL_KEYS = [
  'drill_evidence_ref',
  'measured_at',
  'observed_rpo_seconds',
  'observed_rto_seconds',
  'owner_acceptance_ref',
] as const;
const ACTIVATION_KEYS = [
  'release_receipt_ref',
  'partner_evidence_refs',
  'owner_acceptance_ref',
  'accepted_at',
] as const;

const CONTROL_ENUMS = {
  control_plane_owner: ['PLATFORM', 'SHARED', 'CUSTOMER'],
  data_plane_owner: ['PLATFORM', 'SHARED', 'CUSTOMER'],
  isolation: [
    'LOGICAL_TENANT',
    'DEDICATED_TENANT',
    'DEDICATED_REGION',
    'CUSTOMER_CONTROLLED_BOUNDARY',
  ],
  residency: [
    'PLATFORM_APPROVED_REGION',
    'CUSTOMER_SELECTED_REGION',
    'CUSTOMER_CONTROLLED_RESIDENCY',
  ],
  egress: ['ALLOWLIST_ONLY', 'DENY_BY_DEFAULT', 'AIR_GAPPED_OR_CUSTOMER_ALLOWLIST'],
  identity: [
    'PLATFORM_FEDERATED_OIDC_SAML',
    'CUSTOMER_FEDERATED_OIDC_SAML',
    'CUSTOMER_CONTROLLED_SSO_SCIM_METADATA',
  ],
  secrets: ['PLATFORM_KMS_ROTATED', 'CUSTOMER_KMS_BYOK', 'CUSTOMER_MANAGED_OFFLINE_KEYS'],
  storage: ['ENCRYPTED_LOGICAL_TENANT', 'ENCRYPTED_DEDICATED', 'CUSTOMER_MANAGED_ENCRYPTED'],
  ai_provider: ['SELF_HOSTED_PRIMARY', 'CUSTOMER_APPROVED_PROVIDER', 'OFFLINE_SELF_HOSTED_ONLY'],
  support: ['PLATFORM_OPERATED', 'SHARED_RESPONSIBILITY', 'CUSTOMER_OPERATED_SIGNED_BUNDLE'],
} as const;

type ProfileAuthority = {
  readonly controls: DeploymentProfileControlsV1;
  readonly minimumPaidPartners: 0 | 1 | 2;
};

/**
 * Independent parser authority. It deliberately does not read expected values
 * from the exported synthetic registry that it validates, so consumer-side
 * mutation cannot redefine the contract inside the same process.
 */
const CANONICAL_PROFILE_AUTHORITY = Object.freeze({
  MANAGED: frozenAuthority(
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
  DEDICATED: frozenAuthority(
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
  BYO_REGION: frozenAuthority(
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
  SOVEREIGN_ON_PREM: frozenAuthority(
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
} satisfies Readonly<Record<DeploymentTopology, ProfileAuthority>>);

function frozenAuthority(
  controls: DeploymentProfileControlsV1,
  minimumPaidPartners: 0 | 1 | 2,
): ProfileAuthority {
  return Object.freeze({ controls: Object.freeze(controls), minimumPaidPartners });
}

const REF = /^[a-z][a-z0-9-]*(?::[a-z0-9-]+)+$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ZERO_DIGEST = /^sha256:0{64}$/;
const UTC_TIMESTAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$/;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const URL = /\bhttps?:\/\//i;
const IPV4 = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/;
const IPV6 = /(?:\[[0-9a-f:]+\]|[0-9a-f]*::[0-9a-f:]*|^(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}$)/i;

const FORBIDDEN_KEYS = [
  /^(customer|tenant)(_?id|_?name)$/i,
  /^candidate_?(email|phone|name)$/i,
  /^(host_?name|ip_?address|cluster_?endpoint)$/i,
  /^(access_?token|refresh_?token|client_?secret|private_?key|password)$/i,
];

const RELEASE_DETAIL_KEYS = new Set([
  'images',
  'sbom',
  'vuln_scan',
  'license_scan',
  'secret_scan',
  'provenance',
  'signature',
  'model_artifacts',
]);

export function validateDeploymentProfileRegistryV1(
  input: unknown,
): DeploymentProfileValidationResult {
  try {
    const issues: string[] = [];
    validateStructure(input, issues);
    scanForbiddenContent(input, '$registry', issues);

    if (issues.length > 0) {
      return { ok: false, issues: uniqueIssues(issues) };
    }

    const registry = input as DeploymentProfileRegistryV1;
    validateSemantics(registry, issues);

    if (issues.length > 0) return { ok: false, issues: uniqueIssues(issues) };

    // Return an owned immutable snapshot. Callers may retain and mutate the
    // original object after validation; that must never alter cached UI truth.
    const snapshot = deepFreezeSnapshot(structuredClone(registry));
    return { ok: true, registry: snapshot };
  } catch {
    return { ok: false, issues: ['REGISTRY_VALIDATION_EXCEPTION'] };
  }
}

export function deriveProfileReadiness(
  profile: Pick<DeploymentProfileV1, 'gates'>,
): DeploymentReadinessState | null {
  if (profile.gates.length === 0) return null;
  let minimum = READINESS_STATES.length;
  for (const gate of profile.gates) {
    const rank = STATE_RANK.get(gate.status);
    if (rank === undefined) return null;
    minimum = Math.min(minimum, rank);
  }
  return READINESS_STATES[minimum] ?? null;
}

export function evidenceClassForGate(
  gate: Pick<DeploymentReadinessGateV1, 'status'>,
): DeploymentEvidenceClass {
  switch (gate.status) {
    case 'NOT_CONFIGURED':
      return 'CONTRACT_ONLY';
    case 'CONFIGURED':
      return 'DESIRED_CONFIGURATION';
    case 'VERIFIED':
      return 'VERIFICATION_RECEIPT';
    case 'DRILL_PASSED':
      return 'MEASURED_DRILL';
    case 'OWNER_ACCEPTED':
      return 'OWNER_ACCEPTANCE';
  }
}

export function deriveReleaseBlockers(
  registry: DeploymentProfileRegistryV1,
  profile: DeploymentProfileV1,
): readonly string[] {
  const blockers: string[] = [];
  const allGatesAccepted = profile.gates.every(
    (gate) => gate.status === 'OWNER_ACCEPTED' && gate.owner_accepted,
  );
  const partnerThresholdMet = profile.paid_partner_count >= profile.minimum_paid_partners;

  if (registry.activation_gate !== 'G0_ACCEPTED_RUNTIME') blockers.push('G0_RUNTIME_NOT_ACCEPTED');
  if (profile.synthetic) blockers.push('SYNTHETIC_PROFILE');
  if (profile.readiness_state !== 'OWNER_ACCEPTED') blockers.push('PROFILE_NOT_OWNER_ACCEPTED');
  if (!allGatesAccepted) blockers.push('ALL_EIGHT_GATES_NOT_OWNER_ACCEPTED');
  if (!profile.release_evidence_manifest_verified)
    blockers.push('SUPPLY_CHAIN_MANIFEST_NOT_VERIFIED');
  if (!profile.recovery_objectives.targets_defined) blockers.push('RPO_RTO_TARGETS_NOT_DEFINED');
  if (!partnerThresholdMet) blockers.push('PAID_PARTNER_THRESHOLD_NOT_MET');
  if (profile.minimum_paid_partners > 0 && !profile.partner_evidence_verified) {
    blockers.push('PARTNER_EVIDENCE_NOT_VERIFIED');
  }
  if (!profile.owner_accepted) blockers.push('PROFILE_OWNER_ACCEPTANCE_MISSING');
  if (!profile.activation_evidence) blockers.push('ACTIVATION_RECEIPT_MISSING');
  if (!profile.production_eligible) blockers.push('PRODUCTION_ELIGIBILITY_CLOSED');
  if (!profile.release_allowed) blockers.push('DEPLOYMENT_RELEASE_CLOSED');
  // The public v1 payload carries no operational responsibility/support
  // assignment contract. Actor or support-tier inference is forbidden.
  blockers.push('OPERATIONAL_RESPONSIBILITY_NOT_PROVIDED');

  return blockers;
}

function validateStructure(input: unknown, issues: string[]): void {
  if (!exactObject(input, ROOT_KEYS, [], '$registry', issues)) return;

  enumValue(input.schema_version, ['deployment-profile/v1'], '$registry.schema_version', issues);
  enumValue(
    input.activation_gate,
    ['PRE_G0_CONTRACT_ONLY', 'G0_ACCEPTED_RUNTIME'],
    '$registry.activation_gate',
    issues,
  );

  if (!Array.isArray(input.profiles) || input.profiles.length !== 4) {
    issues.push('$registry.profiles: exact four profiles required');
    return;
  }
  input.profiles.forEach((profile, index) => validateProfileStructure(profile, index, issues));
}

function validateProfileStructure(input: unknown, index: number, issues: string[]): void {
  const path = '$registry.profiles[' + index + ']';
  if (!exactObject(input, PROFILE_KEYS, PROFILE_OPTIONAL_KEYS, path, issues)) return;

  refValue(input.profile_id, path + '.profile_id', issues);
  enumValue(input.topology, CANONICAL_DEPLOYMENT_TOPOLOGIES, path + '.topology', issues);
  booleanValue(input.synthetic, path + '.synthetic', issues);
  enumValue(input.readiness_state, READINESS_STATES, path + '.readiness_state', issues);

  if (exactObject(input.controls, CONTROL_KEYS, [], path + '.controls', issues)) {
    for (const key of CONTROL_KEYS) {
      enumValue(input.controls[key], CONTROL_ENUMS[key], path + '.controls.' + key, issues);
    }
  }

  refValue(input.release_evidence_manifest_ref, path + '.release_evidence_manifest_ref', issues);
  if (
    typeof input.release_evidence_manifest_digest !== 'string' ||
    !DIGEST.test(input.release_evidence_manifest_digest)
  ) {
    issues.push(path + '.release_evidence_manifest_digest: strict lowercase sha256 required');
  }
  booleanValue(
    input.release_evidence_manifest_verified,
    path + '.release_evidence_manifest_verified',
    issues,
  );
  validateRecoveryStructure(input.recovery_objectives, path + '.recovery_objectives', issues);
  integerValue(input.minimum_paid_partners, 0, 2, path + '.minimum_paid_partners', issues);
  integerValue(input.paid_partner_count, 0, 100, path + '.paid_partner_count', issues);
  booleanValue(input.partner_evidence_verified, path + '.partner_evidence_verified', issues);
  booleanValue(input.owner_accepted, path + '.owner_accepted', issues);
  booleanValue(input.production_eligible, path + '.production_eligible', issues);
  booleanValue(input.release_allowed, path + '.release_allowed', issues);

  if (!Array.isArray(input.gates) || input.gates.length !== 8) {
    issues.push(path + '.gates: exact eight gates required');
  } else {
    input.gates.forEach((gate, gateIndex) =>
      validateGateStructure(gate, path + '.gates[' + gateIndex + ']', issues),
    );
  }

  if ('activation_evidence' in input) {
    validateActivationStructure(input.activation_evidence, path + '.activation_evidence', issues);
  }
}

function validateRecoveryStructure(input: unknown, path: string, issues: string[]): void {
  if (!exactObject(input, RECOVERY_KEYS, RECOVERY_OPTIONAL_KEYS, path, issues)) return;
  booleanValue(input.targets_defined, path + '.targets_defined', issues);
  integerValue(
    input.rollback_window_hours,
    72,
    Number.MAX_SAFE_INTEGER,
    path + '.rollback_window_hours',
    issues,
  );
  if (input.immutable_artifacts_required !== true)
    issues.push(path + '.immutable_artifacts_required: true required');
  if (input.signed_release_required !== true)
    issues.push(path + '.signed_release_required: true required');
  if (input.approval_required !== true) issues.push(path + '.approval_required: true required');
  if ('target_rpo_seconds' in input) {
    integerValue(input.target_rpo_seconds, 0, 31_536_000, path + '.target_rpo_seconds', issues);
  }
  if ('target_rto_seconds' in input) {
    integerValue(input.target_rto_seconds, 0, 31_536_000, path + '.target_rto_seconds', issues);
  }
}

function validateGateStructure(input: unknown, path: string, issues: string[]): void {
  if (!exactObject(input, GATE_KEYS, GATE_OPTIONAL_KEYS, path, issues)) return;
  enumValue(input.kind, CANONICAL_DEPLOYMENT_GATE_KINDS, path + '.kind', issues);
  enumValue(input.status, READINESS_STATES, path + '.status', issues);
  booleanValue(input.evidence_verified, path + '.evidence_verified', issues);
  booleanValue(input.drill_required, path + '.drill_required', issues);
  booleanValue(input.drill_passed, path + '.drill_passed', issues);
  booleanValue(input.owner_accepted, path + '.owner_accepted', issues);
  if ('evidence' in input) validateEvidenceStructure(input.evidence, path + '.evidence', issues);
}

function validateEvidenceStructure(input: unknown, path: string, issues: string[]): void {
  if (!exactObject(input, EVIDENCE_KEYS, EVIDENCE_OPTIONAL_KEYS, path, issues)) return;
  refValue(input.evidence_ref, path + '.evidence_ref', issues);
  refValue(input.verifier_ref, path + '.verifier_ref', issues);
  timestampValue(input.verified_at, path + '.verified_at', issues);
  if ('drill_evidence_ref' in input)
    refValue(input.drill_evidence_ref, path + '.drill_evidence_ref', issues);
  if ('measured_at' in input) timestampValue(input.measured_at, path + '.measured_at', issues);
  if ('observed_rpo_seconds' in input) {
    integerValue(input.observed_rpo_seconds, 0, 31_536_000, path + '.observed_rpo_seconds', issues);
  }
  if ('observed_rto_seconds' in input) {
    integerValue(input.observed_rto_seconds, 0, 31_536_000, path + '.observed_rto_seconds', issues);
  }
  if ('owner_acceptance_ref' in input) {
    refValue(input.owner_acceptance_ref, path + '.owner_acceptance_ref', issues);
  }
}

function validateActivationStructure(input: unknown, path: string, issues: string[]): void {
  if (!exactObject(input, ACTIVATION_KEYS, [], path, issues)) return;
  refValue(input.release_receipt_ref, path + '.release_receipt_ref', issues);
  refValue(input.owner_acceptance_ref, path + '.owner_acceptance_ref', issues);
  timestampValue(input.accepted_at, path + '.accepted_at', issues);
  if (!Array.isArray(input.partner_evidence_refs) || input.partner_evidence_refs.length > 10) {
    issues.push(path + '.partner_evidence_refs: array with at most ten refs required');
  } else {
    const unique = new Set<string>();
    input.partner_evidence_refs.forEach((value, index) => {
      refValue(value, path + '.partner_evidence_refs[' + index + ']', issues);
      if (typeof value === 'string') unique.add(value);
    });
    if (unique.size !== input.partner_evidence_refs.length) {
      issues.push(path + '.partner_evidence_refs: duplicate refs forbidden');
    }
  }
}

function validateSemantics(registry: DeploymentProfileRegistryV1, issues: string[]): void {
  const topologies = new Set(registry.profiles.map((profile) => profile.topology));
  const profileIds = new Set(registry.profiles.map((profile) => profile.profile_id));
  if (
    registry.profiles.length !== EXPECTED_PROFILE_COUNT ||
    topologies.size !== EXPECTED_PROFILE_COUNT
  ) {
    issues.push('PROFILE_TOPOLOGY_SET_INVALID');
  }
  for (const topology of CANONICAL_DEPLOYMENT_TOPOLOGIES) {
    if (!topologies.has(topology)) issues.push('PROFILE_TOPOLOGY_MISSING:' + topology);
  }
  if (profileIds.size !== registry.profiles.length) issues.push('PROFILE_ID_DUPLICATE');

  for (const profile of registry.profiles) validateProfileSemantics(registry, profile, issues);
}

function validateProfileSemantics(
  registry: DeploymentProfileRegistryV1,
  profile: DeploymentProfileV1,
  issues: string[],
): void {
  const authority = CANONICAL_PROFILE_AUTHORITY[profile.topology];
  if (!authority) {
    issues.push('PROFILE_TOPOLOGY_UNKNOWN:' + profile.topology);
    return;
  }
  if (profile.minimum_paid_partners !== authority.minimumPaidPartners) {
    issues.push(profile.topology + ':MINIMUM_PAID_PARTNERS_MISMATCH');
  }
  if (!deepEqual(profile.controls, authority.controls)) {
    issues.push(profile.topology + ':CONTROL_BOUNDARY_MISMATCH');
  }
  if (!profile.release_evidence_manifest_ref.startsWith('release-evidence:')) {
    issues.push(profile.topology + ':RELEASE_EVIDENCE_REF_INVALID');
  }
  if (
    profile.release_evidence_manifest_verified &&
    ZERO_DIGEST.test(profile.release_evidence_manifest_digest)
  ) {
    issues.push(profile.topology + ':VERIFIED_MANIFEST_USES_ZERO_DIGEST');
  }

  const objectives = profile.recovery_objectives;
  const hasRpo = Number.isInteger(objectives.target_rpo_seconds);
  const hasRto = Number.isInteger(objectives.target_rto_seconds);
  if (objectives.targets_defined !== (hasRpo && hasRto)) {
    issues.push(profile.topology + ':RPO_RTO_TARGET_PAIR_INVALID');
  }
  if (!objectives.targets_defined && (hasRpo || hasRto)) {
    issues.push(profile.topology + ':RPO_RTO_TARGETS_FORBIDDEN_WHILE_UNDEFINED');
  }

  const gateKinds = new Set(profile.gates.map((gate) => gate.kind));
  if (profile.gates.length !== EXPECTED_GATE_COUNT || gateKinds.size !== EXPECTED_GATE_COUNT) {
    issues.push(profile.topology + ':GATE_SET_INVALID');
  }
  for (const kind of CANONICAL_DEPLOYMENT_GATE_KINDS) {
    if (!gateKinds.has(kind)) issues.push(profile.topology + ':GATE_MISSING:' + kind);
  }
  for (const gate of profile.gates) validateGateSemantics(profile, gate, issues);

  const derived = deriveProfileReadiness(profile);
  if (derived !== profile.readiness_state) {
    issues.push(profile.topology + ':READINESS_NOT_LEAST_READY_GATE');
  }
  const supplyGate = profile.gates.find((gate) => gate.kind === 'SUPPLY_CHAIN');
  if (profile.release_evidence_manifest_verified !== Boolean(supplyGate?.evidence_verified)) {
    issues.push(profile.topology + ':MANIFEST_VERIFICATION_GATE_MISMATCH');
  }
  const allGatesAccepted = profile.gates.every(
    (gate) => gate.status === 'OWNER_ACCEPTED' && gate.owner_accepted,
  );
  if (
    profile.owner_accepted &&
    (profile.readiness_state !== 'OWNER_ACCEPTED' || !allGatesAccepted)
  ) {
    issues.push(profile.topology + ':PROFILE_OWNER_ACCEPTANCE_BYPASS');
  }

  const partnerThresholdMet = profile.paid_partner_count >= profile.minimum_paid_partners;
  if (profile.partner_evidence_verified && !partnerThresholdMet) {
    issues.push(profile.topology + ':PARTNER_EVIDENCE_BELOW_THRESHOLD');
  }
  if (profile.production_eligible !== profile.release_allowed) {
    issues.push(profile.topology + ':PRODUCTION_RELEASE_FLAG_MISMATCH');
  }

  if (profile.release_allowed) {
    const partnerReady = profile.minimum_paid_partners === 0 || profile.partner_evidence_verified;
    if (
      registry.activation_gate !== 'G0_ACCEPTED_RUNTIME' ||
      profile.synthetic ||
      profile.readiness_state !== 'OWNER_ACCEPTED' ||
      !allGatesAccepted ||
      !profile.release_evidence_manifest_verified ||
      !objectives.targets_defined ||
      !partnerThresholdMet ||
      !partnerReady ||
      !profile.owner_accepted ||
      !profile.activation_evidence
    ) {
      issues.push(profile.topology + ':RELEASE_ACCEPTANCE_CHAIN_BYPASS');
    }
    if (
      (profile.activation_evidence?.partner_evidence_refs.length ?? 0) <
      profile.minimum_paid_partners
    ) {
      issues.push(profile.topology + ':ACTIVATION_PARTNER_RECEIPTS_MISSING');
    }
  } else if (profile.activation_evidence) {
    issues.push(profile.topology + ':ACTIVATION_EVIDENCE_WHILE_RELEASE_CLOSED');
  }

  if (registry.activation_gate === 'PRE_G0_CONTRACT_ONLY') {
    validatePreG0Profile(profile, issues);
  }
}

function validateGateSemantics(
  profile: DeploymentProfileV1,
  gate: DeploymentReadinessGateV1,
  issues: string[],
): void {
  const prefix = profile.topology + '/' + gate.kind;
  const mustDrill = DRILL_REQUIRED.has(gate.kind);
  if (gate.drill_required !== mustDrill) issues.push(prefix + ':DRILL_POLICY_MISMATCH');

  const early = gate.status === 'NOT_CONFIGURED' || gate.status === 'CONFIGURED';
  if (
    early &&
    (gate.evidence_verified || gate.drill_passed || gate.owner_accepted || gate.evidence)
  ) {
    issues.push(prefix + ':EARLY_STATE_EVIDENCE_LAUNDERING');
  }
  const verifiedOrLater =
    gate.status === 'VERIFIED' ||
    gate.status === 'DRILL_PASSED' ||
    gate.status === 'OWNER_ACCEPTED';
  if (verifiedOrLater && (!gate.evidence_verified || !gate.evidence)) {
    issues.push(prefix + ':VERIFICATION_RECEIPT_REQUIRED');
  }

  const drillState =
    gate.status === 'DRILL_PASSED' || (gate.status === 'OWNER_ACCEPTED' && mustDrill);
  if (drillState) {
    if (
      !mustDrill ||
      !gate.drill_passed ||
      !gate.evidence?.drill_evidence_ref ||
      !gate.evidence.measured_at
    ) {
      issues.push(prefix + ':MEASURED_DRILL_RECEIPT_REQUIRED');
    }
    if (RPO_RTO_REQUIRED.has(gate.kind)) {
      if (!Number.isInteger(gate.evidence?.observed_rpo_seconds)) {
        issues.push(prefix + ':OBSERVED_RPO_REQUIRED');
      }
      if (!Number.isInteger(gate.evidence?.observed_rto_seconds)) {
        issues.push(prefix + ':OBSERVED_RTO_REQUIRED');
      }
      if (profile.recovery_objectives.targets_defined) {
        if (
          (gate.evidence?.observed_rpo_seconds ?? Number.POSITIVE_INFINITY) >
          (profile.recovery_objectives.target_rpo_seconds ?? -1)
        ) {
          issues.push(prefix + ':OBSERVED_RPO_EXCEEDS_TARGET');
        }
        if (
          (gate.evidence?.observed_rto_seconds ?? Number.POSITIVE_INFINITY) >
          (profile.recovery_objectives.target_rto_seconds ?? -1)
        ) {
          issues.push(prefix + ':OBSERVED_RTO_EXCEEDS_TARGET');
        }
      }
    }
  } else if (gate.drill_passed) {
    issues.push(prefix + ':DRILL_FLAG_STATE_MISMATCH');
  }

  if (gate.status === 'OWNER_ACCEPTED') {
    if (!gate.owner_accepted || !gate.evidence?.owner_acceptance_ref) {
      issues.push(prefix + ':OWNER_ACCEPTANCE_RECEIPT_REQUIRED');
    }
  } else if (gate.owner_accepted) {
    issues.push(prefix + ':OWNER_FLAG_STATE_MISMATCH');
  }

  if (
    gate.kind === 'SUPPLY_CHAIN' &&
    gate.evidence_verified &&
    gate.evidence?.evidence_ref !== profile.release_evidence_manifest_ref
  ) {
    issues.push(prefix + ':SUPPLY_CHAIN_REF_MISMATCH');
  }
}

function validatePreG0Profile(profile: DeploymentProfileV1, issues: string[]): void {
  if (!profile.synthetic) issues.push(profile.topology + ':PRE_G0_MUST_BE_SYNTHETIC');
  if (profile.readiness_state !== 'NOT_CONFIGURED') {
    issues.push(profile.topology + ':PRE_G0_READINESS_NOT_CLOSED');
  }
  if (
    profile.recovery_objectives.targets_defined ||
    profile.release_evidence_manifest_verified ||
    profile.partner_evidence_verified ||
    profile.owner_accepted ||
    profile.production_eligible ||
    profile.release_allowed ||
    profile.activation_evidence
  ) {
    issues.push(profile.topology + ':PRE_G0_ACCEPTANCE_CLAIM_FORBIDDEN');
  }
  for (const gate of profile.gates) {
    if (
      gate.status !== 'NOT_CONFIGURED' ||
      gate.evidence_verified ||
      gate.drill_passed ||
      gate.owner_accepted ||
      gate.evidence
    ) {
      issues.push(profile.topology + '/' + gate.kind + ':PRE_G0_GATE_NOT_CLOSED');
    }
  }
}

function exactObject<
  const Required extends readonly string[],
  const Optional extends readonly string[],
>(
  input: unknown,
  required: Required,
  optional: Optional,
  path: string,
  issues: string[],
): input is Record<Required[number] | Optional[number], unknown> {
  if (!isRecord(input)) {
    issues.push(path + ': object required');
    return false;
  }
  const allowed = new Set<string>([...required, ...optional]);
  const keys = Object.keys(input);
  for (const key of required) {
    if (!(key in input)) issues.push(path + ': missing key ' + key);
  }
  for (const key of keys) {
    if (!allowed.has(key)) issues.push(path + ': unknown key ' + key);
  }
  return required.every((key) => key in input) && keys.every((key) => allowed.has(key));
}

function enumValue(
  input: unknown,
  allowed: readonly string[],
  path: string,
  issues: string[],
): void {
  if (typeof input !== 'string' || !allowed.includes(input)) {
    issues.push(path + ': unsupported enum value');
  }
}

function booleanValue(input: unknown, path: string, issues: string[]): void {
  if (typeof input !== 'boolean') issues.push(path + ': boolean required');
}

function integerValue(
  input: unknown,
  minimum: number,
  maximum: number,
  path: string,
  issues: string[],
): void {
  if (!Number.isInteger(input) || (input as number) < minimum || (input as number) > maximum) {
    issues.push(path + ': integer outside allowed range');
  }
}

function refValue(input: unknown, path: string, issues: string[]): void {
  if (typeof input !== 'string' || input.length < 3 || input.length > 200 || !REF.test(input)) {
    issues.push(path + ': opaque versioned ref required');
  }
}

function timestampValue(input: unknown, path: string, issues: string[]): void {
  if (typeof input !== 'string' || !UTC_TIMESTAMP.test(input) || Number.isNaN(Date.parse(input))) {
    issues.push(path + ': valid UTC timestamp required');
  }
}

function scanForbiddenContent(
  input: unknown,
  path: string,
  issues: string[],
  seen = new WeakSet<object>(),
  depth = 0,
  budget = { remaining: 10_000 },
): void {
  if (depth > 64) {
    issues.push(path + ': maximum nesting depth exceeded');
    return;
  }
  if (budget.remaining <= 0) {
    issues.push(path + ': scan node budget exceeded');
    return;
  }
  if (Array.isArray(input)) {
    if (seen.has(input)) {
      issues.push(path + ': cyclic value forbidden');
      return;
    }
    seen.add(input);
    budget.remaining -= 1;
    input.forEach((item, index) =>
      scanForbiddenContent(item, path + '[' + index + ']', issues, seen, depth + 1, budget),
    );
    return;
  }
  if (isRecord(input)) {
    if (seen.has(input)) {
      issues.push(path + ': cyclic value forbidden');
      return;
    }
    seen.add(input);
    budget.remaining -= 1;
    for (const [key, value] of Object.entries(input)) {
      if (FORBIDDEN_KEYS.some((pattern) => pattern.test(key))) {
        issues.push(path + '.' + key + ': forbidden secret/PII/network key');
      }
      if (RELEASE_DETAIL_KEYS.has(key)) {
        issues.push(path + '.' + key + ': release-evidence detail duplicated');
      }
      scanForbiddenContent(value, path + '.' + key, issues, seen, depth + 1, budget);
    }
    return;
  }
  if (typeof input === 'string') {
    if (EMAIL.test(input)) issues.push(path + ': email-like value forbidden');
    if (URL.test(input)) issues.push(path + ': URL/host coordinate forbidden');
    if (IPV4.test(input)) issues.push(path + ': IPv4 coordinate forbidden');
    if (!UTC_TIMESTAMP.test(input) && IPV6.test(input))
      issues.push(path + ': IPv6 coordinate forbidden');
  }
}

function deepEqual(left: unknown, right: unknown): boolean {
  return stableValue(left) === stableValue(right);
}

function stableValue(input: unknown): string {
  if (Array.isArray(input)) return '[' + input.map(stableValue).join(',') + ']';
  if (isRecord(input)) {
    return (
      '{' +
      Object.keys(input)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + stableValue(input[key]))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(input);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function uniqueIssues(issues: readonly string[]): readonly string[] {
  return [...new Set(issues)];
}

function deepFreezeSnapshot<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreezeSnapshot(nested);
  return value;
}
