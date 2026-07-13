import { useMemo, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { Badge as DesignBadge, Card, Stack, Text } from '@mfe/design-system';
import {
  ATS_DEPLOYMENT_PROFILE_RAW_SAMPLE_SHA256,
  ATS_DEPLOYMENT_PROFILE_SOURCE_COMMIT,
  CANONICAL_DEPLOYMENT_TOPOLOGIES,
  CANONICAL_SYNTHETIC_DEPLOYMENT_PROFILE_REGISTRY,
} from './canonicalDeploymentProfileRegistry';
import type {
  DeploymentProfileV1,
  DeploymentReadinessGateV1,
  DeploymentReadinessState,
  DeploymentTopology,
} from './canonicalDeploymentProfileRegistry';
import {
  deriveProfileReadiness,
  deriveReleaseBlockers,
  evidenceClassForGate,
  validateDeploymentProfileRegistryV1,
} from './deploymentProfileAdapter';

const STATE_PRESENTATION: Record<
  DeploymentReadinessState,
  { label: string; variant: 'success' | 'warning' | 'info' | 'muted' }
> = {
  NOT_CONFIGURED: { label: 'YAPILANDIRILMADI', variant: 'muted' },
  CONFIGURED: { label: 'YAPILANDIRILDI · RUNTIME YOK', variant: 'info' },
  VERIFIED: { label: 'RECEIPT DOĞRULANDI · DRILL/KABUL YOK', variant: 'warning' },
  DRILL_PASSED: { label: 'ÖLÇÜMLÜ DRILL · OWNER KABULÜ YOK', variant: 'warning' },
  OWNER_ACCEPTED: { label: 'OWNER KABULÜ', variant: 'success' },
};

const TOPOLOGY_LABELS: Record<DeploymentTopology, string> = {
  MANAGED: 'Managed Cloud',
  DEDICATED: 'Dedicated Tenant',
  BYO_REGION: 'BYO Region',
  SOVEREIGN_ON_PREM: 'Sovereign On-Prem',
};

const GATE_PRESENTATION: Record<
  DeploymentReadinessGateV1['kind'],
  { name: string; authority: string }
> = {
  SUPPLY_CHAIN: {
    name: 'Supply chain',
    authority: 'release-evidence/v1 opaque manifest ref',
  },
  PROFILE_RENDER: {
    name: 'Profile render',
    authority: 'Profile/overlay render + policy verifier receipt',
  },
  IDENTITY: {
    name: 'Identity',
    authority: 'OIDC/SAML/SCIM metadata and access boundary',
  },
  EGRESS: {
    name: 'Egress',
    authority: 'Allowlist/deny-default/air-gap measured drill',
  },
  SECRET_ROTATION: {
    name: 'Secret rotation',
    authority: 'KMS/BYOK/offline-key rotation drill',
  },
  BACKUP_RESTORE: {
    name: 'Backup / restore',
    authority: 'Encrypted restore + observed RPO/RTO',
  },
  UPGRADE_ROLLBACK: {
    name: 'Upgrade / rollback',
    authority: 'Immutable upgrade + measured rollback',
  },
  AUDIT_EXPORT: {
    name: 'Audit export',
    authority: 'Integrity-bound audit export drill',
  },
};

const BLOCKER_LABELS: Record<string, string> = {
  G0_RUNTIME_NOT_ACCEPTED: 'G0 runtime kabulü yok',
  SYNTHETIC_PROFILE: 'Profil sentetik',
  PROFILE_NOT_OWNER_ACCEPTED: 'Profil owner kabulü yok',
  ALL_EIGHT_GATES_NOT_OWNER_ACCEPTED: 'Sekiz gate ayrı owner kabulüne ulaşmadı',
  SUPPLY_CHAIN_MANIFEST_NOT_VERIFIED: 'Supply-chain manifest doğrulanmadı',
  RPO_RTO_TARGETS_NOT_DEFINED: 'RPO/RTO hedefleri sözleşmede tanımlanmadı',
  PAID_PARTNER_THRESHOLD_NOT_MET: 'Ücretli partner eşiği karşılanmadı',
  PARTNER_EVIDENCE_NOT_VERIFIED: 'Partner kanıtı doğrulanmadı',
  PROFILE_OWNER_ACCEPTANCE_MISSING: 'Profil owner acceptance receipt eksik',
  ACTIVATION_RECEIPT_MISSING: 'Activation receipt eksik',
  PRODUCTION_ELIGIBILITY_CLOSED: 'Production eligibility kapalı',
  DEPLOYMENT_RELEASE_CLOSED: 'Deployment release kararı kapalı',
  OPERATIONAL_RESPONSIBILITY_NOT_PROVIDED:
    'Operasyonel sorumluluk ve destek sınırı public sözleşmede sağlanmadı',
};

const VIEWER_SCOPE =
  'Bu v1 yüzeyi yalnız public PRE-G0 sözleşmesini görüntüler; dış verifier çalıştırmaz, receipt üretmez veya deployment release başlatmaz.';

/**
 * The shared Badge semantic palettes are intentionally subtle and currently
 * miss WCAG AA contrast in the live shell theme. P5 conveys state through
 * explicit text, so this surface uses a neutral, token-backed high-contrast
 * treatment while preserving the design-system primitive and variant metadata.
 */
function Badge({ style, ...props }: ComponentProps<typeof DesignBadge>) {
  return (
    <DesignBadge
      {...props}
      style={{
        backgroundColor: 'var(--surface-default)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-default)',
        ...style,
      }}
    />
  );
}

export interface DeploymentReadinessConsoleProps {
  /** Future API boundary. Unknown/malformed payloads fail closed without fixture fallback. */
  readonly registryPayload?: unknown;
}

export function DeploymentReadinessConsole({
  registryPayload = CANONICAL_SYNTHETIC_DEPLOYMENT_PROFILE_REGISTRY,
}: DeploymentReadinessConsoleProps) {
  const validation = useMemo(
    () => validateDeploymentProfileRegistryV1(registryPayload),
    [registryPayload],
  );
  const [selectedTopology, setSelectedTopology] = useState<DeploymentTopology>('MANAGED');

  if (!validation.ok) {
    return <FailClosedRegistryCard issues={validation.issues} />;
  }

  const registry = validation.registry;
  if (registry.activation_gate !== 'PRE_G0_CONTRACT_ONLY') {
    return <FailClosedRegistryCard issues={['P5_VIEWER_PRE_G0_ONLY']} />;
  }
  const profiles = CANONICAL_DEPLOYMENT_TOPOLOGIES.map((topology) =>
    registry.profiles.find((profile) => profile.topology === topology),
  ).filter((profile): profile is DeploymentProfileV1 => Boolean(profile));
  const selected = profiles.find((profile) => profile.topology === selectedTopology) ?? profiles[0];

  if (!selected) {
    return <FailClosedRegistryCard issues={['PROFILE_SET_EMPTY_AFTER_VALIDATION']} />;
  }

  const acceptedGateCount = selected.gates.filter(
    (gate) => gate.status === 'OWNER_ACCEPTED' && gate.owner_accepted,
  ).length;
  const weakestState = deriveProfileReadiness(selected);
  const weakestGates = selected.gates
    .filter((gate) => gate.status === weakestState)
    .map((gate) => GATE_PRESENTATION[gate.kind].name);
  const releaseBlockers = deriveReleaseBlockers(registry, selected);

  return (
    <Card variant="outlined" padding="md">
      <Stack direction="column" gap={5} data-testid="deployment-readiness-console">
        <ConsoleHeader activationGate={registry.activation_gate} />

        <div
          data-testid="deployment-profile-catalog"
          role="group"
          aria-label="Deployment profilleri"
          style={PROFILE_GRID_STYLE}
        >
          {profiles.map((profile) => (
            <ProfileCard
              key={profile.profile_id}
              profile={profile}
              selected={profile.topology === selected.topology}
              onSelect={() => setSelectedTopology(profile.topology)}
            />
          ))}
        </div>

        <div
          id="deployment-profile-evidence-panel"
          role="region"
          aria-label={TOPOLOGY_LABELS[selected.topology] + ' deployment readiness kanıtı'}
        >
          <Stack direction="column" gap={5}>
            <ProfileEvidenceSummary
              profile={selected}
              acceptedGateCount={acceptedGateCount}
              weakestGates={weakestGates}
            />

            <GateEvidenceTable profile={selected} />

            <ResponsibilityBoundary profile={selected} />

            <ActivationBoundary
              releaseAllowed={selected.release_allowed}
              blockers={releaseBlockers}
            />
          </Stack>
        </div>

        <DisclosureBoundary />
      </Stack>
    </Card>
  );
}

function ConsoleHeader({ activationGate }: { activationGate: string }) {
  return (
    <Stack direction="column" gap={2}>
      <Stack direction="row" gap={2} align="center" wrap>
        <Text as="h2" size="xl" weight="semibold">
          Sovereign Deployment Readiness Console v1 (P5)
        </Text>
        <Badge variant="warning" data-testid="deployment-synthetic-boundary">
          SENTETİK · PRE-G0 · VIEW-ONLY
        </Badge>
        <Badge variant="info">deployment-profile/v1</Badge>
      </Stack>
      <Text as="p" size="sm" variant="secondary">
        Dört deployment profilini sekiz ayrı, profile-bağlı kanıt kapısıyla gösterir. Bu yüzey
        cluster, secret, DNS, connector, AI capability veya production state değiştirmez.
      </Text>
      <Text as="p" size="sm" variant="secondary" data-testid="deployment-viewer-scope">
        {VIEWER_SCOPE} G0 runtime registry, yayımlanmış operasyonel sorumluluk sözleşmesi ve
        authenticated evidence API yüzeyi oluşmadan bu ekrana kabul edilmez.
      </Text>
      <Text as="p" size="xs" variant="secondary" data-testid="deployment-source-lineage">
        Public ATS source pin: {shortCommit(ATS_DEPLOYMENT_PROFILE_SOURCE_COMMIT)} · raw fixture
        SHA-256: {shortDigest(ATS_DEPLOYMENT_PROFILE_RAW_SAMPLE_SHA256)} · activation gate:{' '}
        {activationGate}. Bu pin contract lineage’ıdır; runtime evidence değildir.
      </Text>
    </Stack>
  );
}

function ProfileCard({
  profile,
  selected,
  onSelect,
}: {
  profile: DeploymentProfileV1;
  selected: boolean;
  onSelect: () => void;
}) {
  const accepted = profile.gates.filter(
    (gate) => gate.status === 'OWNER_ACCEPTED' && gate.owner_accepted,
  ).length;

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-controls="deployment-profile-evidence-panel"
      onClick={onSelect}
      data-testid={'deployment-profile-' + profile.topology}
      style={{
        appearance: 'none',
        border: selected ? '2px solid var(--action-primary)' : '1px solid var(--border-default)',
        borderRadius: '0.75rem',
        background: 'var(--surface-default)',
        color: 'inherit',
        padding: '0.875rem',
        textAlign: 'left',
        cursor: 'pointer',
        minWidth: 0,
      }}
    >
      <Stack direction="column" gap={2}>
        <Stack direction="row" justify="between" align="start" gap={2} wrap>
          <Text as="span" weight="semibold">
            {TOPOLOGY_LABELS[profile.topology]}
          </Text>
          <StateBadge state={profile.readiness_state} compact />
        </Stack>
        <Text as="span" size="xs" variant="secondary">
          {profile.controls.control_plane_owner} control plane · {profile.controls.data_plane_owner}{' '}
          data plane
        </Text>
        <Stack direction="row" gap={1} wrap>
          <Badge variant="muted">Owner kabulü {accepted}/8</Badge>
          <Badge variant="muted">
            Partner {profile.paid_partner_count}/{profile.minimum_paid_partners}
          </Badge>
        </Stack>
      </Stack>
    </button>
  );
}

