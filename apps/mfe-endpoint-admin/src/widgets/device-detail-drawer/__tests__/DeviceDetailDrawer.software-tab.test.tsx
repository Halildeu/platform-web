import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { EndpointDevice } from '../../../entities/endpoint-device/types';

/*
 * platform-web#1212 — the six software views of the device drawer live
 * behind one top-level "Yazılımlar" tab with a secondary switcher.
 *
 * The real design-system `Tabs` renders both levels so the assertions run
 * against the actual tablist/tab/tabpanel semantics. The six views are
 * replaced by probes that expose the props the drawer hands them; the
 * views themselves keep their own tests.
 */

vi.mock('@mfe/design-system/patterns/bottom-sheet', () => ({
  BottomSheetDrawer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-bottom-sheet">{children}</div>
  ),
}));

vi.mock('../../../app/services/endpointAdminApi', () => ({
  useListDeviceCommandsQuery: () => ({ data: [] }),
  useCreateDeviceCommandMutation: () => [vi.fn(), { isLoading: false }],
  useCreateLocalPasswordChangeMutation: () => [vi.fn(), { isLoading: false }],
}));

type ViewProbeProps = { deviceId: string; active: boolean };
const probe = (section: string) => (props: ViewProbeProps) => (
  <div
    data-testid={`software-view-${section}`}
    data-device-id={props.deviceId}
    data-active={String(props.active)}
  />
);

vi.mock('../tabs/InventoryTab', () => ({ InventoryTab: probe('installed') }));
vi.mock('../components/outdated-software/OutdatedSoftwareView', () => ({
  OutdatedSoftwareView: probe('outdated'),
}));
vi.mock('../components/prohibited-software/ProhibitedSoftwareView', () => ({
  ProhibitedSoftwareView: probe('prohibited'),
}));
vi.mock('../components/software-diff/SoftwareDiffView', () => ({
  SoftwareDiffView: probe('changes'),
}));
vi.mock('../components/outdated-software-diff/OutdatedSoftwareDiffView', () => ({
  OutdatedSoftwareDiffView: probe('outdated-changes'),
}));
vi.mock('../tabs/SoftwareCatalogTab', () => ({
  SoftwareCatalogTab: (props: { device: EndpointDevice; active: boolean }) => (
    <div
      data-testid="software-view-catalog"
      data-device-id={props.device.id}
      data-active={String(props.active)}
    />
  ),
}));

import { DeviceDetailDrawer } from '../DeviceDetailDrawer';

const SECTION_LABELS = [
  'Yüklü',
  'Güncel Olmayan',
  'Yasaklı',
  'Değişimler',
  'Güncel Olmayan Değişimler',
  'Katalog',
];
const SECTION_KEYS = [
  'installed',
  'outdated',
  'prohibited',
  'changes',
  'outdated-changes',
  'catalog',
];
const OLD_TOP_LEVEL_LABELS = [
  'Envanter',
  'Güncel Olmayan Yazılım',
  'Yazılım Değişimleri',
  'Güncel Olmayan Değişimler',
  'Yasaklı Yazılım',
  'Yazılım Kataloğu',
];

function makeDevice(id: string, hostname: string): EndpointDevice {
  return {
    id,
    tenantId: 'tenant-1',
    hostname,
    displayName: null,
    osType: 'WINDOWS',
    osVersion: '11 23H2',
    agentVersion: 'v0.3.31',
    machineFingerprint: null,
    domainName: 'acik.local',
    activeUser: null,
    status: 'ONLINE',
    lastSeenAt: '2026-09-30T08:00:00Z',
    enrolledAt: '2026-09-01T00:00:00Z',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-30T08:00:00Z',
    deploymentRing: null,
    deviceTags: [],
  };
}

const deviceA = makeDevice('dev-a', 'ACK-OBOLUT');
const deviceB = makeDevice('dev-b', 'ERP-MOBIL');

const topLevelTabs = () => within(screen.getAllByRole('tablist')[0]).getAllByRole('tab');
const sectionTablist = () => screen.getByRole('tablist', { name: 'Yazılım bölümleri' });
const mountedSoftwareViews = () =>
  SECTION_KEYS.filter((key) => screen.queryByTestId(`software-view-${key}`) !== null);

