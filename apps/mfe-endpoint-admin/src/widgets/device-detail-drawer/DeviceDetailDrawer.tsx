import React from 'react';
// WEB-014D perf follow-up (Codex 019e707e iter-2 must-fix #1 absorb):
// deep imports from `@mfe/design-system/patterns/bottom-sheet` and
// `@mfe/design-system/components/tabs` so the drawer surface never
// drags the design-system root barrel (which re-exports `./charts` +
// the ECharts dependency chain) into the drawer cold path.
import { BottomSheetDrawer } from '@mfe/design-system/patterns/bottom-sheet';
import { Tabs } from '@mfe/design-system/components/tabs';
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

/**
 * WEB-014D perf follow-up (Codex 019e707e iter-2 PARTIAL absorb):
 *
 * Heavy tabs (`Audit`, `Inventory`, `Compliance`, `SoftwareCatalog`)
 * are loaded via `React.lazy` and rendered through `<Suspense>` so the
 * drawer's first paint only pays for the default tab (`Detay`) and the
 * cheap `Islemler` action surface. The previous eager import chain
 * pulled `SoftwareCatalogTab` + `InstallPreflightModal` +
 * `ComplianceHistory` into the drawer cold graph even when the operator
 * never clicked beyond `Detay`.
 *
 * `DetayTab` and `IslemlerTab` stay eager because:
 *  - `Detay` is the default-active tab on every open.
 *  - `Islemler` is the next-most-used tab and is a small action surface
 *    (no AG Grid, no compliance graph) so its eager cost is negligible.
 */
const AuditTab = React.lazy(() => import('./tabs/AuditTab').then((m) => ({ default: m.AuditTab })));
const InventoryTab = React.lazy(() =>
  import('./tabs/InventoryTab').then((m) => ({ default: m.InventoryTab })),
);
const ComplianceTab = React.lazy(() =>
  import('./tabs/ComplianceTab').then((m) => ({ default: m.ComplianceTab })),
);
const SoftwareCatalogTab = React.lazy(() =>
  import('./tabs/SoftwareCatalogTab').then((m) => ({ default: m.SoftwareCatalogTab })),
);
// WEB-013 — Faz 22.5.2 / 22.5.5 frontend closure. Hardware tab is
// lazy because the WMI/CIM tables, history accordion, and probe-error
// list never render until the operator selects this tab. Keeping it
// out of the drawer cold path preserves the WEB-014D perf budget.
const HardwareInventoryTab = React.lazy(() =>
  import('./components/hardware-inventory/HardwareInventoryView').then((m) => ({
    default: m.HardwareInventoryView,
  })),
);
// WEB device-health — Faz 22.5 second wave (AG-033). Lazy because the
// disk/memory/uptime panels, history accordion, and probe-error list
// never render until the operator selects this tab. Keeping it out of
// the drawer cold path preserves the WEB-014D perf budget.
const DeviceHealthTab = React.lazy(() =>
  import('./components/device-health/DeviceHealthView').then((m) => ({
    default: m.DeviceHealthView,
  })),
);
// AG-036 outdated-software — Faz 22.5 Track C. Lazy because the package
// table, history accordion, and probe-error list never render until the
// operator selects this tab. Keeping it out of the drawer cold path
// preserves the WEB-014D perf budget.
const OutdatedSoftwareTab = React.lazy(() =>
  import('./components/outdated-software/OutdatedSoftwareView').then((m) => ({
    default: m.OutdatedSoftwareView,
  })),
);
// AG-037 hotfix posture — Faz 22.5 Track C (WEB-014G). Lazy for the
// same WEB-014D perf reason as outdated-software: the installed/pending
// tables, pendingByCategory rollup, agent-health panel, and history
// accordion never render until the operator selects this tab.
const HotfixPostureTab = React.lazy(() =>
  import('./components/hotfix-posture/HotfixPostureView').then((m) => ({
    default: m.HotfixPostureView,
  })),
);

