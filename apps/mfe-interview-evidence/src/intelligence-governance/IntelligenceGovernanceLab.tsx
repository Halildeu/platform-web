import { useState } from 'react';
import type { ReactNode } from 'react';
import { Badge, Button, Card, Stack, Text } from '@mfe/design-system';
import {
  INTELLIGENCE_HARD_BANS,
  SYNTHETIC_APPROVAL_CHECKPOINTS,
  SYNTHETIC_INTELLIGENCE_CAPABILITIES,
} from './syntheticIntelligenceRegistry';
import type { IntelligenceCapabilityStatus, SyntheticIntelligenceCapability } from './types';
import { CitationBackedCoachingPanel } from './CitationBackedCoachingPanel';

const STATUS_PRESENTATION: Record<
  IntelligenceCapabilityStatus,
  { label: string; variant: 'info' | 'warning' | 'error' | 'muted' }
> = {
  RESEARCH_ONLY: { label: 'YALNIZ ARAŞTIRMA', variant: 'info' },
  EVIDENCE_REQUIRED: { label: 'KANIT GEREKLİ', variant: 'warning' },
  BLOCKED: { label: 'BLOKE', variant: 'error' },
  PROPOSAL_ONLY: { label: 'YALNIZ ÖNERİ', variant: 'info' },
  DISALLOWED: { label: 'İZİN VERİLMEZ', variant: 'error' },
};

const EXPERIMENT_BLOCK_REASON =
  'Full ATS acceptance ve doğrulanmış ölçüm evidence olmadan deney planı açılamaz.';
const APPLY_BLOCK_REASON =
  'İnsan approval receipt olmadan proposal karar, ranking veya workflow mutation üretemez.';

export function IntelligenceGovernanceLab() {
  const [selectedId, setSelectedId] = useState(SYNTHETIC_INTELLIGENCE_CAPABILITIES[0]?.id ?? '');
  const selected =
    SYNTHETIC_INTELLIGENCE_CAPABILITIES.find((capability) => capability.id === selectedId) ??
    SYNTHETIC_INTELLIGENCE_CAPABILITIES[0];
  const experimentEnabled = Boolean(
    selected?.fullAtsAccepted && selected.evidenceVerified && selected.humanApproved,
  );
  const applyEnabled = Boolean(
    experimentEnabled && selected && selected.status !== 'DISALLOWED' && selected.humanApproved,
  );

  return (
    <Card variant="outlined" padding="md">
      <Stack direction="column" gap={4} data-testid="intelligence-governance-lab">
        <Stack direction="column" gap={2}>
          <Stack direction="row" gap={2} align="center" wrap>
            <Text as="h2" size="xl" weight="semibold">
              Advanced Intelligence Governance Lab (P6)
            </Text>
            <Badge variant="warning" data-testid="intelligence-synthetic-boundary">
              SENTETİK / karar veya ranking yok
            </Badge>
          </Stack>
          <Text as="p" size="sm" variant="secondary">
            İleri AI yeteneklerini üretim özelliği gibi açmaz; ölçüm, kanıt ve insan onayı
            gereksinimlerini proposal-only bir ürün yüzeyinde görünür kılar.
          </Text>
        </Stack>

        <Card variant="outlined" padding="sm">
          <Stack direction="column" gap={2} data-testid="intelligence-hard-bans">
            <Stack direction="row" justify="between" align="center" gap={2} wrap>
              <Text as="h3" size="lg" weight="semibold">
                Sert yasaklar
              </Text>
              <Badge variant="error">6 politika kilidi aktif</Badge>
            </Stack>
            <ul style={{ margin: 0, paddingInlineStart: '1.25rem' }}>
              {INTELLIGENCE_HARD_BANS.map((ban) => (
                <li key={ban.id}>
                  <Text as="span" size="sm" weight="semibold">
                    {ban.label}:
                  </Text>{' '}
                  <Text as="span" size="sm" variant="secondary">
                    {ban.reason}
                  </Text>
                </li>
              ))}
            </ul>
          </Stack>
        </Card>

        <div
          data-testid="intelligence-capability-catalog"
          role="group"
          aria-label="İleri intelligence capability alanları"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.75rem',
          }}
        >
          {SYNTHETIC_INTELLIGENCE_CAPABILITIES.map((capability) => (
            <CapabilityCard
              key={capability.id}
              capability={capability}
              selected={capability.id === selected?.id}
              onSelect={() => setSelectedId(capability.id)}
            />
          ))}
        </div>

        {selected && <CapabilityDetail capability={selected} />}

        <Card variant="outlined" padding="sm">
          <Stack direction="column" gap={2} data-testid="p6-approval-checkpoints">
            <Stack direction="row" justify="between" align="center" gap={2} wrap>
              <Text as="h3" size="lg" weight="semibold">
                Proposal approval zinciri
              </Text>
              <Badge variant="error">Toplu onay yok</Badge>
            </Stack>
            <ol style={{ margin: 0, paddingInlineStart: '1.25rem' }}>
              {SYNTHETIC_APPROVAL_CHECKPOINTS.map((checkpoint) => (
                <li key={checkpoint.id} style={{ marginBlockEnd: '0.5rem' }}>
                  <Stack direction="row" gap={2} align="start" wrap>
                    <Badge variant={checkpoint.status === 'BLOCKED' ? 'error' : 'muted'}>
                      {checkpoint.status === 'BLOCKED' ? 'BLOKE' : 'BEKLİYOR'}
                    </Badge>
                    <Text as="span" size="sm">
                      <strong>{checkpoint.label}:</strong> {checkpoint.reason}
                    </Text>
                  </Stack>
                </li>
              ))}
            </ol>
          </Stack>
        </Card>

        <Stack direction="column" gap={2}>
          <Stack direction="row" justify="between" align="center" gap={2} wrap>
            <Text as="h3" size="lg" weight="semibold">
              Measurement contract
            </Text>
            <Badge variant="error" role="status" aria-live="polite" data-testid="p6-decision">
              PROPOSAL ONLY · 0/{SYNTHETIC_INTELLIGENCE_CAPABILITIES.length} live
            </Badge>
          </Stack>
          {selected && (
            <div style={{ overflowX: 'auto' }}>
              <table
                data-testid="intelligence-measurement-table"
                style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}
              >
                <caption style={VISUALLY_HIDDEN_STYLE}>
                  {selected.name} sentetik measurement contract
                </caption>
                <thead>
                  <tr>
                    <TableHeader>Metric</TableHeader>
                    <TableHeader>Cohort</TableHeader>
                    <TableHeader>Ground truth</TableHeader>
                    <TableHeader>Guardrail</TableHeader>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <TableCell>{selected.measurement.metric}</TableCell>
                    <TableCell>{selected.measurement.cohort}</TableCell>
                    <TableCell>{selected.measurement.groundTruth}</TableCell>
                    <TableCell>{selected.measurement.guardrail}</TableCell>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Stack>

        <Stack direction="column" gap={2}>
          <Text as="p" size="sm" variant="secondary" data-testid="p6-experiment-reason">
            {EXPERIMENT_BLOCK_REASON}
          </Text>
          <Text as="p" size="sm" variant="secondary" data-testid="p6-apply-reason">
            {APPLY_BLOCK_REASON}
          </Text>
          <Stack direction="row" gap={2} wrap>
            <Button
              variant="outline"
              disabled={!experimentEnabled}
              accessReason={EXPERIMENT_BLOCK_REASON}
              data-testid="p6-experiment-button"
            >
              Deney planı oluştur
            </Button>
            <Button
              variant="primary"
              disabled={!applyEnabled}
              accessReason={APPLY_BLOCK_REASON}
              data-testid="p6-apply-button"
            >
              Öneriyi uygula
            </Button>
          </Stack>
        </Stack>
      </Stack>
    </Card>
  );
}

