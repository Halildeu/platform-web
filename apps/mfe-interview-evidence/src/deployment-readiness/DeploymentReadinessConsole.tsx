import { useState } from 'react';
import type { ReactNode } from 'react';
import { Badge, Button, Card, Stack, Text } from '@mfe/design-system';
import {
  SYNTHETIC_DEPLOYMENT_PROFILES,
  SYNTHETIC_EVIDENCE_GATES,
} from './syntheticReadinessRegistry';
import type { ReadinessStatus, SyntheticDeploymentProfile } from './types';

const STATUS_PRESENTATION: Record<
  ReadinessStatus,
  { label: string; variant: 'success' | 'warning' | 'error' | 'muted' }
> = {
  NOT_EVALUATED: { label: 'DEĞERLENDİRİLMEDİ', variant: 'muted' },
  PARTIAL: { label: 'KISMİ', variant: 'warning' },
  BLOCKED: { label: 'BLOKE', variant: 'error' },
  VERIFIED: { label: 'DOĞRULANDI', variant: 'success' },
};

const EVIDENCE_VERIFY_BLOCK_REASON =
  'Kanıt doğrulama adaptörü yapılandırılmadı; bu sentetik yüzey receipt üretmez.';
const PROMOTION_BLOCK_REASON =
  'NO-GO: tüm zorunlu kanıtlar doğrulanmalı ve owner acceptance kaydı bulunmalıdır.';
const EVIDENCE_ADAPTER_CONFIGURED = false;

