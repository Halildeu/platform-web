// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHeaderNavigation } from '../useHeaderNavigation';

/* ---- mocks ---- */

const permissionsMock = {
  hasModule: vi.fn((_m: string) => false),
  isSuperAdmin: vi.fn(() => false),
};

let currentPath = '/home';
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: currentPath }),
}));

vi.mock('@mfe/auth', () => ({
  usePermissions: () => permissionsMock,
}));

vi.mock('../../../store/store.hooks', () => ({
  useAppSelector: (sel: (s: unknown) => unknown) => sel({ auth: { initialized: true } }),
}));

vi.mock('../../../i18n', () => ({
  useShellCommonI18n: () => ({ t: (k: string) => k }),
}));

let suggestionsEnabled = true;
let ethicEnabled = true;
let endpointAdminEnabled = true;
let meetingEnabled = true;
vi.mock('../../../shell-navigation', () => ({
  isSuggestionsRemoteEnabled: () => suggestionsEnabled,
  isEthicRemoteEnabled: () => ethicEnabled,
  isEndpointAdminRemoteEnabled: () => endpointAdminEnabled,
  isMeetingRemoteEnabled: () => meetingEnabled,
}));

const groupKeys = () =>
  renderHook(() => useHeaderNavigation()).result.current.groups.map((g) => g.key);

const hrItems = () => {
  const hr = renderHook(() => useHeaderNavigation()).result.current.groups.find(
    (g) => g.key === 'hr',
  );
  return (hr?.items ?? []).map((i) => i.key);
};

const adminItems = () => {
  const admin = renderHook(() => useHeaderNavigation()).result.current.groups.find(
    (g) => g.key === 'admin',
  );
  return (admin?.items ?? []).map((i) => i.key);
};

describe('useHeaderNavigation — İK (HR) mega-menu module gating', () => {
  beforeEach(() => {
    currentPath = '/home';
    suggestionsEnabled = true;
    ethicEnabled = true;
    endpointAdminEnabled = true;
    permissionsMock.hasModule.mockImplementation(() => false);
    meetingEnabled = true;
    permissionsMock.isSuperAdmin.mockImplementation(() => false);
  });

  it('hides the HR group entirely for a user with no modules', () => {
    // Regression: Öneriler/Etik had no `module`, so the İK group showed
    // (via `any-child`) to any authenticated user even with zero modules,
    // and the items led to /unauthorized once route guards were added.
    // suggestions→SUGGESTIONS, ethic→ETHIC, compensation/demographic→REPORT
    // are all gated now → no visible child → İK group dropped.
    expect(groupKeys()).not.toContain('hr');
  });

  it('shows the HR group with only Öneriler when SUGGESTIONS is granted', () => {
    permissionsMock.hasModule.mockImplementation((m) => m === 'SUGGESTIONS');
    expect(groupKeys()).toContain('hr');
    expect(hrItems()).toEqual(['suggestions']);
  });

  it('ETHIC grant shows the top-level Ethics group, not an HR line', () => {
    // Etik moved out of İK to its own top-level group (separately-sellable
    // product, ADR-0049); the İK dropdown no longer carries it at all.
    permissionsMock.hasModule.mockImplementation((m) => m === 'ETHIC');
    expect(hrItems()).toEqual([]);
    expect(groupKeys()).toContain('ethics');
  });

  it('shows all HR items for a super admin', () => {
    permissionsMock.isSuperAdmin.mockImplementation(() => true);
    expect(hrItems()).toEqual([
      'suggestions',
      'ats-product-hub',
      'compensation',
      'demographic',
    ]);
  });

  it('the Ethics group carries its goal-shaped work queues, module-gated', () => {
    permissionsMock.hasModule.mockImplementation((m) => m === 'ETHIC');
    const ethics = renderHook(() => useHeaderNavigation()).result.current.groups.find(
      (group) => group.key === 'ethics',
    );
    expect(ethics?.items.map((item) => item.key)).toEqual([
      'ethics-cases',
      'ethics-unattended',
      'ethics-ack-due',
    ]);
    // The deep links are intents the case screen honours (?odak=).
    expect(ethics?.items.map((item) => item.path)).toEqual([
      '/admin/ethics',
      '/admin/ethics?odak=sahipsiz',
      '/admin/ethics?odak=teyit',
    ]);
  });

  it('without the ETHIC module the Ethics group does not exist at all', () => {
    permissionsMock.hasModule.mockImplementation((m) => m === 'REPORT');
    expect(groupKeys()).not.toContain('ethics');
  });

  it('shows the ATS Product Hub with only its module grant and no remote-readiness gate', () => {
    permissionsMock.hasModule.mockImplementation((module) => module === 'ATS');
    expect(groupKeys()).toContain('hr');
    expect(hrItems()).toEqual(['ats-product-hub']);
  });

  it('keeps the product-hub item active while the separate live module is open', () => {
    currentPath = '/admin/interview-evidence/readiness';
    permissionsMock.hasModule.mockImplementation(
      (module) => module === 'ATS' || module === 'INTERVIEW_EVIDENCE',
    );

    const result = renderHook(() => useHeaderNavigation()).result.current;
    expect(result.activeGroupKey).toBe('hr');
    expect(result.activeItemKey).toBe('ats-product-hub');
  });

  it('keeps the remote-flag gate independent of the module gate', () => {
    // SUGGESTIONS granted but the suggestions remote is disabled → the
    // item is still dropped; module access does not override deploy state.
    permissionsMock.hasModule.mockImplementation((m) => m === 'SUGGESTIONS');
    suggestionsEnabled = false;
    expect(hrItems()).not.toContain('suggestions');
  });
});

