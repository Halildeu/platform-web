import React from 'react';
import { Tabs } from '@mfe/design-system/components/tabs';
import type { EndpointDevice } from '../../../entities/endpoint-device/types';
import { useEndpointAdminI18n } from '../../../i18n';
import { TabFallback } from './TabFallback';

/**
 * platform-web#1212 — one "Yazılımlar" tab for everything about the
 * device's software.
 *
 * The drawer used to spread six software views over six top-level tabs
 * (18 tabs in one row). They now live behind a single top-level tab and
 * a secondary switcher. Every view is unchanged and still lazy: the
 * switcher renders only the selected section, so opening "Yazılımlar"
 * loads one chunk and runs one view's queries, exactly like selecting
 * one of the old tabs did (WEB-014D drawer cold-path budget).
 *
 *  - installed        WEB-011 / BE-020I software inventory + WinGet readiness
 *  - outdated         AG-036 outdated-software snapshot
 *  - prohibited       BE-025 prohibited-software findings
 *  - changes          BE-024 software-inventory diff
 *  - outdated-changes BE-024b outdated-software diff
 *  - catalog          WEB-014D + AG-028 install / uninstall from the catalog
 */
const InventoryTab = React.lazy(() =>
  import('./InventoryTab').then((m) => ({ default: m.InventoryTab })),
);
const OutdatedSoftwareView = React.lazy(() =>
  import('../components/outdated-software/OutdatedSoftwareView').then((m) => ({
    default: m.OutdatedSoftwareView,
  })),
);
const ProhibitedSoftwareView = React.lazy(() =>
  import('../components/prohibited-software/ProhibitedSoftwareView').then((m) => ({
    default: m.ProhibitedSoftwareView,
  })),
);
const SoftwareDiffView = React.lazy(() =>
  import('../components/software-diff/SoftwareDiffView').then((m) => ({
    default: m.SoftwareDiffView,
  })),
);
const OutdatedSoftwareDiffView = React.lazy(() =>
  import('../components/outdated-software-diff/OutdatedSoftwareDiffView').then((m) => ({
    default: m.OutdatedSoftwareDiffView,
  })),
);
const SoftwareCatalogTab = React.lazy(() =>
  import('./SoftwareCatalogTab').then((m) => ({ default: m.SoftwareCatalogTab })),
);

export type DeviceSoftwareSectionKey =
  | 'installed'
  | 'outdated'
  | 'prohibited'
  | 'changes'
  | 'outdated-changes'
  | 'catalog';

export const DEFAULT_SOFTWARE_SECTION: DeviceSoftwareSectionKey = 'installed';

export interface SoftwareTabProps {
  device: EndpointDevice;
  /** True while the drawer's top-level "Yazılımlar" tab is selected. */
  active: boolean;
  /**
   * Selected section. Owned by the drawer so the choice survives a trip
   * to another top-level tab and resets together with it on open /
   * device change.
   */
  section: DeviceSoftwareSectionKey;
  onSectionChange: (section: DeviceSoftwareSectionKey) => void;
}

export const SoftwareTab: React.FC<SoftwareTabProps> = ({
  device,
  active,
  section,
  onSectionChange,
}) => {
  const { t } = useEndpointAdminI18n();

  const items = React.useMemo(() => {
    const shown = (key: DeviceSoftwareSectionKey) => active && section === key;
    const lazy = (node: React.ReactNode) => (
      <React.Suspense fallback={<TabFallback />}>{node}</React.Suspense>
    );
    return [
      {
        key: 'installed' as const,
        label: t('endpointAdmin.drawer.tab.inventory'),
        content: lazy(<InventoryTab deviceId={device.id} active={shown('installed')} />),
      },
      {
        key: 'outdated' as const,
        label: t('endpointAdmin.drawer.tab.outdatedSoftware'),
        content: lazy(<OutdatedSoftwareView deviceId={device.id} active={shown('outdated')} />),
      },
      {
        key: 'prohibited' as const,
        label: t('endpointAdmin.drawer.tab.prohibitedSoftware'),
        content: lazy(<ProhibitedSoftwareView deviceId={device.id} active={shown('prohibited')} />),
      },
      {
        key: 'changes' as const,
        label: t('endpointAdmin.drawer.tab.softwareDiff'),
        content: lazy(<SoftwareDiffView deviceId={device.id} active={shown('changes')} />),
      },
      {
        key: 'outdated-changes' as const,
        label: t('endpointAdmin.drawer.tab.outdatedSoftwareDiff'),
        content: lazy(
          <OutdatedSoftwareDiffView deviceId={device.id} active={shown('outdated-changes')} />,
        ),
      },
      {
        key: 'catalog' as const,
        label: t('endpointAdmin.drawer.tab.softwareCatalog'),
        content: lazy(<SoftwareCatalogTab device={device} active={shown('catalog')} />),
      },
    ];
  }, [device, active, section, t]);

  return (
    <div data-testid="software-tab">
      <Tabs
        items={items}
        activeKey={section}
        onChange={(key) => onSectionChange(key as DeviceSoftwareSectionKey)}
        variant="enclosed"
        size="sm"
        slotProps={{
          list: {
            'aria-label': t('endpointAdmin.drawer.software.sectionsLabel'),
            className: 'flex-wrap',
          },
        }}
      />
    </div>
  );
};

SoftwareTab.displayName = 'SoftwareTab';