function CapabilityCard({
  capability,
  selected,
  onSelect,
}: {
  capability: SyntheticIntelligenceCapability;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      data-testid={`intelligence-capability-${capability.id}`}
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
        <Text as="span" weight="semibold">
          {capability.name}
        </Text>
        <StatusBadge status={capability.status} />
        <Text as="span" size="sm">
          {capability.description}
        </Text>
      </Stack>
    </button>
  );
}

function CapabilityDetail({ capability }: { capability: SyntheticIntelligenceCapability }) {
  return (
    <Card variant="outlined" padding="sm">
      <Stack direction="column" gap={3} data-testid="intelligence-capability-detail">
        <Stack direction="row" gap={2} align="center" wrap>
          <Text as="h3" size="lg" weight="semibold">
            {capability.name}
          </Text>
          <StatusBadge status={capability.status} />
          <Badge variant="info">{capability.schemaVersion}</Badge>
        </Stack>
        <Stack direction="row" gap={2} wrap aria-label="Capability kabul kapıları">
          <Badge variant="error">FULL ATS KABUL YOK</Badge>
          <Badge variant="error">KANIT DOĞRULANMADI</Badge>
          <Badge variant="error">İNSAN ONAYI YOK</Badge>
        </Stack>
        <Text as="p" size="sm">
          Standard: {capability.standard}
        </Text>
        <Stack direction="column" gap={1}>
          <Text as="p" size="sm">
            <strong>İzinli kullanım:</strong> {capability.allowedUse}
          </Text>
          <Text as="p" size="sm">
            <strong>Yasak kullanım:</strong> {capability.prohibitedUse}
          </Text>
        </Stack>
        {capability.id === 'INTERVIEWER_COACHING' && <CitationBackedCoachingPanel />}
      </Stack>
    </Card>
  );
}

function StatusBadge({ status }: { status: IntelligenceCapabilityStatus }) {
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