function ProfileEvidenceSummary({
  profile,
  acceptedGateCount,
  weakestGates,
}: {
  profile: DeploymentProfileV1;
  acceptedGateCount: number;
  weakestGates: readonly string[];
}) {
  const recovery = profile.recovery_objectives;

  return (
    <Card variant="outlined" padding="sm">
      <Stack direction="column" gap={3} data-testid="deployment-profile-detail">
        <Stack direction="row" gap={2} align="center" wrap>
          <Text as="h3" size="lg" weight="semibold">
            {TOPOLOGY_LABELS[profile.topology]}
          </Text>
          <StateBadge state={profile.readiness_state} />
          <Badge variant={profile.release_allowed ? 'success' : 'error'}>
            Deployment release: {profile.release_allowed ? 'ALLOWED' : 'CLOSED'}
          </Badge>
        </Stack>

        <Text as="p" size="sm" data-testid="deployment-weakest-gates">
          Profil durumu sekiz gate’in en düşük durumudur. En zayıf gate(ler):{' '}
          <strong>{weakestGates.join(', ')}</strong>. Owner kabulü {acceptedGateCount}/8.
        </Text>

        <div style={SUMMARY_GRID_STYLE}>
          <SummaryItem label="Control plane" value={profile.controls.control_plane_owner} />
          <SummaryItem label="Data plane" value={profile.controls.data_plane_owner} />
          <SummaryItem label="Isolation" value={profile.controls.isolation} />
          <SummaryItem label="Residency" value={profile.controls.residency} />
          <SummaryItem label="Egress" value={profile.controls.egress} />
          <SummaryItem label="Identity" value={profile.controls.identity} />
          <SummaryItem label="Key boundary" value={profile.controls.secrets} />
          <SummaryItem label="Storage" value={profile.controls.storage} />
          <SummaryItem label="AI provider" value={profile.controls.ai_provider} />
          <SummaryItem label="Support model" value={profile.controls.support} />
        </div>

        <div style={SUMMARY_GRID_STYLE} data-testid="deployment-recovery-summary">
          <SummaryItem
            label="RPO target"
            value={
              recovery.targets_defined && recovery.target_rpo_seconds !== undefined
                ? recovery.target_rpo_seconds + ' sn'
                : 'Tanımlı değil'
            }
          />
          <SummaryItem
            label="RTO target"
            value={
              recovery.targets_defined && recovery.target_rto_seconds !== undefined
                ? recovery.target_rto_seconds + ' sn'
                : 'Tanımlı değil'
            }
          />
          <SummaryItem label="Observed RPO/RTO" value="Ölçülmedi" />
          <SummaryItem label="Rollback window" value={recovery.rollback_window_hours + ' saat'} />
          <SummaryItem
            label="Supply-chain manifest"
            value={
              profile.release_evidence_manifest_verified ? 'Receipt doğrulandı' : 'Doğrulanmadı'
            }
          />
          <SummaryItem
            label="Partner evidence"
            value={
              profile.partner_evidence_verified
                ? 'Doğrulandı'
                : profile.paid_partner_count +
                  '/' +
                  profile.minimum_paid_partners +
                  ' · doğrulanmadı'
            }
          />
        </div>
      </Stack>
    </Card>
  );
}