describe('useHeaderNavigation — Yönetim (admin) mega-menu endpointAdmin gating', () => {
  beforeEach(() => {
    currentPath = '/home';
    suggestionsEnabled = true;
    ethicEnabled = true;
    endpointAdminEnabled = true;
    permissionsMock.hasModule.mockImplementation(() => false);
    permissionsMock.isSuperAdmin.mockImplementation(() => false);
  });

  it('shows endpointAdmin under Yönetim when ENDPOINT_ADMIN module is granted and remote enabled', () => {
    permissionsMock.hasModule.mockImplementation((m) => m === 'ENDPOINT_ADMIN');
    expect(adminItems()).toContain('endpointAdmin');
  });

  it('hides endpointAdmin when ENDPOINT_ADMIN module granted but remote disabled', () => {
    // Remote off (build/deploy capability gate) must drop the item even if
    // the per-user OpenFGA module gate would otherwise allow it. Same pattern
    // as suggestions/ethic.
    permissionsMock.hasModule.mockImplementation((m) => m === 'ENDPOINT_ADMIN');
    endpointAdminEnabled = false;
    expect(adminItems()).not.toContain('endpointAdmin');
  });

  it('hides endpointAdmin when remote enabled but ENDPOINT_ADMIN module not granted', () => {
    // Module gate independently blocks the item.
    endpointAdminEnabled = true;
    expect(adminItems()).not.toContain('endpointAdmin');
  });

  it('shows endpointAdmin for super admin when remote enabled', () => {
    permissionsMock.isSuperAdmin.mockImplementation(() => true);
    expect(adminItems()).toContain('endpointAdmin');
  });

  it('hides endpointAdmin for super admin when remote disabled', () => {
    permissionsMock.isSuperAdmin.mockImplementation(() => true);
    endpointAdminEnabled = false;
    expect(adminItems()).not.toContain('endpointAdmin');
  });
  describe('Meetings — any-of module gating', () => {
    // Meetings was reachable ONLY from the old flat sidebar; the header had no
    // entry, so the grouped navigation was silently incomplete. Access is
    // any-of: MEETING covers the admin, TRANSCRIPT the analyst.
    it('shows the meetings group for a TRANSCRIPT-only user', () => {
      permissionsMock.hasModule.mockImplementation((m) => m === 'TRANSCRIPT');
      expect(groupKeys()).toContain('meetings');
    });

    it('shows the meetings group for a MEETING-only user', () => {
      permissionsMock.hasModule.mockImplementation((m) => m === 'MEETING');
      expect(groupKeys()).toContain('meetings');
    });

    it('hides meetings with neither module', () => {
      permissionsMock.hasModule.mockImplementation(() => false);
      expect(groupKeys()).not.toContain('meetings');
    });

    it('hides meetings when the remote is disabled even with the module', () => {
      permissionsMock.hasModule.mockImplementation((m) => m === 'MEETING');
      meetingEnabled = false;
      expect(groupKeys()).not.toContain('meetings');
    });
  });

});
