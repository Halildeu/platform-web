import React from 'react';
import type { EndpointCommand } from '../../../entities/endpoint-command/types';
import { isCommandActive } from '../../../entities/endpoint-command/types';
import { useEndpointAdminI18n } from '../../../i18n';

export interface InventoryTabProps {
  /** All commands for the device (newest first not required). */
  commands: EndpointCommand[];
  isDeviceOnline: boolean;
  isSubmitting: boolean;
  onCollectInventory: () => void;
}

interface ParsedInventory {
  localUsers: unknown[] | null;
  services: unknown[] | null;
  systemInfo: Record<string, unknown> | null;
  networkAdapters: unknown[] | null;
  diskVolumes: unknown[] | null;
}

function parseInventory(payload: Record<string, unknown>): ParsedInventory {
  return {
    localUsers: Array.isArray(payload.localUsers) ? payload.localUsers : null,
    services: Array.isArray(payload.services) ? payload.services : null,
    systemInfo:
      payload.systemInfo && typeof payload.systemInfo === 'object'
        ? (payload.systemInfo as Record<string, unknown>)
        : null,
    networkAdapters: Array.isArray(payload.networkAdapters) ? payload.networkAdapters : null,
    diskVolumes: Array.isArray(payload.diskVolumes) ? payload.diskVolumes : null,
  };
}