// AG-038 agent self-diagnostics — Faz 22.5. Same lazy-mount pattern as
// hotfix-posture / outdated-software: the agent-meta panel, connectivity
// badges, lastError facet, and probeErrors list never render until the
// operator selects the "Agent Tanılaması" tab. Direct lazy-import of
// the view (no thin Tab wrapper — Codex 019e833d must_fix #7 follows the
// HotfixPosture / DeviceHealth precedent).
const DiagnosticsTab = React.lazy(() =>
  import('./components/agent-diagnostics/DiagnosticsView').then((m) => ({
    default: m.DiagnosticsView,
  })),
);

// AG-039 critical services inventory — Faz 22.5. Same lazy-mount pattern;
// the 6-service table, state/startup badges, and probeErrors list never
// render until the operator selects the "Hizmetler" tab.
const ServicesTab = React.lazy(() =>
  import('./components/services/ServicesView').then((m) => ({
    default: m.ServicesView,
  })),
);

// AG-040 startup-apps + exposure summary — Faz 22.5. Same lazy-mount
// pattern; the meta panel, exposure-summary tri-state badges, 10-slot
// startup-apps table, and probeErrors list never render until the
// operator selects the "Başlangıç + Maruziyet" tab.
const StartupExposureTab = React.lazy(() =>
  import('./components/startup-exposure/StartupExposureView').then((m) => ({
    default: m.StartupExposureView,
  })),
);

const TabFallback: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    className="px-6 py-4 text-sm text-text-secondary"
    data-testid="drawer-tab-fallback"
  >
    Yükleniyor…
  </div>
);

export type DeviceDetailDrawerTabKey =
  | 'detay'
  | 'islemler'
  | 'audit'
  | 'inventory'
  | 'hardware'
  | 'health'
  | 'outdated-software'
  | 'hotfix-posture'
  | 'diagnostics'
  | 'services'
  | 'startup-exposure'
  | 'software-catalog'
  | 'compliance';

export interface DeviceDetailDrawerProps {
  open: boolean;
  device: EndpointDevice | null;
  onClose: () => void;
  /**
   * WEB-014B — Optional initial tab. When the drawer is opened from the
   * cross-device compliance list page the row click should land on the
   * Compliance tab instead of the default `detay`. Re-applied on every
   * `open` / `deviceId` / `initialTab` change so navigating between
   * rows while the drawer is open keeps the Compliance tab selected.
   */
  initialTab?: DeviceDetailDrawerTabKey;
}

