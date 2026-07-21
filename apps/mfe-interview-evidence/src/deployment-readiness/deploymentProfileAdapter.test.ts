import { describe, expect, test } from 'vitest';
import {
  CANONICAL_DEPLOYMENT_GATE_KINDS,
  CANONICAL_DEPLOYMENT_TOPOLOGIES,
  CANONICAL_SYNTHETIC_DEPLOYMENT_PROFILE_REGISTRY,
} from './canonicalDeploymentProfileRegistry';
import type {
  DeploymentProfileRegistryV1,
  DeploymentReadinessGateV1,
} from './canonicalDeploymentProfileRegistry';
import {
  deriveProfileReadiness,
  deriveReleaseBlockers,
  evidenceClassForGate,
  validateDeploymentProfileRegistryV1,
} from './deploymentProfileAdapter';

const cloneFixture = () =>
  JSON.parse(
    JSON.stringify(CANONICAL_SYNTHETIC_DEPLOYMENT_PROFILE_REGISTRY),
  ) as DeploymentProfileRegistryV1;

describe('deploymentProfileAdapter', () => {
  test('public ATS PRE-G0 fixture is exact 4 profile x 8 profile-bound gates', () => {
    const result = validateDeploymentProfileRegistryV1(
      CANONICAL_SYNTHETIC_DEPLOYMENT_PROFILE_REGISTRY,
    );

    expect(result).toEqual({
      ok: true,
      registry: CANONICAL_SYNTHETIC_DEPLOYMENT_PROFILE_REGISTRY,
    });
    expect(
      CANONICAL_SYNTHETIC_DEPLOYMENT_PROFILE_REGISTRY.profiles.map((profile) => profile.topology),
    ).toEqual(CANONICAL_DEPLOYMENT_TOPOLOGIES);
    for (const profile of CANONICAL_SYNTHETIC_DEPLOYMENT_PROFILE_REGISTRY.profiles) {
      expect(profile.gates.map((gate) => gate.kind)).toEqual(CANONICAL_DEPLOYMENT_GATE_KINDS);
      expect(profile.gates).toHaveLength(8);
      expect(profile.gates.every((gate) => gate.status === 'NOT_CONFIGURED')).toBe(true);
    }
    expect(CANONICAL_SYNTHETIC_DEPLOYMENT_PROFILE_REGISTRY.profiles[0]?.gates).not.toBe(
      CANONICAL_SYNTHETIC_DEPLOYMENT_PROFILE_REGISTRY.profiles[1]?.gates,
    );
  });

  test('canonical fixture remains PRE-G0, synthetic and non-executable', () => {
    expect(CANONICAL_SYNTHETIC_DEPLOYMENT_PROFILE_REGISTRY.activation_gate).toBe(
      'PRE_G0_CONTRACT_ONLY',
    );
    for (const profile of CANONICAL_SYNTHETIC_DEPLOYMENT_PROFILE_REGISTRY.profiles) {
      expect(profile.synthetic).toBe(true);
      expect(profile.owner_accepted).toBe(false);
      expect(profile.partner_evidence_verified).toBe(false);
      expect(profile.production_eligible).toBe(false);
      expect(profile.release_allowed).toBe(false);
      expect(profile.activation_evidence).toBeUndefined();
    }
  });

  test('exported fixture is deeply frozen and parser authority cannot be poisoned', () => {
    const canonicalManaged = CANONICAL_SYNTHETIC_DEPLOYMENT_PROFILE_REGISTRY.profiles[0]!;
    expect(Object.isFrozen(CANONICAL_SYNTHETIC_DEPLOYMENT_PROFILE_REGISTRY)).toBe(true);
    expect(Object.isFrozen(canonicalManaged)).toBe(true);
    expect(Object.isFrozen(canonicalManaged.controls)).toBe(true);
    expect(Object.isFrozen(CANONICAL_DEPLOYMENT_TOPOLOGIES)).toBe(true);
    expect(Object.isFrozen(CANONICAL_DEPLOYMENT_GATE_KINDS)).toBe(true);
    expect(
      Reflect.set(
        canonicalManaged.controls as unknown as Record<string, unknown>,
        'control_plane_owner',
        'CUSTOMER',
      ),
    ).toBe(false);

    const poisoned = cloneFixture() as unknown as Record<string, unknown>;
    const controls = firstProfile(poisoned).controls as Record<string, unknown>;
    controls.control_plane_owner = 'CUSTOMER';
    controls.data_plane_owner = 'CUSTOMER';
    expect(validateDeploymentProfileRegistryV1(poisoned).ok).toBe(false);
    expect(
      validateDeploymentProfileRegistryV1(CANONICAL_SYNTHETIC_DEPLOYMENT_PROFILE_REGISTRY).ok,
    ).toBe(true);
  });

  test('exact topology and gate cardinality stays pinned independently of exported arrays', () => {
    expect(
      Reflect.deleteProperty(
        CANONICAL_DEPLOYMENT_TOPOLOGIES as unknown as Record<string, unknown>,
        '3',
      ),
    ).toBe(false);
    expect(
      Reflect.deleteProperty(
        CANONICAL_DEPLOYMENT_GATE_KINDS as unknown as Record<string, unknown>,
        '7',
      ),
    ).toBe(false);

    const duplicateTopology = cloneFixture() as unknown as Record<string, unknown>;
    const profiles = duplicateTopology.profiles as Record<string, unknown>[];
    profiles[3]!.topology = 'MANAGED';
    profiles[3]!.profile_id = profiles[0]!.profile_id;
    expect(validateDeploymentProfileRegistryV1(duplicateTopology).ok).toBe(false);

    const duplicateGate = cloneFixture() as unknown as Record<string, unknown>;
    const gates = firstProfile(duplicateGate).gates as Record<string, unknown>[];
    gates[7] = structuredClone(gates[0]!);
    expect(validateDeploymentProfileRegistryV1(duplicateGate).ok).toBe(false);
  });

  test('validated result is an owned frozen snapshot immune to same-reference TOCTOU mutation', () => {
    const input = cloneFixture();
    const result = validateDeploymentProfileRegistryV1(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.registry).not.toBe(input);
    expect(Object.isFrozen(result.registry)).toBe(true);
    expect(Object.isFrozen(result.registry.profiles[0])).toBe(true);
    (input.profiles[0] as unknown as Record<string, unknown>).release_allowed = true;

    expect(result.registry.profiles[0]?.release_allowed).toBe(false);
    expect(
      Reflect.set(
        result.registry.profiles[0] as unknown as Record<string, unknown>,
        'release_allowed',
        true,
      ),
    ).toBe(false);
  });

  test('snapshots getter-backed values once before validation and returns that exact snapshot', () => {
    const input = cloneFixture();
    const managed = input.profiles[0]!;
    let reads = 0;
    Object.defineProperty(managed, 'release_allowed', {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1;
        return reads === 1 ? false : true;
      },
    });

    const result = validateDeploymentProfileRegistryV1(input);

    expect(reads).toBe(1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.registry.profiles[0]?.release_allowed).toBe(false);
    expect(input.profiles[0]?.release_allowed).toBe(true);
    expect(result.registry.profiles[0]?.release_allowed).toBe(false);
  });

  test('prototype-only required profile fields fail closed', () => {
    const payload = {
      schema_version: CANONICAL_SYNTHETIC_DEPLOYMENT_PROFILE_REGISTRY.schema_version,
      activation_gate: CANONICAL_SYNTHETIC_DEPLOYMENT_PROFILE_REGISTRY.activation_gate,
      profiles: CANONICAL_SYNTHETIC_DEPLOYMENT_PROFILE_REGISTRY.profiles.map((profile) =>
        Object.create(profile),
      ),
    };

    const result = validateDeploymentProfileRegistryV1(payload);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContain('$registry.profiles[0]: missing key profile_id');
    }
  });

  test('cyclic, over-deep and throwing proxy payloads fail closed without throwing', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    let deep: Record<string, unknown> = {};
    const deepRoot = deep;
    for (let index = 0; index < 100; index += 1) {
      deep.next = {};
      deep = deep.next as Record<string, unknown>;
    }
    const throwingProxy = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('adversarial ownKeys');
        },
      },
    );

    for (const payload of [cyclic, deepRoot, throwingProxy]) {
      expect(() => validateDeploymentProfileRegistryV1(payload)).not.toThrow();
      expect(validateDeploymentProfileRegistryV1(payload).ok).toBe(false);
    }
  });

  test.each([
    ['null', null],
    ['primitive', 'deployment-profile/v1'],
    ['array', []],
    ['empty-object', {}],
  ])('malformed %s payload fails closed without throwing', (_name, payload) => {
    expect(() => validateDeploymentProfileRegistryV1(payload)).not.toThrow();
    expect(validateDeploymentProfileRegistryV1(payload).ok).toBe(false);
  });

  test.each([
    [
      'unknown root key',
      (fixture: Record<string, unknown>) => {
        fixture.runtime_ready = true;
      },
    ],
    [
      'unknown profile key',
      (fixture: Record<string, unknown>) => {
        firstProfile(fixture).customer_name = 'private';
      },
    ],
    [
      'unknown gate key',
      (fixture: Record<string, unknown>) => {
        firstGate(fixture).verified_by_ui = true;
      },
    ],
    [
      'missing topology',
      (fixture: Record<string, unknown>) => {
        const profiles = fixture.profiles as Record<string, unknown>[];
        profiles[1] = structuredClone(profiles[0] ?? {});
      },
    ],
    [
      'duplicate gate',
      (fixture: Record<string, unknown>) => {
        const gates = firstProfile(fixture).gates as Record<string, unknown>[];
        gates[1] = structuredClone(gates[0] ?? {});
      },
    ],
    [
      'topology controls transplanted',
      (fixture: Record<string, unknown>) => {
        const profiles = fixture.profiles as Record<string, unknown>[];
        profiles[2]!.controls = structuredClone(profiles[0]!.controls);
      },
    ],
    [
      'wrong paid partner threshold',
      (fixture: Record<string, unknown>) => {
        firstProfile(fixture).minimum_paid_partners = 2;
      },
    ],
    [
      'short rollback window',
      (fixture: Record<string, unknown>) => {
        const recovery = firstProfile(fixture).recovery_objectives as Record<string, unknown>;
        recovery.rollback_window_hours = 71;
      },
    ],
    [
      'partial RPO target',
      (fixture: Record<string, unknown>) => {
        const recovery = firstProfile(fixture).recovery_objectives as Record<string, unknown>;
        recovery.target_rpo_seconds = 3600;
      },
    ],
    [
      'unsigned policy',
      (fixture: Record<string, unknown>) => {
        const recovery = firstProfile(fixture).recovery_objectives as Record<string, unknown>;
        recovery.signed_release_required = false;
      },
    ],
    [
      'drill policy bypass',
      (fixture: Record<string, unknown>) => {
        const gates = firstProfile(fixture).gates as Record<string, unknown>[];
        gates[3]!.drill_required = false;
      },
    ],
    [
      'forged early evidence flag',
      (fixture: Record<string, unknown>) => {
        firstGate(fixture).evidence_verified = true;
      },
    ],
    [
      'forged owner acceptance',
      (fixture: Record<string, unknown>) => {
        firstProfile(fixture).owner_accepted = true;
      },
    ],
    [
      'forged release decision',
      (fixture: Record<string, unknown>) => {
        firstProfile(fixture).release_allowed = true;
        firstProfile(fixture).production_eligible = true;
      },
    ],
    [
      'verified zero digest',
      (fixture: Record<string, unknown>) => {
        firstProfile(fixture).release_evidence_manifest_verified = true;
        firstGate(fixture).evidence_verified = true;
      },
    ],
    [
      'supply chain details duplicated',
      (fixture: Record<string, unknown>) => {
        firstProfile(fixture).sbom = 'release-evidence:forbidden:v1';
      },
    ],
    [
      'network coordinate injected',
      (fixture: Record<string, unknown>) => {
        firstProfile(fixture).cluster_endpoint = 'https://cluster.example.test';
      },
    ],
  ])('%s fails closed', (_name, mutate) => {
    const fixture = cloneFixture() as unknown as Record<string, unknown>;
    mutate(fixture);

    const result = validateDeploymentProfileRegistryV1(fixture);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.length).toBeGreaterThan(0);
  });

  test('least-ready gate derives profile readiness without average scoring', () => {
    const gates = CANONICAL_DEPLOYMENT_GATE_KINDS.map((kind) => ({
      kind,
      status: 'OWNER_ACCEPTED',
      evidence_verified: true,
      drill_required: [
        'EGRESS',
        'SECRET_ROTATION',
        'BACKUP_RESTORE',
        'UPGRADE_ROLLBACK',
        'AUDIT_EXPORT',
      ].includes(kind),
      drill_passed: [
        'EGRESS',
        'SECRET_ROTATION',
        'BACKUP_RESTORE',
        'UPGRADE_ROLLBACK',
        'AUDIT_EXPORT',
      ].includes(kind),
      owner_accepted: true,
    })) as DeploymentReadinessGateV1[];
    gates[6] = {
      ...gates[6]!,
      status: 'CONFIGURED',
      evidence_verified: false,
      drill_passed: false,
      owner_accepted: false,
    };

    expect(deriveProfileReadiness({ gates })).toBe('CONFIGURED');
  });

  test('evidence classes preserve contract, config, verification, drill and owner distinctions', () => {
    const baseGate = CANONICAL_SYNTHETIC_DEPLOYMENT_PROFILE_REGISTRY.profiles[0]!.gates[0]!;
    expect(evidenceClassForGate({ ...baseGate, status: 'NOT_CONFIGURED' })).toBe('CONTRACT_ONLY');
    expect(evidenceClassForGate({ ...baseGate, status: 'CONFIGURED' })).toBe(
      'DESIRED_CONFIGURATION',
    );
    expect(evidenceClassForGate({ ...baseGate, status: 'VERIFIED' })).toBe('VERIFICATION_RECEIPT');
    expect(evidenceClassForGate({ ...baseGate, status: 'DRILL_PASSED' })).toBe('MEASURED_DRILL');
    expect(evidenceClassForGate({ ...baseGate, status: 'OWNER_ACCEPTED' })).toBe(
      'OWNER_ACCEPTANCE',
    );
  });

  test('PRE-G0 blocker list includes unresolved public operational responsibility boundary', () => {
    const profile = CANONICAL_SYNTHETIC_DEPLOYMENT_PROFILE_REGISTRY.profiles[3]!;
    const blockers = deriveReleaseBlockers(
      CANONICAL_SYNTHETIC_DEPLOYMENT_PROFILE_REGISTRY,
      profile,
    );

    expect(blockers).toContain('G0_RUNTIME_NOT_ACCEPTED');
    expect(blockers).toContain('ALL_EIGHT_GATES_NOT_OWNER_ACCEPTED');
    expect(blockers).toContain('PAID_PARTNER_THRESHOLD_NOT_MET');
    expect(blockers).toContain('OPERATIONAL_RESPONSIBILITY_NOT_PROVIDED');
    expect(blockers).toContain('DEPLOYMENT_RELEASE_CLOSED');
  });

  // P5-WEB-SEC-02: pre-clone payload bounds guard tests
  describe('payload bounds (P5-WEB-SEC-02)', () => {
    test('over-budget depth fails closed without cloning', () => {
      let deep: unknown = 'leaf';
      for (let i = 0; i < 25; i++) deep = { nested: deep };
      const result = validateDeploymentProfileRegistryV1(deep);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issues).toContain('PAYLOAD_DEPTH_EXCEEDED');
    });

    test('over-budget object keys per level fails closed', () => {
      const wideObj: Record<string, string> = {};
      for (let i = 0; i < 250; i++) wideObj[`k${i}`] = 'v';
      const result = validateDeploymentProfileRegistryV1(wideObj);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issues).toContain('PAYLOAD_OBJECT_KEYS_EXCEEDED');
    });

    test('over-budget array cardinality fails closed', () => {
      const bigArr = new Array(600).fill('x');
      const payload = { schema_version: 'x', profiles: bigArr };
      const result = validateDeploymentProfileRegistryV1(payload);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issues).toContain('PAYLOAD_ARRAY_LENGTH_EXCEEDED');
    });

    test('over-budget string length fails closed', () => {
      const longStr = 'a'.repeat(17 * 1024);
      const payload = { schema_version: longStr, profiles: [] };
      const result = validateDeploymentProfileRegistryV1(payload);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issues).toContain('PAYLOAD_STRING_SIZE_EXCEEDED');
    });

    test('over-budget total nodes fails closed', () => {
      // Build a shallow-but-wide payload with more than 10K total nodes
      const nested: Record<string, unknown> = {};
      // Create many small objects to breach total node count
      for (let i = 0; i < 60; i++) {
        const inner: Record<string, unknown> = {};
        for (let j = 0; j < 199; j++) inner[`k${j}`] = j;
        nested[`o${i}`] = inner;
      }
      const result = validateDeploymentProfileRegistryV1(nested);
      expect(result.ok).toBe(false);
      // Either total-nodes or keys-exceeded may hit first depending on order
      if (!result.ok) {
        const first = result.issues[0]!;
        expect(['PAYLOAD_TOTAL_NODES_EXCEEDED', 'PAYLOAD_OBJECT_KEYS_EXCEEDED']).toContain(first);
      }
    });

    test('canonical fixture stays within bounds (backward compat)', () => {
      const result = validateDeploymentProfileRegistryV1(
        CANONICAL_SYNTHETIC_DEPLOYMENT_PROFILE_REGISTRY,
      );
      expect(result.ok).toBe(true);
    });
  });
});

function firstProfile(fixture: Record<string, unknown>): Record<string, unknown> {
  return (fixture.profiles as Record<string, unknown>[])[0]!;
}

function firstGate(fixture: Record<string, unknown>): Record<string, unknown> {
  return (firstProfile(fixture).gates as Record<string, unknown>[])[0]!;
}
