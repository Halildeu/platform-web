import { useMemo, useState } from 'react';
import { Badge, Card, Input, Stack, Text } from '@mfe/design-system';
import {
  INTEGRATION_PLATFORM_PUBLIC_REGISTRY,
  INTEGRATION_PLATFORM_SAMPLE_SHA256,
  INTEGRATION_PLATFORM_SOURCE_COMMIT,
  parseIntegrationPlatformRegistry,
} from './integrationPlatformContract';
import type {
  IntegrationConnectorV1,
  IntegrationPlatformRegistryV1,
  IntegrationSyntheticEnvelopeV1,
} from './integrationPlatformContract';

const DOMAIN_LABELS: Readonly<Record<string, string>> = {
  ATS: 'ATS',
  HRIS: 'HRIS',
  CALENDAR_EMAIL: 'Takvim / e-posta',
  SSO_SCIM: 'SSO / SCIM',
  PORTABILITY: 'Açık taşınabilirlik',
  DISTRIBUTION: 'Opsiyonel dağıtım',
};

const STATUS_PRESENTATION: Readonly<
  Record<string, { label: string; variant: 'warning' | 'error' | 'muted' }>
> = {
  UNVERIFIED: { label: 'DOĞRULANMADI', variant: 'warning' },
  BLOCKED: { label: 'BLOKE', variant: 'error' },
  NOT_CONFIGURED: { label: 'YAPILANDIRILMADI', variant: 'muted' },
};

const wrapRef = {
  maxWidth: '100%',
  minWidth: 0,
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
} as const;

export interface IntegrationWorkspaceProps {
  readonly registryInput?: unknown;
}

export function IntegrationWorkspace({
  registryInput = INTEGRATION_PLATFORM_PUBLIC_REGISTRY,
}: IntegrationWorkspaceProps) {
  const parsed = useMemo(() => parseIntegrationPlatformRegistry(registryInput), [registryInput]);

  if (!parsed.ok) {
    return <ContractFailure errors={parsed.errors} />;
  }

  return <CanonicalWorkspace registry={parsed.value} />;
}

function CanonicalWorkspace({ registry }: { registry: IntegrationPlatformRegistryV1 }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(registry.connectors[0]?.connectorId ?? '');
  const normalizedQuery = query.trim().toLocaleLowerCase('tr-TR');
  const visibleConnectors = useMemo(
    () =>
      registry.connectors.filter((connector) => {
        if (!normalizedQuery) return true;
        return [
          connector.connectorId,
          connector.providerRef,
          connector.domain,
          DOMAIN_LABELS[connector.domain] ?? connector.domain,
          connector.verificationStatus,
          ...connector.operations,
        ].some((value) => value.toLocaleLowerCase('tr-TR').includes(normalizedQuery));
      }),
    [normalizedQuery, registry.connectors],
  );
  const selected =
    visibleConnectors.find((connector) => connector.connectorId === selectedId) ??
    visibleConnectors[0];

  return (
    <Card variant="outlined" padding="md">
      <Stack direction="column" gap={4} data-testid="integration-workspace" style={wrapRef}>
        <Stack direction="column" gap={2}>
          <Stack direction="row" gap={2} align="center" wrap>
            <Text as="h2" size="xl" weight="semibold">
              Entegrasyon Sözleşme Alanı (P4)
            </Text>
            <Badge variant="warning">PRE-G0 · salt okunur</Badge>
            <Badge variant="success" data-testid="integration-contract-status">
              CONTRACT VALID
            </Badge>
          </Stack>
          <Text as="p" size="sm" variant="secondary">
            Canonical altı domain ve üç sentetik zarf görünür; bu yüzey bağlantı kurmaz, sağlayıcı
            uyumluluğu kanıtlamaz, kimlik bilgisi toplamaz ve harici sisteme yazmaz.
          </Text>
          <div
            data-testid="integration-source-pin"
            aria-label="Canonical kaynak sabitlemesi"
            style={{ ...wrapRef, fontSize: '0.75rem' }}
          >
            <Text as="p" size="xs" variant="secondary">
              Kaynak commit · <code style={wrapRef}>{INTEGRATION_PLATFORM_SOURCE_COMMIT}</code>
            </Text>
            <Text as="p" size="xs" variant="secondary">
              Raw sample SHA-256 · <code style={wrapRef}>{INTEGRATION_PLATFORM_SAMPLE_SHA256}</code>
            </Text>
          </div>
          <Stack direction="row" gap={2} wrap aria-label="Sözleşme sınırları">
            <Badge variant="info">{registry.schemaVersion}</Badge>
            <Badge variant="warning">{registry.activationGate}</Badge>
            <Badge variant="muted">connector-capability/v1 · P1 BASELINE · AYRI</Badge>
          </Stack>
          <Input
            id="integration-catalog-search"
            label="Bağlayıcı ara"
            placeholder="Domain, operasyon veya sağlayıcı ref…"
            value={query}
            onValueChange={setQuery}
            data-testid="integration-search"
          />
        </Stack>

        <div
          role="group"
          aria-label="Canonical bağlayıcı kataloğu"
          data-testid="connector-catalog"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '0.75rem',
            minWidth: 0,
          }}
        >
          {visibleConnectors.map((connector) => (
            <ConnectorCard
              key={connector.connectorId}
              connector={connector}
              selected={connector.connectorId === selected?.connectorId}
              onSelect={() => setSelectedId(connector.connectorId)}
            />
          ))}
        </div>

        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
        >
          {visibleConnectors.length} canonical bağlayıcı gösteriliyor.
        </div>

        {visibleConnectors.length === 0 && (
          <Text as="p" size="sm" data-testid="connector-empty-state">
            Aramayla eşleşen canonical bağlayıcı yok.
          </Text>
        )}

        {selected && <ConnectorDetail connector={selected} />}

        <SyntheticEnvelopeCatalog envelopes={registry.syntheticEnvelopes} />

        <Card variant="outlined" padding="sm">
          <Stack direction="column" gap={2}>
            <Text as="h3" size="lg" weight="semibold">
              Kapanmayan kanıt sınırı
            </Text>
            <Text as="p" size="sm" variant="secondary">
              Bu public PRE-G0 kontratı gerçek sandbox, credential, partner kabulü, hukuka uygun
              veri aktarımı, G0/P3, ölçülmüş runtime veya üretim aktivasyonu kanıtı değildir. Her
              bağlayıcı bu kanıtlar gelene kadar kapalı kalır.
            </Text>
          </Stack>
        </Card>
      </Stack>
    </Card>
  );
}