async function openSoftwareTab() {
  fireEvent.click(
    within(screen.getAllByRole('tablist')[0]).getByRole('tab', { name: 'Yazılımlar' }),
  );
  return screen.findByTestId('software-tab');
}

beforeEach(() => {
  vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('tr-TR');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DeviceDetailDrawer — software views behind one "Yazılımlar" tab (#1212)', () => {
  it('shows one Yazılımlar tab instead of six software tabs in the top-level row', () => {
    render(<DeviceDetailDrawer open device={deviceA} onClose={vi.fn()} />);

    const names = topLevelTabs().map((tab) => tab.textContent);
    expect(names).toHaveLength(13);
    expect(names.filter((name) => name === 'Yazılımlar')).toHaveLength(1);
    // It sits where "Envanter" used to be: right after Denetim Geçmişi.
    expect(names.slice(0, 4)).toEqual(['Detay', 'İşlemler', 'Denetim Geçmişi', 'Yazılımlar']);
    for (const old of OLD_TOP_LEVEL_LABELS) {
      expect(names).not.toContain(old);
    }
    // Non-software posture tabs stay top-level.
    expect(names).toEqual(
      expect.arrayContaining(['Hotfix Duruşu', 'Hizmetler', 'Uygulama Kontrolü', 'Uyum']),
    );
  });

  it('opens on the installed-software section and mounts only that view', async () => {
    render(<DeviceDetailDrawer open device={deviceA} onClose={vi.fn()} />);
    await openSoftwareTab();

    const sections = within(sectionTablist()).getAllByRole('tab');
    expect(sections.map((tab) => tab.textContent)).toEqual(SECTION_LABELS);
    expect(sections[0]).toHaveAttribute('aria-selected', 'true');

    const installed = await screen.findByTestId('software-view-installed');
    expect(installed).toHaveAttribute('data-device-id', 'dev-a');
    expect(installed).toHaveAttribute('data-active', 'true');
    expect(mountedSoftwareViews()).toEqual(['installed']);
  });

  it('each section mounts exactly its own view, active and bound to the open device', async () => {
    render(<DeviceDetailDrawer open device={deviceA} onClose={vi.fn()} />);
    await openSoftwareTab();

    for (const [index, label] of SECTION_LABELS.entries()) {
      fireEvent.click(within(sectionTablist()).getByRole('tab', { name: label }));
      const view = await screen.findByTestId(`software-view-${SECTION_KEYS[index]}`);
      expect(view).toHaveAttribute('data-active', 'true');
      expect(view).toHaveAttribute('data-device-id', 'dev-a');
      expect(mountedSoftwareViews()).toEqual([SECTION_KEYS[index]]);
    }
  });

  it('keeps the chosen section when the operator leaves Yazılımlar and comes back', async () => {
    render(<DeviceDetailDrawer open device={deviceA} onClose={vi.fn()} />);
    await openSoftwareTab();
    fireEvent.click(within(sectionTablist()).getByRole('tab', { name: 'Katalog' }));
    await screen.findByTestId('software-view-catalog');

    fireEvent.click(within(screen.getAllByRole('tablist')[0]).getByRole('tab', { name: 'Detay' }));
    expect(screen.queryByTestId('software-tab')).toBeNull();
    expect(mountedSoftwareViews()).toEqual([]);

    await openSoftwareTab();
    expect(within(sectionTablist()).getByRole('tab', { name: 'Katalog' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByTestId('software-view-catalog')).toHaveAttribute(
      'data-active',
      'true',
    );
  });

  it('starts a newly selected device on Detay and on the installed section', async () => {
    const { rerender } = render(<DeviceDetailDrawer open device={deviceA} onClose={vi.fn()} />);
    await openSoftwareTab();
    fireEvent.click(within(sectionTablist()).getByRole('tab', { name: 'Yasaklı' }));
    await screen.findByTestId('software-view-prohibited');

    rerender(<DeviceDetailDrawer open device={deviceB} onClose={vi.fn()} />);
    expect(screen.queryByTestId('software-tab')).toBeNull();

    await openSoftwareTab();
    expect(within(sectionTablist()).getByRole('tab', { name: 'Yüklü' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByTestId('software-view-installed')).toHaveAttribute(
      'data-device-id',
      'dev-b',
    );
  });
});
