// @vitest-environment jsdom
//
// Codex 019ea409 — user-management action menu authz GATE matrix.
//
// Pins the fix for the live testai bug where the row "İşlemler" menu showed
// only view + impersonate for a super-admin because reset/toggle/grant/revoke
// were gated on the local `@mfe/auth` usePermissions() context, which degrades
// to its no-op default in mfe-users (MF shared-singleton / Vite alias bypass).
//
// Contract pinned here:
//   - All gates read the SHELL auth singleton, never usePermissions().
//   - reset-password / toggle-status (mutations) require MANAGE-level access
//     (super-admin OR module USER_MANAGEMENT=MANAGE) — VIEW is not enough.
//   - grant/revoke super-admin stay super-admin only.
//   - getModuleLevel is optional-chained → an older shell without it fails
//     closed for non-super-admins while the super-admin path still works.

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

type ModuleLevel = 'NONE' | 'VIEW' | 'MANAGE';

const mockShellAuth = vi.hoisted(() => ({
  isSuperAdmin: vi.fn(() => false),
  isImpersonating: vi.fn(() => false),
  getModuleLevel: vi.fn(() => 'NONE' as ModuleLevel),
  getUser: vi.fn(() => ({ id: 'admin-kc-uuid', subscriberId: '1' })),
  onTokenChange: vi.fn(() => () => undefined),
  enterImpersonationSession: vi.fn(async () => undefined),
}));

let mockShellServicesImpl: () => { auth: unknown } = () => ({ auth: mockShellAuth });

vi.mock('../../../../app/services/shell-services', () => ({
  getShellServices: () => mockShellServicesImpl(),
  configureShellServices: vi.fn(),
}));

// The local @mfe/auth context is intentionally the no-op DEFAULT here. The
// whole point of the fix is that the gates no longer depend on it: if the SUT
// regressed to reading usePermissions(), every "visible" assertion below would
// fail because this returns false / NONE for everything.
vi.mock('@mfe/auth', () => ({
  usePermissions: () => ({
    isSuperAdmin: () => false,
    hasModule: () => false,
    getModuleLevel: () => 'NONE',
  }),
}));

