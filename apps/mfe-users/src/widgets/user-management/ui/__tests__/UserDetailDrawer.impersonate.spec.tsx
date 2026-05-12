// @vitest-environment jsdom
//
// Codex 019e1bed C-prime AGREE — regression test for the live testai bug
// where the impersonation visibility gate `isAdmin = isSuperAdmin()` failed
// even though backend `/api/v1/authz/me` returned `superAdmin: true`. mfe-
// users' Vite alias for `@mfe/auth` bypasses Module Federation shared-
// singleton registration, so the remote ends up with a duplicated
// `PermissionContext` whose default `isSuperAdmin: () => false` overrides
// the shell's hydrated state.
//
// This test reproduces the exact live divergence:
//   usePermissions().isSuperAdmin() === false  (local context default)
//   getShellServices().auth.isSuperAdmin() === true  (shell singleton)
//
// Expectation: the drawer's impersonation section renders, because the
// gate now reads through shell auth instead of usePermissions. Prior to
// the C-prime fix this assertion would fail — drawer would render the
// three legacy sections (Profil/Roller/Veri Erişimi) but no
// `[data-testid="impersonate-action"]`.

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------- mocks (must be defined BEFORE the SUT import) ----------

// Local PermissionContext returns the broken default — mirrors the
// production behaviour mfe-users used to ship before C-prime.
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

// Shell auth singleton reports superAdmin=true — what live cluster
// actually has after PR #403 + the existing shell PermissionProvider
// hydration via `/api/v1/authz/me`.
const mockShellAuth = vi.hoisted(() => ({
  getToken: () => 'fake-token',
  getUser: () => ({ userId: '1' }),
  ready: () => Promise.resolve({ ok: true as const }),
  isTransportReady: () => true,
  getPhase: () => 'transportReady' as const,
  getEpoch: () => 0,
  enterImpersonationSession: vi.fn(),
  exitImpersonationSession: vi.fn(),
  isImpersonating: vi.fn(() => false),
  isSuperAdmin: vi.fn(() => true),
  onTokenChange: () => () => undefined,
}));

vi.mock('../../../../app/services/shell-services', () => ({
  getShellServices: () => ({
    auth: mockShellAuth,
    http: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
    notify: { push: vi.fn() },
    telemetry: { emit: vi.fn() },
  }),
  configureShellServices: vi.fn(),
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
  logExpected: vi.fn(),
  registerAuthTokenResolver: vi.fn(),
}));

vi.mock('../../../../features/user-management/model/use-users-query.model', () => ({
  useUserMutations: () => ({
    toggleStatusMutation: { mutate: vi.fn(), isPending: false },
    updateSessionTimeoutMutation: { mutate: vi.fn(), isPending: false },
  }),
}));

// Design-system primitives — render minimally so we can find the
// Impersonate testid without depending on the full DS bundle.
vi.mock('@mfe/design-system', () => {
  const FormDrawer = ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div role="dialog">{children}</div> : null;
  return {
    FormDrawer,
    Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Checkbox: ({ checked }: { checked: boolean }) => (
      <input type="checkbox" checked={checked} readOnly />
    ),
    Skeleton: () => <div data-testid="skeleton" />,
    Avatar: () => <div data-testid="avatar" />,
    Combobox: () => <div data-testid="combobox" />,
  };
});

// ---------- SUT ----------

import UserDetailDrawer from '../UserDetailDrawer.ui';

const buildUser = (overrides?: Partial<{ id: string; email: string; fullName: string }>) => ({
  id: '42',
  email: 'd35-granted@example.com',
  fullName: 'D35 Granted Persona',
  status: 'ACTIVE' as const,
  roles: [],
  sessionTimeoutMinutes: 15,
  ...overrides,
});

const renderDrawer = (user = buildUser()) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UserDetailDrawer open={true} onClose={vi.fn()} user={user as never} />
    </QueryClientProvider>,
  );
};

describe('UserDetailDrawer — Codex 019e1bed C-prime: shell-auth impersonation gate', () => {
  beforeEach(() => {
    mockPermissions.isSuperAdmin.mockReset().mockReturnValue(false);
    mockPermissions.hasModule.mockReset().mockReturnValue(false);
    mockShellAuth.isSuperAdmin.mockReset().mockReturnValue(true);
    mockShellAuth.isImpersonating.mockReset().mockReturnValue(false);
  });

  it('mounts ImpersonateAction when local usePermissions reports superAdmin=false but shell auth reports true', async () => {
    renderDrawer();
    await waitFor(() => {
      expect(screen.queryByTestId('impersonate-action')).toBeTruthy();
    });
    // Live regression invariant: local context default (false) MUST NOT
    // gate this away when shell singleton says true.
    expect(mockPermissions.isSuperAdmin()).toBe(false);
    expect(mockShellAuth.isSuperAdmin()).toBe(true);
  });

  it('hides ImpersonateAction when shell auth reports superAdmin=false (fail-closed)', async () => {
    mockShellAuth.isSuperAdmin.mockReturnValue(false);
    renderDrawer();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeTruthy();
    });
    expect(screen.queryByTestId('impersonate-action')).toBeNull();
  });

  it('hides ImpersonateAction during active impersonation (nested-guard)', async () => {
    mockShellAuth.isImpersonating.mockReturnValue(true);
    renderDrawer();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeTruthy();
    });
    expect(screen.queryByTestId('impersonate-action')).toBeNull();
  });

  it('hides ImpersonateAction when getShellServices throws (try/catch fail-closed)', async () => {
    mockShellAuth.isSuperAdmin.mockImplementation(() => {
      throw new Error('Shell auth not configured');
    });
    renderDrawer();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeTruthy();
    });
    expect(screen.queryByTestId('impersonate-action')).toBeNull();
  });
});