function ConnectorCard({
  connector,
  selected,
  onSelect,
}: {
  connector: IntegrationConnectorV1;
  selected: boolean;
  onSelect: () => void;
}) {
  const status = STATUS_PRESENTATION[connector.verificationStatus] ?? {
    label: 'KAPALI',
    variant: 'error' as const,
  };

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      data-testid={`connector-${connector.connectorId}`}
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
      <Stack direction="column" gap={2} style={wrapRef}>
        <Stack direction="row" justify="between" align="start" gap={2} wrap>
          <Text as="span" weight="semibold" style={wrapRef}>
            {DOMAIN_LABELS[connector.domain] ?? connector.domain}
          </Text>
          <Badge variant={status.variant}>{status.label}</Badge>
        </Stack>
        <Text as="span" size="xs" variant="secondary" style={wrapRef}>
          {connector.connectorId} · {connector.direction}
        </Text>
        <Text as="span" size="sm" style={wrapRef}>
          {connector.providerRef}
        </Text>
        <Stack direction="row" gap={1} wrap>
          <Badge variant={connector.criticalPath ? 'warning' : 'muted'}>
            {connector.criticalPath ? 'CRITICAL PATH' : 'OPSİYONEL'}
          </Badge>
          <Badge variant="muted">API VERIFIED · FALSE</Badge>
        </Stack>
      </Stack>
    </button>
  );
}

function ConnectorDetail({ connector }: { connector: IntegrationConnectorV1 }) {
  const status = STATUS_PRESENTATION[connector.verificationStatus] ?? {
    label: 'KAPALI',
    variant: 'error' as const,
  };

  return (
    <Card variant="outlined" padding="sm">
      <Stack direction="column" gap={3} data-testid="connector-detail" style={wrapRef}>
        <Stack direction="row" gap={2} align="center" wrap>
          <Text as="h3" size="lg" weight="semibold" style={wrapRef}>
            {connector.connectorId}
          </Text>
          <Badge variant={status.variant}>{status.label}</Badge>
          <Badge variant="info">{connector.authModel}</Badge>
        </Stack>
        <Text as="p" size="sm" variant="secondary">
          Sağlayıcı ref <code style={wrapRef}>{connector.providerRef}</code> · yön{' '}
          <strong>{connector.direction}</strong>. Bu metadata bağlantı veya partner sertifikası
          değildir.
        </Text>

        <div
          role="region"
          aria-label={`${connector.connectorId} operasyon ve veri sınıfları`}
          tabIndex={0}
          data-testid="integration-detail-scroll"
          style={{ overflowX: 'auto', maxWidth: '100%' }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '0.75rem',
              minWidth: 0,
            }}
          >
            <PolicyGroup title="İzinli operasyon adları" values={connector.operations} />
            <PolicyGroup title="Opaque veri sınıfları" values={connector.dataClasses} />
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '0.75rem',
            minWidth: 0,
          }}
        >
          <PolicyGroup
            title="Mutation tavanı"
            values={[
              'HUMAN_APPROVAL_REQUIRED',
              'IDEMPOTENCY_REQUIRED',
              'DECISION_IMPACT · NONE',
              'DESTRUCTIVE · DISALLOWED',
              'BATCH_APPROVAL · DISALLOWED',
            ]}
          />
          <PolicyGroup
            title="Aktarım yönetişimi"
            values={[
              connector.transferPolicy.purpose,
              connector.transferPolicy.piiMode,
              `DSAR · ${connector.transferPolicy.dsarOwner}`,
              `RETENTION · ${connector.transferPolicy.retentionOwner}`,
            ]}
          />
          <PolicyGroup
            title="Güvenilirlik sınırı"
            values={[
              `CURSOR · ${connector.reliability.cursorModel}`,
              `DELIVERY · ${connector.reliability.delivery}`,
              'TENANT-SCOPED IDEMPOTENCY · REQUIRED',
              `WEBHOOK SIGNATURE · ${connector.reliability.webhookSignatureRequired ? 'REQUIRED' : 'N/A'}`,
              `REPLAY WINDOW · ${connector.reliability.replayWindowSeconds} saniye`,
            ]}
          />
        </div>
      </Stack>
    </Card>
  );
}