vi.mock('../../../../features/user-management/model/use-users-query.model', () => ({
  useUserMutations: () => ({
    resetPasswordMutation: { mutateAsync: vi.fn(), isPending: false },
    toggleStatusMutation: { mutateAsync: vi.fn(), isPending: false },
    grantSuperAdminMutation: { mutateAsync: vi.fn(), isPending: false },
    revokeSuperAdminMutation: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

vi.mock('../../../../i18n/useUsersI18n', () => ({
  useUsersI18n: () => ({ t: (k: string) => k, locale: 'tr' }),
}));

vi.mock('../../../../shared/notifications', () => ({
  pushToast: vi.fn(),
}));

import UserActions from '../UserActions.ui';

const buildUser = (status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE') => ({
  id: 42,
  email: 'target.user@example.com',
  fullName: 'Target User',
  status,
});

const openMenu = () => fireEvent.click(screen.getByText('users.actions.menuLabel'));
const queryItem = (key: string) => screen.queryByText((content) => content.includes(key));

describe('UserActions — user-management gate matrix (Codex 019ea409)', () => {
  beforeEach(() => {
    mockShellAuth.isSuperAdmin.mockReset().mockReturnValue(false);
    mockShellAuth.isImpersonating.mockReset().mockReturnValue(false);
    mockShellAuth.getModuleLevel.mockReset().mockReturnValue('NONE');
    mockShellAuth.getUser.mockReset().mockReturnValue({ id: 'admin-kc-uuid', subscriberId: '1' });
    mockShellAuth.onTokenChange.mockReset().mockReturnValue(() => undefined);
    mockShellServicesImpl = () => ({ auth: mockShellAuth });
  });

  it('super-admin (shell) sees reset/toggle/grant/revoke even when local usePermissions is the no-op default', () => {
    mockShellAuth.isSuperAdmin.mockReturnValue(true);
    // getModuleLevel left NONE on purpose — the super-admin path must NOT
    // depend on it (mirrors the live admin whose modules map is empty in the
    // remote's local context but superAdmin=true in the shell snapshot).
    render(<UserActions user={buildUser('ACTIVE') as never} onSelect={vi.fn()} />);
    openMenu();
    expect(queryItem('users.actions.view')).toBeTruthy();
    expect(queryItem('users.actions.resetPassword')).toBeTruthy();
    expect(queryItem('users.actions.toggleStatus.disable')).toBeTruthy();
    expect(queryItem('users.actions.superAdmin.grant')).toBeTruthy();
    expect(queryItem('users.actions.superAdmin.revoke')).toBeTruthy();
  });

  it('non-super-admin with USER_MANAGEMENT=MANAGE sees reset/toggle but NOT grant/revoke', () => {
    mockShellAuth.getModuleLevel.mockImplementation((m: string) =>
      m === 'USER_MANAGEMENT' ? 'MANAGE' : 'NONE',
    );
    render(<UserActions user={buildUser('ACTIVE') as never} onSelect={vi.fn()} />);
    openMenu();
    expect(queryItem('users.actions.resetPassword')).toBeTruthy();
    expect(queryItem('users.actions.toggleStatus.disable')).toBeTruthy();
    // grant/revoke super-admin remain super-admin only.
    expect(queryItem('users.actions.superAdmin.grant')).toBeNull();
    expect(queryItem('users.actions.superAdmin.revoke')).toBeNull();
  });

  it('non-super-admin with USER_MANAGEMENT=VIEW does NOT see reset/toggle (destructive needs MANAGE)', () => {
    mockShellAuth.getModuleLevel.mockImplementation((m: string) =>
      m === 'USER_MANAGEMENT' ? 'VIEW' : 'NONE',
    );
    render(<UserActions user={buildUser('ACTIVE') as never} onSelect={vi.fn()} />);
    openMenu();
    expect(queryItem('users.actions.view')).toBeTruthy(); // view is always present
    expect(queryItem('users.actions.resetPassword')).toBeNull();
    expect(queryItem('users.actions.toggleStatus.disable')).toBeNull();
    expect(queryItem('users.actions.superAdmin.grant')).toBeNull();
  });

  it('non-super-admin with USER_MANAGEMENT=NONE sees only view (fail-closed)', () => {
    render(<UserActions user={buildUser('ACTIVE') as never} onSelect={vi.fn()} />);
    openMenu();
    expect(queryItem('users.actions.view')).toBeTruthy();
    expect(queryItem('users.actions.resetPassword')).toBeNull();
    expect(queryItem('users.actions.toggleStatus.disable')).toBeNull();
    expect(queryItem('users.actions.superAdmin.grant')).toBeNull();
    expect(queryItem('users.actions.superAdmin.revoke')).toBeNull();
  });

  it('older shell without getModuleLevel: optional-chain fails closed, no throw', () => {
    // Rolling-deploy guard: a remote may briefly run against an older shell
    // build whose auth singleton has no getModuleLevel. The optional-chain
    // must degrade to NONE (not throw) for a non-super-admin.
    mockShellServicesImpl = () => ({
      auth: {
        isSuperAdmin: () => false,
        isImpersonating: () => false,
        getUser: () => ({ id: 'admin-kc-uuid', subscriberId: '1' }),
        onTokenChange: () => () => undefined,
        enterImpersonationSession: async () => undefined,
        // getModuleLevel intentionally ABSENT
      },
    });
    render(<UserActions user={buildUser('ACTIVE') as never} onSelect={vi.fn()} />);
    openMenu();
    expect(queryItem('users.actions.view')).toBeTruthy();
    expect(queryItem('users.actions.resetPassword')).toBeNull();
    expect(queryItem('users.actions.toggleStatus.disable')).toBeNull();
  });
});