export function DeploymentReadinessConsole() {
  const [selectedId, setSelectedId] = useState(SYNTHETIC_DEPLOYMENT_PROFILES[0]?.id ?? '');
  const selected =
    SYNTHETIC_DEPLOYMENT_PROFILES.find((profile) => profile.id === selectedId) ??
    SYNTHETIC_DEPLOYMENT_PROFILES[0];
  const verifiedGateCount = SYNTHETIC_EVIDENCE_GATES.filter(
    (gate) => gate.evidenceVerified && gate.status === 'VERIFIED',
  ).length;
  const allRequiredEvidenceVerified = SYNTHETIC_EVIDENCE_GATES.filter(
    (gate) => gate.required,
  ).every((gate) => gate.evidenceVerified && gate.status === 'VERIFIED');
  const promotionEnabled = Boolean(
    selected &&
    selected.status === 'VERIFIED' &&
    selected.ownerAccepted &&
    allRequiredEvidenceVerified,
  );

  return (
    <Card variant="outlined" padding="md">
      <Stack direction="column" gap={4} data-testid="deployment-readiness-console">
        <Stack direction="column" gap={2}>
          <Stack direction="row" gap={2} align="center" wrap>
            <Text as="h2" size="xl" weight="semibold">
              Sovereign Deployment Readiness (P5)
            </Text>
            <Badge variant="warning" data-testid="deployment-synthetic-boundary">
              SENTETİK / dağıtım yapılmaz
            </Badge>
          </Stack>
          <Text as="p" size="sm" variant="secondary">
            Managed cloud, BYO-region ve sovereign on-prem seçeneklerini aynı kanıt kapılarıyla
            karşılaştırır. Bu yüzey cluster, secret, DNS veya production state değiştirmez.
          </Text>
        </Stack>

        <div
          data-testid="deployment-profile-catalog"
          role="group"
          aria-label="Deployment profilleri"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.75rem',
          }}
        >
          {SYNTHETIC_DEPLOYMENT_PROFILES.map((profile) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              selected={profile.id === selected?.id}
              onSelect={() => setSelectedId(profile.id)}
            />
          ))}
        </div>

        {selected && (
          <Card variant="outlined" padding="sm">
            <Stack direction="column" gap={3} data-testid="deployment-profile-detail">
              <Stack direction="row" gap={2} align="center" wrap>
                <Text as="h3" size="lg" weight="semibold">
                  {selected.name}
                </Text>
                <StatusBadge status={selected.status} />
                <Badge variant="info">{selected.schemaVersion}</Badge>
              </Stack>
              <Text as="p" size="sm">
                {selected.missingEvidenceSummary}
              </Text>
              <Stack direction="column" gap={1}>
                <Text as="h4" size="sm" weight="semibold">
                  Minimum altyapı (sözleşme taslağı)
                </Text>
                <ul style={{ margin: 0, paddingInlineStart: '1.25rem' }}>
                  {selected.minimumInfrastructure.map((item) => (
                    <li key={item}>
                      <Text as="span" size="sm">
                        {item}
                      </Text>
                    </li>
                  ))}
                </ul>
              </Stack>
            </Stack>
          </Card>
        )}

        <Stack direction="column" gap={2}>
          <Stack direction="row" justify="between" align="center" gap={2} wrap>
            <Text as="h3" size="lg" weight="semibold">
              Zorunlu kanıt kapıları
            </Text>
            <Badge
              variant="error"
              role="status"
              aria-live="polite"
              data-testid="deployment-decision"
            >
              NO-GO · {verifiedGateCount}/{SYNTHETIC_EVIDENCE_GATES.length} doğrulandı
            </Badge>
          </Stack>
          <div style={{ overflowX: 'auto' }}>
            <table
              data-testid="deployment-evidence-table"
              style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}
            >
              <caption style={VISUALLY_HIDDEN_STYLE}>
                Sovereign deployment zorunlu kanıt kapıları
              </caption>
              <thead>
                <tr>
                  <TableHeader>Kapı</TableHeader>
                  <TableHeader>Standart / kanıt</TableHeader>
                  <TableHeader>Durum</TableHeader>
                  <TableHeader>Eksik kanıt</TableHeader>
                </tr>
              </thead>
              <tbody>
                {SYNTHETIC_EVIDENCE_GATES.map((gate) => (
                  <tr key={gate.id}>
                    <TableCell>{gate.name}</TableCell>
                    <TableCell>{gate.standard}</TableCell>
                    <TableCell>
                      <StatusBadge status={gate.status} />
                    </TableCell>
                    <TableCell>{gate.reason}</TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Stack>

        <Stack direction="column" gap={2}>
          <Text as="p" size="sm" variant="secondary" data-testid="deployment-verify-reason">
            {EVIDENCE_VERIFY_BLOCK_REASON}
          </Text>
          <Text as="p" size="sm" variant="secondary" data-testid="deployment-promote-reason">
            {PROMOTION_BLOCK_REASON}
          </Text>
          <Stack direction="row" gap={2} wrap>
            <Button
              variant="outline"
              disabled={!EVIDENCE_ADAPTER_CONFIGURED}
              accessReason={EVIDENCE_VERIFY_BLOCK_REASON}
              data-testid="deployment-verify-button"
            >
              Kanıtları doğrula
            </Button>
            <Button
              variant="primary"
              disabled={!promotionEnabled}
              accessReason={PROMOTION_BLOCK_REASON}
              data-testid="deployment-promote-button"
            >
              Promotion başlat
            </Button>
          </Stack>
        </Stack>
      </Stack>
    </Card>
  );
}

function ProfileCard({
  profile,
  selected,
  onSelect,
}: {
  profile: SyntheticDeploymentProfile;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      data-testid={`deployment-profile-${profile.id}`}
      style={{
        appearance: 'none',
        border: selected ? '2px solid var(--action-primary)' : '1px solid var(--border-default)',
        borderRadius: '0.75rem',
        background: 'var(--surface-default)',
        color: 'inherit',
        padding: '0.875rem',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <Stack direction="column" gap={2}>
        <Stack direction="row" justify="between" align="start" gap={2} wrap>
          <Text as="span" weight="semibold">
            {profile.name}
          </Text>
          <StatusBadge status={profile.status} />
        </Stack>
        <Text as="span" size="sm">
          {profile.description}
        </Text>
      </Stack>
    </button>
  );
}

function StatusBadge({ status }: { status: ReadinessStatus }) {
  const presentation = STATUS_PRESENTATION[status];
  return <Badge variant={presentation.variant}>{presentation.label}</Badge>;
}

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
        borderBottom: '1px solid var(--border-default)',
      }}
    >
      {children}
    </th>
  );
}

function TableCell({ children }: { children: ReactNode }) {
  return (
    <td style={{ padding: '0.625rem', borderBottom: '1px solid var(--border-subtle)' }}>
      {children}
    </td>
  );
}