function GateEvidenceTable({ profile }: { profile: DeploymentProfileV1 }) {
  return (
    <Stack direction="column" gap={2}>
      <Stack direction="row" justify="between" align="center" gap={2} wrap>
        <Text as="h3" size="lg" weight="semibold">
          Profile-bağlı sekiz kanıt kapısı
        </Text>
        <Badge variant="muted">Tek yüzde / ortalama yok</Badge>
      </Stack>
      <div
        role="region"
        aria-label={TOPOLOGY_LABELS[profile.topology] + ' kanıt kapıları'}
        tabIndex={0}
        style={{ overflowX: 'auto' }}
      >
        <table
          data-testid="deployment-evidence-table"
          style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1050 }}
        >
          <caption style={VISUALLY_HIDDEN_STYLE}>
            {TOPOLOGY_LABELS[profile.topology]} için sekiz deployment evidence gate’i
          </caption>
          <thead>
            <tr>
              <TableHeader>Kapı / authority</TableHeader>
              <TableHeader>Exact durum</TableHeader>
              <TableHeader>Kanıt sınıfı</TableHeader>
              <TableHeader>Drill</TableHeader>
              <TableHeader>Receipt / zaman</TableHeader>
              <TableHeader>Owner</TableHeader>
            </tr>
          </thead>
          <tbody>
            {profile.gates.map((gate) => (
              <GateRow key={gate.kind} gate={gate} />
            ))}
          </tbody>
        </table>
      </div>
      <Text as="p" size="xs" variant="secondary" data-testid="deployment-table-scroll-hint">
        Dar ekranda diğer kanıt alanlarını görmek için tabloyu yatay kaydırın.
      </Text>
      <Text as="p" size="xs" variant="secondary" data-testid="deployment-freshness-boundary">
        Freshness policy: POLICY_NOT_DEFINED. UI, verified/measured timestamp olmadan “current” veya
        “fresh” sonucu üretmez.
      </Text>
    </Stack>
  );
}