function PolicyGroup({ title, values }: { title: string; values: readonly string[] }) {
  return (
    <Card variant="outlined" padding="sm">
      <Stack direction="column" gap={2} style={wrapRef}>
        <Text as="h4" size="sm" weight="semibold">
          {title}
        </Text>
        <ul style={{ margin: 0, paddingInlineStart: '1.25rem' }}>
          {values.map((value) => (
            <li key={value} style={wrapRef}>
              <Text as="span" size="xs" style={wrapRef}>
                <code style={wrapRef}>{value}</code>
              </Text>
            </li>
          ))}
        </ul>
      </Stack>
    </Card>
  );
}

function SyntheticEnvelopeCatalog({
  envelopes,
}: {
  envelopes: readonly IntegrationSyntheticEnvelopeV1[];
}) {
  return (
    <Stack direction="column" gap={2}>
      <Stack direction="row" gap={2} align="center" wrap>
        <Text as="h3" size="lg" weight="semibold">
          Sentetik zarf bağlantıları
        </Text>
        <Badge variant="warning">{envelopes.length} SYNTHETIC · PAYLOAD YOK</Badge>
      </Stack>
      <Text as="p" size="sm" variant="secondary">
        Yalnız digest, opaque ref ve insan onay ref’i gösterilir; ham payload, PII ve credential bu
        modele giremez.
      </Text>
      <ul
        data-testid="synthetic-envelope-catalog"
        aria-label="Sentetik entegrasyon zarfları"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '0.75rem',
          listStyle: 'none',
          margin: 0,
          padding: 0,
          minWidth: 0,
        }}
      >
        {envelopes.map((envelope) => (
          <li key={envelope.eventId} style={wrapRef}>
            <Card variant="outlined" padding="sm">
              <Stack direction="column" gap={2} style={wrapRef}>
                <Text as="span" size="sm" weight="semibold" style={wrapRef}>
                  {envelope.eventId}
                </Text>
                <Text as="span" size="xs" variant="secondary" style={wrapRef}>
                  {envelope.connectorId} · {envelope.operation}
                </Text>
                <Text as="span" size="xs" style={wrapRef}>
                  <code style={wrapRef}>{envelope.payloadDigest}</code>
                </Text>
                <Stack direction="row" gap={1} wrap>
                  <Badge variant="muted">SYNTHETIC</Badge>
                  <Badge variant="muted">HUMAN APPROVAL REF</Badge>
                  <Badge variant="muted">TENANT IDEMPOTENCY</Badge>
                </Stack>
              </Stack>
            </Card>
          </li>
        ))}
      </ul>
    </Stack>
  );
}

function ContractFailure({ errors }: { errors: readonly string[] }) {
  return (
    <Card variant="outlined" padding="md">
      <Stack direction="column" gap={3} data-testid="integration-workspace" style={wrapRef}>
        <Stack direction="row" gap={2} align="center" wrap>
          <Text as="h2" size="xl" weight="semibold">
            Entegrasyon Sözleşme Alanı (P4)
          </Text>
          <Badge variant="error" data-testid="integration-contract-status">
            CONTRACT FAIL-CLOSED
          </Badge>
        </Stack>
        <Text as="p" size="sm" data-testid="integration-fail-closed">
          Canonical sözleşme doğrulanamadı. Kısmi katalog, fixture fallback veya aktivasyon aksiyonu
          gösterilmiyor.
        </Text>
        <ul aria-label="Sözleşme doğrulama hataları" style={{ margin: 0, paddingInlineStart: 20 }}>
          {errors.slice(0, 8).map((error) => (
            <li key={error} style={wrapRef}>
              <Text as="span" size="xs" style={wrapRef}>
                <code style={wrapRef}>{error}</code>
              </Text>
            </li>
          ))}
        </ul>
      </Stack>
    </Card>
  );
}
