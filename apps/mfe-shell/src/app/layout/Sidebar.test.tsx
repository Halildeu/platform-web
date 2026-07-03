// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Sidebar, buildSidebarNavItems } from './Sidebar';

const dispatchMock = vi.fn();
const pushNotificationMock = vi.fn((payload: Record<string, unknown>) => ({
  type: 'notifications/push',
  payload,
}));
const toggleOpenMock = vi.fn((payload: boolean) => ({ type: 'notifications/toggle', payload }));

const permissionsMock = {
  hasModule: vi.fn(() => true),
  isSuperAdmin: vi.fn(() => false),
  getModuleLevel: vi.fn(() => 'MANAGE'),
  isActionAllowed: vi.fn(() => true),
  isActionDenied: vi.fn(() => false),
  canViewReport: vi.fn(() => true),
  canAccessPage: vi.fn(() => true),
  getUserRoles: vi.fn(() => []),
  canAccessCompany: vi.fn(() => true),
  authz: null,
  initialized: true,
  loading: false,
  refresh: vi.fn(),
};

vi.mock('../store/store.hooks', () => ({
  useAppDispatch: () => dispatchMock,
}));

vi.mock('@mfe/auth', () => ({
  usePermissions: () => permissionsMock,
}));

vi.mock('../../features/notifications/model/notifications.slice', () => ({
  pushNotification: (payload: Record<string, unknown>) => pushNotificationMock(payload),
  toggleOpen: (payload: boolean) => toggleOpenMock(payload),
}));

vi.mock('../auth/auth-config', () => ({
  isPermitAllMode: () => false,
}));

vi.mock('../shell-navigation', () => ({
  isSuggestionsRemoteEnabled: () => true,
  isEthicRemoteEnabled: () => true,
  isMeetingRemoteEnabled: () => true,
}));

const LocationViewer = () => {
  const location = useLocation();
  return <span data-testid="location-display">{location.pathname}</span>;
};

const renderSidebar = (initialPath = '/audit/events') =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <Sidebar />
              <LocationViewer />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