function GateRow({ gate }: { gate: DeploymentReadinessGateV1 }) {
  const evidence = gate.evidence;
  const presentation = GATE_PRESENTATION[gate.kind];

  return (
    <tr data-testid={'deployment-gate-' + gate.kind}>
      <TableRowHeader>
        <Stack direction="column" gap={1}>
          <Text as="span" size="sm" weight="semibold">
            {presentation.name}
          </Text>
          <Text as="span" size="xs" variant="secondary">
            {presentation.authority}
          </Text>
        </Stack>
      </TableRowHeader>
      <TableCell>
        <StateBadge state={gate.status} compact />
      </TableCell>
      <TableCell>{evidenceClassForGate(gate)}</TableCell>
      <TableCell>
        {gate.drill_required
          ? gate.drill_passed
            ? 'Zorunlu · ölçüldü'
            : 'Zorunlu · çalıştırılmadı'
          : 'Zorunlu değil'}
      </TableCell>
      <TableCell>
        {evidence ? (
          <Stack direction="column" gap={1}>
            <Text as="span" size="xs">
              {evidence.evidence_ref}
            </Text>
            <Text as="span" size="xs" variant="secondary">
              verified: {evidence.verified_at}
            </Text>
            <Text as="span" size="xs" variant="secondary">
              measured: {evidence.measured_at ?? 'Ölçülmedi'}
            </Text>
          </Stack>
        ) : (
          'Receipt yok'
        )}
      </TableCell>
      <TableCell>
        {gate.owner_accepted ? (evidence?.owner_acceptance_ref ?? 'Receipt eksik') : 'Kabul yok'}
      </TableCell>
    </tr>
  );
}

