import React from 'react';
import { BottomSheetDrawer, Tabs } from '@mfe/design-system';
import type { EndpointDevice } from '../../entities/endpoint-device/types';
import type {
  CreateEndpointCommandBody,
  EndpointCommand,
} from '../../entities/endpoint-command/types';
import {
  useListDeviceCommandsQuery,
  useCreateDeviceCommandMutation,
} from '../../app/services/endpointAdminApi';
import { useEndpointAdminI18n } from '../../i18n';
import { DetayTab } from './tabs/DetayTab';
import { IslemlerTab } from './tabs/IslemlerTab';
import { AuditTab } from './tabs/AuditTab';
import { InventoryTab } from './tabs/InventoryTab';
import { ComplianceTab } from './tabs/ComplianceTab';

export interface DeviceDetailDrawerProps {
  open: boolean;
  device: EndpointDevice | null;
  onClose: () => void;
}

type TabKey = 'detay' | 'islemler' | 'audit' | 'inventory' | 'compliance';

function generateIdempotencyKey(): string {
  // crypto.randomUUID is widely available in modern browsers + jsdom
  // (Node 19+). Fall back to a timestamp-based id only in degraded
  // environments — duplicate keys are tolerated server-side (the
  // unique-violation triggers a 409 the UI surfaces as an error toast).
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const DeviceDetailDrawer: React.FC<DeviceDetailDrawerProps> = ({
  open,
  device,
  onClose,
}) => {
  const { t } = useEndpointAdminI18n();
  const [activeTab, setActiveTab] = React.useState<TabKey>('detay');
  const [lastIssuedCommand, setLastIssuedCommand] = React.useState<EndpointCommand | null>(null);
  const [lastError, setLastError] = React.useState<string | null>(null);

  const deviceId = device?.id ?? null;
  const shouldPoll = Boolean(open && deviceId);

  const { data: commands } = useListDeviceCommandsQuery(
    { deviceId: deviceId ?? '' },
    {
      skip: !shouldPoll,
      pollingInterval: shouldPoll ? 10_000 : 0,
    },
  );

  const [createCommand, createState] = useCreateDeviceCommandMutation();

  // Reset transient toast state when the drawer closes or the device
  // changes — stale "command queued" banners must not bleed across
  // selections.
  React.useEffect(() => {
    if (!open) {
      setLastIssuedCommand(null);
      setLastError(null);
      setActiveTab('detay');
    }
  }, [open]);

  React.useEffect(() => {
    setLastIssuedCommand(null);
    setLastError(null);
  }, [deviceId]);

  const handleIssueCommand = React.useCallback(
    async (body: CreateEndpointCommandBody) => {
      if (!deviceId) return;
      setLastError(null);
      try {
        const next = await createCommand({
          deviceId,
          body: {
            idempotencyKey: generateIdempotencyKey(),
            ...body,
          },
        }).unwrap();
        setLastIssuedCommand(next);
      } catch (err: unknown) {
        const status =
          err && typeof err === 'object' && 'status' in err
            ? String((err as { status: unknown }).status)
            : '';
        if (status === '403') {
          setLastError(t('endpointAdmin.drawer.islemler.error403'));
        } else {
          setLastError(t('endpointAdmin.drawer.islemler.error'));
        }
      }
    },
    [createCommand, deviceId, t],
  );

  if (!device) return null;

  const deviceCommands = commands ?? [];

  const tabItems = [
    {
      key: 'detay',
      label: t('endpointAdmin.drawer.tab.detay'),
      content: <DetayTab device={device} />,
    },
    {
      key: 'islemler',
      label: t('endpointAdmin.drawer.tab.islemler'),
      content: (
        <IslemlerTab
          device={device}
          recentCommands={deviceCommands}
          isSubmitting={createState.isLoading}
          lastIssuedCommandId={lastIssuedCommand?.id ?? null}
          lastIssuedRequiresApproval={lastIssuedCommand?.approvalStatus === 'PENDING'}
          lastError={lastError}
          onIssueCommand={handleIssueCommand}
        />
      ),
    },
    {
      key: 'audit',
      label: t('endpointAdmin.drawer.tab.audit'),
      content: <AuditTab deviceId={device.id} active={activeTab === 'audit'} />,
    },
    {
      key: 'inventory',
      label: t('endpointAdmin.drawer.tab.inventory'),
      content: <InventoryTab deviceId={device.id} active={activeTab === 'inventory'} />,
    },
    {
      key: 'compliance',
      label: t('endpointAdmin.drawer.compliance.tabLabel'),
      content: <ComplianceTab deviceId={device.id} active={activeTab === 'compliance'} />,
    },
  ];

  const subtitle = device.hostname;

  return (
    <BottomSheetDrawer
      open={open}
      onClose={onClose}
      title={t('endpointAdmin.drawer.tab.detay')}
      subtitle={subtitle}
      size="lg"
      ariaLabel={`Device detail: ${device.hostname}`}
    >
      <Tabs
        items={tabItems}
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as TabKey)}
        variant="line"
        size="sm"
        fullWidth
      />
    </BottomSheetDrawer>
  );
};

DeviceDetailDrawer.displayName = 'DeviceDetailDrawer';