function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export const InventoryTab: React.FC<InventoryTabProps> = ({
  commands,
  isDeviceOnline,
  isSubmitting,
  onCollectInventory,
}) => {
  const { t } = useEndpointAdminI18n();
  const [showRaw, setShowRaw] = React.useState(false);

  const inventoryCommands = commands.filter((c) => c.type === 'COLLECT_INVENTORY');

  const latestSucceeded = React.useMemo(() => {
    const candidates = inventoryCommands
      .filter((c) => c.status === 'SUCCEEDED' && c.result?.payload)
      .sort((a, b) => {
        const aTs = a.completedAt ?? a.createdAt;
        const bTs = b.completedAt ?? b.createdAt;
        return Date.parse(bTs) - Date.parse(aTs);
      });
    return candidates[0] ?? null;
  }, [inventoryCommands]);

  const pendingInventory = inventoryCommands.find((c) => isCommandActive(c.status));

  const inventoryPayload = latestSucceeded?.result?.payload ?? null;
  const parsed = inventoryPayload ? parseInventory(inventoryPayload) : null;

  if (!latestSucceeded && !pendingInventory) {
    return (
      <div className="px-6 py-6 text-sm text-text-secondary" data-testid="inventory-tab-empty">
        <p className="mb-3">{t('endpointAdmin.drawer.inventory.empty')}</p>
        <button
          type="button"
          onClick={onCollectInventory}
          disabled={!isDeviceOnline || isSubmitting}
          data-testid="inventory-collect-button"
          className="px-4 py-2 rounded-md border border-border-default bg-surface-default text-sm text-text-primary disabled:opacity-50"
        >
          {t('endpointAdmin.drawer.inventory.collectNow')}
        </button>
      </div>
    );
  }

  return (
    <div className="px-6 py-4 space-y-4" data-testid="inventory-tab">
      {pendingInventory && (
        <div
          className="rounded-md border border-state-info-border bg-state-info-subtle px-4 py-2 text-sm text-state-info-text"
          data-testid="inventory-pending-banner"
          role="status"
        >
          {t('endpointAdmin.drawer.inventory.collecting').replace(
            '{status}',
            pendingInventory.status,
          )}
        </div>
      )}

      {latestSucceeded && (
        <>
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>
              {t('endpointAdmin.drawer.inventory.lastUpdated')}:{' '}
              {formatTimestamp(latestSucceeded.completedAt ?? latestSucceeded.createdAt)}
            </span>
            <div className="inline-flex rounded-md border border-border-default overflow-hidden">
              <button
                type="button"
                onClick={() => setShowRaw(false)}
                aria-pressed={!showRaw}
                data-testid="inventory-toggle-structured"
                className={
                  showRaw
                    ? 'px-3 py-1 text-xs'
                    : 'px-3 py-1 text-xs bg-surface-hover text-text-primary'
                }
              >
                {t('endpointAdmin.drawer.inventory.viewStructured')}
              </button>
              <button
                type="button"
                onClick={() => setShowRaw(true)}
                aria-pressed={showRaw}
                data-testid="inventory-toggle-raw"
                className={
                  showRaw
                    ? 'px-3 py-1 text-xs bg-surface-hover text-text-primary'
                    : 'px-3 py-1 text-xs'
                }
              >
                {t('endpointAdmin.drawer.inventory.viewRaw')}
              </button>
            </div>
          </div>

          {showRaw ? (
            <pre
              data-testid="inventory-raw-json"
              className="bg-surface-subtle text-xs p-3 rounded-md overflow-auto max-h-[400px] font-mono"
            >
              {JSON.stringify(inventoryPayload, null, 2)}
            </pre>
          ) : (
            <div data-testid="inventory-structured" className="space-y-4">
              {parsed?.systemInfo && (
                <InventorySection
                  title={t('endpointAdmin.drawer.inventory.section.systemInfo')}
                  testId="inventory-systeminfo"
                >
                  <KeyValueList data={parsed.systemInfo} />
                </InventorySection>
              )}

              {parsed?.localUsers && parsed.localUsers.length > 0 && (
                <InventorySection
                  title={t('endpointAdmin.drawer.inventory.section.localUsers')}
                  testId="inventory-localusers"
                >
                  <ArrayList items={parsed.localUsers} fields={['name', 'enabled', 'lastLogon']} />
                </InventorySection>
              )}

              {parsed?.services && parsed.services.length > 0 && (
                <InventorySection
                  title={t('endpointAdmin.drawer.inventory.section.services')}
                  testId="inventory-services"
                >
                  <ArrayList items={parsed.services} fields={['name', 'status', 'startMode']} />
                </InventorySection>
              )}

              {parsed?.networkAdapters && parsed.networkAdapters.length > 0 && (
                <InventorySection
                  title={t('endpointAdmin.drawer.inventory.section.networkAdapters')}
                  testId="inventory-networkadapters"
                >
                  <ArrayList
                    items={parsed.networkAdapters}
                    fields={['name', 'macAddress', 'ipAddress']}
                  />
                </InventorySection>
              )}

              {parsed?.diskVolumes && parsed.diskVolumes.length > 0 && (
                <InventorySection
                  title={t('endpointAdmin.drawer.inventory.section.diskVolumes')}
                  testId="inventory-diskvolumes"
                >
                  <ArrayList items={parsed.diskVolumes} fields={['name', 'sizeGb', 'freeGb']} />
                </InventorySection>
              )}

              {/* Fallback: if no known sections matched, show raw JSON */}
              {parsed &&
                !parsed.systemInfo &&
                !parsed.localUsers &&
                !parsed.services &&
                !parsed.networkAdapters &&
                !parsed.diskVolumes && (
                  <pre
                    data-testid="inventory-fallback-raw"
                    className="bg-surface-subtle text-xs p-3 rounded-md overflow-auto max-h-[400px] font-mono"
                  >
                    {JSON.stringify(inventoryPayload, null, 2)}
                  </pre>
                )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const InventorySection: React.FC<{
  title: string;
  testId?: string;
  children: React.ReactNode;
}> = ({ title, testId, children }) => (
  <section data-testid={testId}>
    <h5 className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1">
      {title}
    </h5>
    {children}
  </section>
);

const KeyValueList: React.FC<{ data: Record<string, unknown> }> = ({ data }) => (
  <dl className="text-sm">
    {Object.entries(data).map(([k, v]) => (
      <div key={k} className="grid grid-cols-[160px_1fr] gap-2 py-0.5">
        <dt className="text-text-secondary text-xs">{k}</dt>
        <dd className="text-text-primary text-xs break-all font-mono">
          {typeof v === 'object' ? JSON.stringify(v) : String(v)}
        </dd>
      </div>
    ))}
  </dl>
);

const ArrayList: React.FC<{ items: unknown[]; fields: string[] }> = ({ items, fields }) => (
  <ul className="text-xs space-y-1">
    {items.slice(0, 20).map((item, idx) => {
      if (typeof item !== 'object' || item === null) {
        return (
          <li key={idx} className="font-mono">
            {String(item)}
          </li>
        );
      }
      const rec = item as Record<string, unknown>;
      const visible = fields.filter((f) => rec[f] !== undefined);
      return (
        <li key={idx} className="border-b border-border-subtle py-1">
          {visible.map((f) => (
            <span key={f} className="mr-3">
              <span className="text-text-secondary">{f}:</span>{' '}
              <span className="font-mono">{String(rec[f] ?? '—')}</span>
            </span>
          ))}
        </li>
      );
    })}
    {items.length > 20 && <li className="text-text-secondary">… {items.length - 20} satır daha</li>}
  </ul>
);

InventoryTab.displayName = 'InventoryTab';