type TabKey = DeviceDetailDrawerTabKey;

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const DeviceDetailDrawer: React.FC<DeviceDetailDrawerProps> = ({
  open,
  device,
  onClose,
  initialTab,
}) => {
  const { t } = useEndpointAdminI18n();
  const [activeTab, setActiveTab] = React.useState<TabKey>(initialTab ?? 'detay');
  const [lastIssuedCommand, setLastIssuedCommand] = React.useState<EndpointCommand | null>(null);
  const [lastError, setLastError] = React.useState<string | null>(null);

  const deviceId = device?.id ?? null;

  // WEB-014D perf follow-up (Codex 019e707e iter-2 must-fix B1): poll
  // the device command list ONLY while the operator is on the
  // `islemler` tab. The previous condition `open && deviceId` kept the
  // 10-second poll alive any time the drawer was open — even on
  // `detay`, `audit`, `inventory`, `compliance`, or `software-catalog`
  // where the command list never renders. Combined with a slower 30 s
  // interval this drops background CPU + network noise to the minimum
  // surface that actually displays the data.
  const shouldPollCommands = Boolean(open && deviceId && activeTab === 'islemler');

  const { data: commands } = useListDeviceCommandsQuery(
    { deviceId: deviceId ?? '' },
    {
      skip: !shouldPollCommands,
      pollingInterval: shouldPollCommands ? 30_000 : 0,
    },
  );

  const [createCommand, createState] = useCreateDeviceCommandMutation();

  // Reset transient toast state when the drawer closes — stale
  // "command queued" banners must not bleed across selections.
  React.useEffect(() => {
    if (!open) {
      setLastIssuedCommand(null);
      setLastError(null);
    }
  }, [open]);

  // WEB-014B — Honor `initialTab` on every open / device change.
  React.useEffect(() => {
    if (open) {
      setActiveTab(initialTab ?? 'detay');
    }
  }, [open, deviceId, initialTab]);

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

  // WEB-014D perf follow-up: memoise the tab items list so the array
  // identity is stable across drawer renders unless the underlying
  // inputs change. Without this every render produced a new array +
  // new content nodes, forcing the design-system `Tabs` widget to
  // reconcile fresh JSX even when the operator merely moved the mouse.
  const tabItems = React.useMemo(() => {
    if (!device) return [];
    const deviceCommands = commands ?? [];
    return [
      {
        key: 'detay' as const,
        label: t('endpointAdmin.drawer.tab.detay'),
        content: <DetayTab device={device} />,
      },
      {
        key: 'islemler' as const,
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
        key: 'audit' as const,
        label: t('endpointAdmin.drawer.tab.audit'),
        content: (
          <React.Suspense fallback={<TabFallback />}>
            <AuditTab deviceId={device.id} active={activeTab === 'audit'} />
          </React.Suspense>
        ),
      },
      {
        key: 'inventory' as const,
        label: t('endpointAdmin.drawer.tab.inventory'),
        content: (
          <React.Suspense fallback={<TabFallback />}>
            <InventoryTab deviceId={device.id} active={activeTab === 'inventory'} />
          </React.Suspense>
        ),
      },
      {
        key: 'hardware' as const,
        label: t('endpointAdmin.drawer.tab.hardware'),
        content: (
          <React.Suspense fallback={<TabFallback />}>
            <HardwareInventoryTab deviceId={device.id} active={activeTab === 'hardware'} />
          </React.Suspense>
        ),
      },
      {
        key: 'health' as const,
        label: t('endpointAdmin.drawer.tab.health'),
        content: (
          <React.Suspense fallback={<TabFallback />}>
            <DeviceHealthTab deviceId={device.id} active={activeTab === 'health'} />
          </React.Suspense>
        ),
      },
      {
        key: 'outdated-software' as const,
        label: t('endpointAdmin.drawer.tab.outdatedSoftware'),
        content: (
          <React.Suspense fallback={<TabFallback />}>
            <OutdatedSoftwareTab deviceId={device.id} active={activeTab === 'outdated-software'} />
          </React.Suspense>
        ),
      },
      {
        key: 'hotfix-posture' as const,
        label: t('endpointAdmin.drawer.tab.hotfixPosture'),
        content: (
          <React.Suspense fallback={<TabFallback />}>
            <HotfixPostureTab deviceId={device.id} active={activeTab === 'hotfix-posture'} />
          </React.Suspense>
        ),
      },
      {
        key: 'diagnostics' as const,
        label: t('endpointAdmin.drawer.tab.diagnostics'),
        content: (
          <React.Suspense fallback={<TabFallback />}>
            <DiagnosticsTab deviceId={device.id} active={activeTab === 'diagnostics'} />
          </React.Suspense>
        ),
      },
      {
        key: 'services' as const,
        label: t('endpointAdmin.drawer.tab.services'),
        content: (
          <React.Suspense fallback={<TabFallback />}>
            <ServicesTab deviceId={device.id} active={activeTab === 'services'} />
          </React.Suspense>
        ),
      },
      {
        key: 'startup-exposure' as const,
        label: t('endpointAdmin.drawer.tab.startupExposure'),
        content: (
          <React.Suspense fallback={<TabFallback />}>
            <StartupExposureTab deviceId={device.id} active={activeTab === 'startup-exposure'} />
          </React.Suspense>
        ),
      },
      {
        key: 'software-catalog' as const,
        label: t('endpointAdmin.drawer.tab.softwareCatalog'),
        content: (
          <React.Suspense fallback={<TabFallback />}>
            <SoftwareCatalogTab device={device} active={activeTab === 'software-catalog'} />
          </React.Suspense>
        ),
      },
      {
        key: 'compliance' as const,
        label: t('endpointAdmin.drawer.compliance.tabLabel'),
        content: (
          <React.Suspense fallback={<TabFallback />}>
            <ComplianceTab deviceId={device.id} active={activeTab === 'compliance'} />
          </React.Suspense>
        ),
      },
    ];
  }, [
    device,
    commands,
    createState.isLoading,
    lastIssuedCommand,
    lastError,
    handleIssueCommand,
    activeTab,
    t,
  ]);

  if (!device) return null;

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