function ResponsibilityBoundary({ profile }: { profile: DeploymentProfileV1 }) {
  return (
    <Card variant="outlined" padding="sm">
      <Stack direction="column" gap={2} data-testid="deployment-responsibility-boundary">
        <Stack direction="row" gap={2} align="center" wrap>
          <Text as="h3" size="lg" weight="semibold">
            Operasyonel sorumluluk sınırı
          </Text>
          <Badge variant="warning">OPERATIONAL_RESPONSIBILITY_NOT_PROVIDED</Badge>
          <Badge variant="muted">OWNER PUBLICATION DECISION REQUIRED</Badge>
        </Stack>
        <Text as="p" size="sm">
          Public deployment-profile/v1 yalnız control plane, data plane ve support modelini taşır.
          Operasyonel sorumluluk atamaları ve destek sözleşmesi public payload’da sağlanmadığı için
          UI topolojiden aktör veya destek seviyesi tahmin etmez ve activation başlatmaz.
        </Text>
        <div style={SUMMARY_GRID_STYLE}>
          <SummaryItem label="Control plane owner" value={profile.controls.control_plane_owner} />
          <SummaryItem label="Data plane owner" value={profile.controls.data_plane_owner} />
          <SummaryItem label="Contract support model" value={profile.controls.support} />
          <SummaryItem label="Operational responsibility" value="Sağlanmadı · inference yasak" />
        </div>
      </Stack>
    </Card>
  );
}

function ActivationBoundary({
  releaseAllowed,
  blockers,
}: {
  releaseAllowed: boolean;
  blockers: readonly string[];
}) {
  const promotionReason =
    'NO-GO: ' + blockers.map((blocker) => BLOCKER_LABELS[blocker] ?? blocker).join(' · ');

  return (
    <Card variant="outlined" padding="sm">
      <Stack direction="column" gap={3} data-testid="deployment-activation-boundary">
        <Stack direction="row" gap={2} align="center" wrap>
          <Text as="h3" size="lg" weight="semibold">
            Salt okunur aktivasyon durumu
          </Text>
          <Badge variant={releaseAllowed ? 'success' : 'error'}>
            Deployment release: {releaseAllowed ? 'ALLOWED' : 'CLOSED'}
          </Badge>
          <Badge variant="muted">Connector: P4 ayrı gate</Badge>
          <Badge variant="muted">AI capability: P6 ayrı gate</Badge>
        </Stack>

        <ul
          data-testid="deployment-release-blockers"
          style={{ margin: 0, paddingInlineStart: '1.25rem' }}
        >
          {blockers.map((blocker) => (
            <li key={blocker}>
              <Text as="span" size="sm">
                {BLOCKER_LABELS[blocker] ?? blocker}
              </Text>
            </li>
          ))}
        </ul>

        <Text as="p" size="sm" variant="secondary" data-testid="deployment-verify-reason">
          Verifier operation: NOT AVAILABLE IN VIEWER. {VIEWER_SCOPE}
        </Text>
        <Text as="p" size="sm" variant="secondary" data-testid="deployment-promote-reason">
          {promotionReason}
        </Text>
        <Stack direction="row" gap={2} wrap data-testid="deployment-action-status">
          <Badge variant="muted">Verifier action: UNAVAILABLE</Badge>
          <Badge variant="muted">Release action: UNAVAILABLE</Badge>
        </Stack>
      </Stack>
    </Card>
  );
}

