// @vitest-environment jsdom
//
// iter-34 diagnostic — Reproduce the screenshot bug:
// "Drawer'da rol checkbox'ları cursor: not-allowed (disabled), yetki atayamıyorum."
//
// Backend log (live test cluster) confirms /authz/me returns superAdmin: true
// for the logged-in admin@example.com (userId=1). UI still disables the role
// checkboxes. We isolate the canEdit decision tree here so we can prove
// whether the bug is in the drawer's source-of-truth wiring or downstream.
//
// canEdit formula (UserDetailDrawer.ui.tsx:79):
//   canEdit = !sessionExpired && (isAdmin || hasModule('USER_MANAGEMENT'))
//   isAdmin = isSuperAdmin()
//
// We render the drawer with a controlled mock for usePermissions and assert
// the "disabled" attribute on the role checkboxes. This is the same gating
// the screenshot shows.

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------- mocks (must be defined BEFORE the SUT import) ----------

const mockPermissions = vi.hoisted(() => ({
  isSuperAdmin: vi.fn(() => false),
  hasModule: vi.fn(() => false),
  sessionExpired: false,
  initialized: true,
  authz: { userId: '1', superAdmin: false } as Record<string, unknown> | null,
}));

vi.mock('@mfe/auth', () => ({
  usePermissions: () => mockPermissions,
}));

vi.mock('../../../../i18n/useUsersI18n', () => ({
  useUsersI18n: () => ({ t: (k: string) => k, locale: 'tr' }),
}));

vi.mock('../../../../shared/notifications', () => ({
  pushToast: vi.fn(),
}));

vi.mock('@mfe/shared-http', () => ({
  api: {
    get: vi.fn(async () => ({
      data: [
        { id: 1, name: 'ADMIN' },
        { id: 2, name: 'USER_VIEWER' },
      ],
    })),
    post: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({ data: {} })),
    put: vi.fn(async () => ({ data: {} })),
  },
}));

vi.mock('../../../../features/user-management/model/use-users-query.model', () => ({
  useUserMutations: () => ({
    toggleStatusMutation: { mutate: vi.fn(), isPending: false },
    updateSessionTimeoutMutation: { mutate: vi.fn(), isPending: false },
  }),
}));

// Render Checkbox as a real <input type="checkbox" disabled> so we can probe
// the disabled attribute. Strip everything else on the design-system surface
// to keep the test narrow.
vi.mock('@mfe/design-system', () => ({
  DetailDrawer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drawer">{children}</div>
  ),
  Tabs: () => <div data-testid="tabs" />,
  Checkbox: ({
    label,
    checked,
    disabled,
    onChange,
  }: {
    label: React.ReactNode;
    checked?: boolean;
    disabled?: boolean;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  }) => (
    <label data-testid={`role-${typeof label === 'string' ? label : 'unknown'}`}>
      <input type="checkbox" checked={!!checked} disabled={!!disabled} onChange={onChange} />
      <span>{label}</span>
    </label>
  ),
}));

// ---------- SUT ----------

import UserDetailDrawer from '../UserDetailDrawer.ui';
import type { UserDetail } from '@mfe/shared-types';

const TEST_USER: UserDetail = {
  id: '2',
  fullName: 'Test User',
  email: 'testuser@testai.acik.com',
  role: 'Standart Kullanıcı',
  status: 'ACTIVE',
  modulePermissions: [],
  sessionTimeoutMinutes: 15,
};

const renderDrawer = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <UserDetailDrawer open onClose={() => {}} user={TEST_USER} />
    </QueryClientProvider>,
  );
};

const findFirstRoleCheckbox = async (): Promise<HTMLInputElement> => {
  // After the rolesQuery resolves the drawer renders one Checkbox per role.
  await waitFor(() => {
    const adminLabel = screen.queryByTestId('role-ADMIN');
    expect(adminLabel).not.toBeNull();
  });
  return screen
    .getByTestId('role-ADMIN')
    .querySelector<HTMLInputElement>('input[type="checkbox"]')!;
};

beforeEach(() => {
  mockPermissions.isSuperAdmin.mockReset().mockReturnValue(false);
  mockPermissions.hasModule.mockReset().mockReturnValue(false);
  mockPermissions.sessionExpired = false;
  mockPermissions.initialized = true;
  mockPermissions.authz = { userId: '1', superAdmin: false };
});

describe('UserDetailDrawer.canEdit — role checkbox disabled matrix', () => {
  it('superAdmin=true + sessionExpired=false → role checkbox NOT disabled', async () => {
    mockPermissions.isSuperAdmin.mockReturnValue(true);
    mockPermissions.sessionExpired = false;
    renderDrawer();
    const cb = await findFirstRoleCheckbox();
    expect(cb.disabled).toBe(false);
  });

  it('superAdmin=false + hasModule=USER_MANAGEMENT → role checkbox NOT disabled', async () => {
    mockPermissions.isSuperAdmin.mockReturnValue(false);
    mockPermissions.hasModule.mockImplementation((mod: string) => mod === 'USER_MANAGEMENT');
    mockPermissions.sessionExpired = false;
    renderDrawer();
    const cb = await findFirstRoleCheckbox();
    expect(cb.disabled).toBe(false);
  });

  it('superAdmin=true + sessionExpired=TRUE → role checkbox DISABLED (session expired wins)', async () => {
    mockPermissions.isSuperAdmin.mockReturnValue(true);
    mockPermissions.sessionExpired = true;
    renderDrawer();
    const cb = await findFirstRoleCheckbox();
    expect(cb.disabled).toBe(true);
  });

  it('superAdmin=false + hasModule=false → role checkbox DISABLED (no permission)', async () => {
    mockPermissions.isSuperAdmin.mockReturnValue(false);
    mockPermissions.hasModule.mockReturnValue(false);
    mockPermissions.sessionExpired = false;
    renderDrawer();
    const cb = await findFirstRoleCheckbox();
    expect(cb.disabled).toBe(true);
  });

  // iter-35c — loading-state fallback. Live capture (Playwright on
  // testai.acik.com) showed the drawer mounting before authz settled.
  // Pre-fix the gate flipped to disabled and the user was stuck at
  // cursor:not-allowed even though /authz/me was about to return
  // superAdmin:true. While authz is still loading the safer default is
  // "interactive" — the backend is the final authority.
  it('initialized=false (authz loading) → role checkbox NOT disabled (iter-35c)', async () => {
    mockPermissions.isSuperAdmin.mockReturnValue(false);
    mockPermissions.hasModule.mockReturnValue(false);
    mockPermissions.sessionExpired = false;
    mockPermissions.initialized = false;
    mockPermissions.authz = null;
    renderDrawer();
    const cb = await findFirstRoleCheckbox();
    expect(cb.disabled).toBe(false);
  });

  it('initialized=true + authz=null (transient null) → role checkbox NOT disabled (iter-35c)', async () => {
    mockPermissions.isSuperAdmin.mockReturnValue(false);
    mockPermissions.hasModule.mockReturnValue(false);
    mockPermissions.sessionExpired = false;
    mockPermissions.initialized = true;
    mockPermissions.authz = null;
    renderDrawer();
    const cb = await findFirstRoleCheckbox();
    expect(cb.disabled).toBe(false);
  });
});
