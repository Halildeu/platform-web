import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Badge, Button, Card, Input, Stack, Text } from '@mfe/design-system';
import { SYNTHETIC_CONNECTORS, SYNTHETIC_FIELD_MAPPINGS } from './syntheticRegistry';
import type {
  ConnectorCategory,
  ConnectorVerificationStatus,
  SyntheticConnectorDefinition,
} from './types';

const CATEGORY_LABELS: Record<ConnectorCategory, string> = {
  ATS: 'ATS',
  HRIS: 'HRIS',
  CALENDAR_EMAIL: 'Takvim / e-posta',
  SSO_SCIM: 'SSO / SCIM',
  CSV_API_WEBHOOK: 'CSV / API / webhook',
};

const STATUS_PRESENTATION: Record<
  ConnectorVerificationStatus,
  { label: string; variant: 'success' | 'warning' | 'error' | 'muted' }
> = {
  UNVERIFIED: { label: 'DOĞRULANMADI', variant: 'warning' },
  VERIFIED: { label: 'DOĞRULANDI', variant: 'success' },
  BLOCKED: { label: 'BLOKE', variant: 'error' },
  NOT_CONFIGURED: { label: 'YAPILANDIRILMADI', variant: 'muted' },
};

const ACTION_BLOCK_REASON =
  'API doğrulanmadı: sürümlemeli kontrat, sandbox kanıtı ve owner acceptance gerekli.';

export function IntegrationWorkspace() {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(SYNTHETIC_CONNECTORS[0]?.id ?? '');
  const normalizedQuery = query.trim().toLocaleLowerCase('tr-TR');

  const visibleConnectors = useMemo(
    () =>
      SYNTHETIC_CONNECTORS.filter((connector) => {
        if (!normalizedQuery) return true;
        return [
          connector.name,
          connector.description,
          CATEGORY_LABELS[connector.category],
          connector.status,
        ].some((value) => value.toLocaleLowerCase('tr-TR').includes(normalizedQuery));
      }),
    [normalizedQuery],
  );

  const selected =
    visibleConnectors.find((connector) => connector.id === selectedId) ?? visibleConnectors[0];

  return (
    <Card variant="outlined" padding="md">
      <Stack direction="column" gap={4} data-testid="integration-workspace">
        <Stack direction="column" gap={2}>
          <Stack direction="row" gap={2} align="center" wrap>
            <Text as="h2" size="xl" weight="semibold">
              Entegrasyon Çalışma Alanı (P4)
            </Text>
            <Badge variant="warning" data-testid="integration-synthetic-boundary">
              SENTETİK / veri aktarımı yok
            </Badge>
          </Stack>
          <Text as="p" size="sm" variant="secondary">
            Bağlayıcı kataloğu ve alan eşleme önizlemesi. Bu yüzey bağlantı kurmaz, kimlik bilgisi
            toplamaz, aday verisi taşımaz ve harici sistemlere yazmaz.
          </Text>
          <Input
            id="integration-catalog-search"
            label="Bağlayıcı ara"
            placeholder="ATS, HRIS, SCIM…"
            value={query}
            onValueChange={setQuery}
            data-testid="integration-search"
          />
        </Stack>

        <div
          data-testid="connector-catalog"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '0.75rem',
          }}
        >
          {visibleConnectors.map((connector) => (
            <ConnectorCard
              key={connector.id}
              connector={connector}
              selected={connector.id === selected?.id}
              onSelect={() => setSelectedId(connector.id)}
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
          {visibleConnectors.length} sentetik bağlayıcı gösteriliyor.
        </div>

        {visibleConnectors.length === 0 && (
          <Text as="p" size="sm" data-testid="connector-empty-state">
            Aramayla eşleşen sentetik bağlayıcı yok.
          </Text>
        )}

        {selected && <ConnectorDetail connector={selected} />}

        <Stack direction="column" gap={2}>
          <Text as="h3" size="lg" weight="semibold">
            Sentetik alan eşleme önizlemesi
          </Text>
          <Text as="p" size="sm" variant="secondary">
            Tüm satırlar PREVIEW_ONLY ve kapalıdır. PII satırı görünür olsa da aktarım yetkisi
            vermez.
          </Text>
          <div style={{ overflowX: 'auto' }}>
            <table
              data-testid="mapping-preview"
              style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}
            >
              <caption
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
                Sentetik alan eşleme önizlemesi
              </caption>
              <thead>
                <tr>
                  <TableHeader>Kaynak alan</TableHeader>
                  <TableHeader>Hedef alan</TableHeader>
                  <TableHeader>Sınıf</TableHeader>
                  <TableHeader>Aktarım</TableHeader>
                </tr>
              </thead>
              <tbody>
                {SYNTHETIC_FIELD_MAPPINGS.map((mapping) => (
                  <tr key={`${mapping.source}-${mapping.target}`}>
                    <TableCell>
                      <code>{mapping.source}</code>
                    </TableCell>
                    <TableCell>
                      <code>{mapping.target}</code>
                    </TableCell>
                    <TableCell>{mapping.classification}</TableCell>
                    <TableCell>
                      <Badge variant="muted">KAPALI · {mapping.transferMode}</Badge>
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Stack>
      </Stack>
    </Card>
  );
}

function ConnectorCard({
  connector,
  selected,
  onSelect,
}: {
  connector: SyntheticConnectorDefinition;
  selected: boolean;
  onSelect: () => void;
}) {
  const status = STATUS_PRESENTATION[connector.status];

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      data-testid={`connector-${connector.id}`}
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
            {connector.name}
          </Text>
          <Badge variant={status.variant}>{status.label}</Badge>
        </Stack>
        <Text as="span" size="xs" variant="secondary">
          {CATEGORY_LABELS[connector.category]}
        </Text>
        <Text as="span" size="sm">
          {connector.description}
        </Text>
      </Stack>
    </button>
  );
}

function ConnectorDetail({ connector }: { connector: SyntheticConnectorDefinition }) {
  const status = STATUS_PRESENTATION[connector.status];
  const actionsEnabled = connector.apiVerified && connector.status === 'VERIFIED';

  return (
    <Card variant="outlined" padding="sm">
      <Stack direction="column" gap={3} data-testid="connector-detail">
        <Stack direction="row" gap={2} align="center" wrap>
          <Text as="h3" size="lg" weight="semibold">
            {connector.name}
          </Text>
          <Badge variant={status.variant}>{status.label}</Badge>
          <Badge variant="info">{connector.schemaVersion}</Badge>
        </Stack>
        <Text as="p" size="sm">
          {connector.statusReason}
        </Text>
        <Stack direction="row" gap={2} wrap aria-label="Bağlayıcı yetenekleri">
          {connector.capabilities.map((capability) => (
            <Badge key={capability} variant="muted">
              {capability}
            </Badge>
          ))}
        </Stack>
        {!actionsEnabled && (
          <Text as="p" size="sm" variant="secondary" data-testid="integration-action-reason">
            {ACTION_BLOCK_REASON}
          </Text>
        )}
        <Stack direction="row" gap={2} wrap>
          <Button
            variant="outline"
            disabled={!actionsEnabled}
            accessReason={ACTION_BLOCK_REASON}
            data-testid="integration-test-button"
          >
            Bağlantıyı test et
          </Button>
          <Button
            variant="primary"
            disabled={!actionsEnabled}
            accessReason={ACTION_BLOCK_REASON}
            data-testid="integration-write-button"
          >
            Yazma yetkisini aç
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}

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