function DisclosureBoundary() {
  return (
    <Card variant="outlined" padding="sm">
      <Stack direction="column" gap={1} data-testid="deployment-disclosure-boundary">
        <Text as="h3" size="sm" weight="semibold">
          Kanıt ve standart sınırı
        </Text>
        <Text as="p" size="xs" variant="secondary">
          Readiness; compliance, conformity, certification veya rakip parity sonucu değildir.
          Partner sayısı teknik güvenlik kanıtı değildir. Target RPO/RTO ölçülmüş sonuç değildir;
          tek drill SLA veya sürekli güvenilirlik kanıtlamaz. P4 connector ve P6 AI/human-action
          kapıları bu P5 deployment kararından ayrıdır.
        </Text>
      </Stack>
    </Card>
  );
}

function FailClosedRegistryCard({ issues }: { issues: readonly string[] }) {
  const viewerScopeClosed = issues.includes('P5_VIEWER_PRE_G0_ONLY');
  return (
    <Card variant="outlined" padding="md">
      <Stack direction="column" gap={3} data-testid="deployment-readiness-fail-closed">
        <Stack direction="row" gap={2} align="center" wrap>
          <Text as="h2" size="xl" weight="semibold">
            Sovereign Deployment Readiness Console v1 (P5)
          </Text>
          <Badge variant="error">
            {viewerScopeClosed ? 'VIEWER SCOPE CLOSED' : 'TRACE FAIL-CLOSED'}
          </Badge>
        </Stack>
        {viewerScopeClosed ? (
          <Text as="p" size="sm">
            Registry public deployment-profile/v1 sözleşmesini karşılıyor; ancak bu v1 ürün yüzeyi
            yalnız PRE-G0 contract viewer’dır. G0 runtime evidence burada gösterilmez ve sentetik
            fixture’a fallback yapılmaz.
          </Text>
        ) : (
          <Text as="p" size="sm">
            Registry deployment-profile/v1 sözleşmesini karşılamıyor. Sentetik fixture’a sessiz
            fallback yapılmadı; profil, readiness veya release sonucu gösterilmiyor.
          </Text>
        )}
        <ul style={{ margin: 0, paddingInlineStart: '1.25rem' }}>
          {issues.slice(0, 12).map((issue) => (
            <li key={issue}>
              <Text as="span" size="xs">
                {issue}
              </Text>
            </li>
          ))}
        </ul>
        <Stack direction="row" gap={2} wrap>
          <Badge variant="muted">Verifier action: UNAVAILABLE</Badge>
          <Badge variant="muted">Release action: UNAVAILABLE</Badge>
        </Stack>
      </Stack>
    </Card>
  );
}

function StateBadge({
  state,
  compact = false,
}: {
  state: DeploymentReadinessState;
  compact?: boolean;
}) {
  const presentation = STATE_PRESENTATION[state];
  return <Badge variant={presentation.variant}>{compact ? state : presentation.label}</Badge>;
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <Text as="p" size="xs" variant="secondary">
        {label}
      </Text>
      <Text as="p" size="sm" weight="semibold">
        {value}
      </Text>
    </div>
  );
}

function shortCommit(commit: string): string {
  return commit.slice(0, 12);
}

function shortDigest(digest: string): string {
  return digest.slice(0, 12) + '…' + digest.slice(-8);
}

const PROFILE_GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
  gap: '0.75rem',
} as const;

const SUMMARY_GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
  gap: '0.75rem',
} as const;

const VISUALLY_HIDDEN_STYLE = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

function TableHeader({ children }: { children: ReactNode }) {
  return (
    <th
      scope="col"
      style={{
        padding: '0.625rem',
        textAlign: 'left',
        verticalAlign: 'top',
        borderBottom: '1px solid var(--border-default)',
      }}
    >
      {children}
    </th>
  );
}

function TableCell({ children }: { children: ReactNode }) {
  return (
    <td
      style={{
        padding: '0.625rem',
        verticalAlign: 'top',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {children}
    </td>
  );
}

function TableRowHeader({ children }: { children: ReactNode }) {
  return (
    <th
      scope="row"
      style={{
        padding: '0.625rem',
        textAlign: 'left',
        verticalAlign: 'top',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {children}
    </th>
  );
}