describe('Sidebar', () => {
  beforeEach(() => {
    dispatchMock.mockReset();
    pushNotificationMock.mockClear();
    toggleOpenMock.mockClear();
    permissionsMock.hasModule.mockImplementation(() => true);
    permissionsMock.isSuperAdmin.mockImplementation(() => false);
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  // TODO: ShellSidebar requires ResizeObserver + IntersectionObserver mocks in JSDOM
  it.skip('NavigationRail uzerinden route gecisi yapar ve test-id yuzeyini korur', () => {
    renderSidebar('/audit/events');

    expect(screen.getByLabelText('Sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('nav-home')).toBeInTheDocument();
    expect(screen.getByTestId('nav-dashboard')).toHaveAttribute('aria-current', 'page');

    fireEvent.click(screen.getByTestId('nav-reporting'));

    expect(screen.getByTestId('location-display')).toHaveTextContent('/admin/reports/users');
  });

  it.skip('search dispatch davranisini ve collapsed folders expand akisini korur', () => {
    window.localStorage.setItem('shell.sidebar.mode', 'collapsed');

    renderSidebar('/suggestions');

    fireEvent.click(screen.getByPlaceholderText(/search/i));

    // openCommandPalette now navigates to design-lab with search=open param
    // instead of dispatching pushNotification
    expect(screen.getByTestId('location-display')).toHaveTextContent('/admin/design-lab');

    // Re-render at original path to test folders
    cleanup();
    window.localStorage.setItem('shell.sidebar.mode', 'collapsed');
    renderSidebar('/suggestions');

    fireEvent.click(screen.getByTestId('nav-folders'));
    expect(screen.getByTestId('nav-folders-all')).toBeInTheDocument();
  });
});

describe('buildSidebarNavItems — module gating', () => {
  const denyAll = () => false;
  const allow = (granted: string) => (mod: string) => mod === granted;
  const pick = (items: ReturnType<typeof buildSidebarNavItems>, key: string) =>
    items.find((i) => i.key === key);

  it('gates the schema-explorer item by the THEME module', () => {
    // Regression: schema-explorer previously rendered with an
    // unconditional href and no `disabled` flag, so unauthorized users
    // saw it active and clicking landed on /unauthorized. It must be
    // gated like every other privileged item, matching the
    // /admin/schema-explorer route guard (AppRouter requiredModule="THEME").
    const denied = pick(buildSidebarNavItems(false, denyAll), 'schema-explorer');
    expect(denied?.disabled).toBe(true);
    expect(denied?.href).toBeUndefined();

    const granted = pick(buildSidebarNavItems(false, allow('THEME')), 'schema-explorer');
    expect(granted?.disabled).toBe(false);
    expect(granted?.href).toBe('/admin/schema-explorer');
  });

  it('opens the schema-explorer item for super admins regardless of modules', () => {
    const item = pick(buildSidebarNavItems(true, denyAll), 'schema-explorer');
    expect(item?.disabled).toBe(false);
    expect(item?.href).toBe('/admin/schema-explorer');
  });

  it('gates the meetings item by MEETING or TRANSCRIPT and the meeting remote flag', () => {
    const denied = pick(buildSidebarNavItems(false, denyAll), 'meetings');
    expect(denied?.disabled).toBe(true);
    expect(denied?.href).toBeUndefined();

    const reportOnly = pick(buildSidebarNavItems(false, allow('REPORT')), 'meetings');
    expect(reportOnly?.disabled).toBe(true);
    expect(reportOnly?.href).toBeUndefined();

    const remoteDisabled = pick(buildSidebarNavItems(false, allow('MEETING'), false), 'meetings');
    expect(remoteDisabled?.disabled).toBe(true);
    expect(remoteDisabled?.href).toBeUndefined();

    const meetingGranted = pick(buildSidebarNavItems(false, allow('MEETING')), 'meetings');
    expect(meetingGranted?.disabled).toBe(false);
    expect(meetingGranted?.href).toBe('/admin/meetings');

    const transcriptGranted = pick(buildSidebarNavItems(false, allow('TRANSCRIPT')), 'meetings');
    expect(transcriptGranted?.disabled).toBe(false);
    expect(transcriptGranted?.href).toBe('/admin/meetings');
  });

  it('gates the interview-evidence item by INTERVIEW_EVIDENCE and the remote flag', () => {
    // ATS-0019 mirror of the meetings gate: default-off remote means the item is
    // disabled with no href even when the module is granted. Both the remote flag
    // AND the module (or super-admin) must hold before it links to the route.
    const denied = pick(buildSidebarNavItems(false, denyAll), 'interview-evidence');
    expect(denied?.disabled).toBe(true);
    expect(denied?.href).toBeUndefined();

    // Module granted but remote OFF (default 4th arg false) → still disabled.
    const remoteDisabled = pick(
      buildSidebarNavItems(false, allow('INTERVIEW_EVIDENCE')),
      'interview-evidence',
    );
    expect(remoteDisabled?.disabled).toBe(true);
    expect(remoteDisabled?.href).toBeUndefined();

    // Remote ON but no module → disabled (no ungated leak through the flag).
    const moduleMissing = pick(
      buildSidebarNavItems(false, denyAll, true, true),
      'interview-evidence',
    );
    expect(moduleMissing?.disabled).toBe(true);
    expect(moduleMissing?.href).toBeUndefined();

    // Remote ON + module granted → active link.
    const granted = pick(
      buildSidebarNavItems(false, allow('INTERVIEW_EVIDENCE'), true, true),
      'interview-evidence',
    );
    expect(granted?.disabled).toBe(false);
    expect(granted?.href).toBe('/admin/interview-evidence');

    // Super-admin + remote ON → active even without an explicit module grant.
    const superAdmin = pick(buildSidebarNavItems(true, denyAll, true, true), 'interview-evidence');
    expect(superAdmin?.disabled).toBe(false);
    expect(superAdmin?.href).toBe('/admin/interview-evidence');
  });

  it('keeps every privileged item gated (no ungated leak)', () => {
    // With no modules and no super-admin, only Home stays enabled;
    // every other item must be disabled with no href.
    const items = buildSidebarNavItems(false, denyAll);
    for (const item of items) {
      if (item.key === 'home') {
        expect(item.disabled).toBeFalsy();
        expect(item.href).toBe('/home');
      } else {
        expect(item.disabled).toBe(true);
        expect(item.href).toBeUndefined();
      }
    }
  });
});
