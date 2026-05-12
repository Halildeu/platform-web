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
  // Codex 019e1bed REVISE-2: real shell getUser() returns a UserProfile
  // where `id` is KC subject UUID and `subscriberId` is the canonical
  // numeric platform user id. Test fixture mirrors live shape so the
  // self-guard comparison (drawer reads `subscriberId`) behaves the
  // same in vitest as on testai.
  getUser: () => ({ id: 'admin-kc-uuid-fixture', subscriberId: '1' }),
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

  it('submits enterImpersonationSession without targetSubject property (Codex 019e1bed REVISE-2)', async () => {
    // Regression guard for the original UX bug: the impersonate form
    // used to require operators to type a KC UUID. Backend now
    // resolves it server-side via the service-token protected internal
    // user-service endpoint. The submit payload must NOT include
    // `targetSubject` at all — neither empty string nor a stale UUID
    // — so contract tests and audit logs stay clean.
    mockShellAuth.isSuperAdmin.mockReturnValue(true);
    mockShellAuth.isImpersonating.mockReturnValue(false);
    mockShellAuth.enterImpersonationSession.mockResolvedValue(undefined);
    renderDrawer();
    const { fireEvent } = await import('@testing-library/react');
    // Open the form
    const openBtn = await screen.findByTestId('impersonate-open-btn');
    fireEvent.click(openBtn);
    const reasonInput = await screen.findByTestId('impersonate-reason');
    fireEvent.change(reasonInput, {
      target: { value: 'Codex 019e1bed contract regression guard for omitted targetSubject' },
    });
    const submitBtn = await screen.findByTestId('impersonate-submit-btn');
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(mockShellAuth.enterImpersonationSession).toHaveBeenCalled();
    });
    const callArgs = mockShellAuth.enterImpersonationSession.mock.calls[0][0];
    expect(callArgs).toEqual(
      expect.objectContaining({
        targetUserId: 42,
        targetEmail: 'd35-granted@example.com',
        reason: expect.stringContaining('Codex 019e1bed'),
      }),
    );
    expect(callArgs).not.toHaveProperty('targetSubject');
  });

  it('hides ImpersonateAction when target user is the current admin (self-guard, PR #411)', async () => {
    // Codex 019e1bed REVISE-2 — self-impersonation guard regression.
    // Live shell `getUser().subscriberId` equals the platform user id;
    // when the target row in the admin grid is the admin themselves the
    // drawer must hide the action even if shell superAdmin=true.
    mockShellAuth.isSuperAdmin.mockReturnValue(true);
    mockShellAuth.isImpersonating.mockReturnValue(false);
    // Test fixture admin subscriberId = '1' (see getUser mock above).
    const selfUser = buildUser({ id: '1', email: 'admin@example.com', fullName: 'Admin Self' });
    renderDrawer(selfUser);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeTruthy();
    });
    expect(screen.queryByTestId('impersonate-action')).toBeNull();
  });

  it('does not crash when drawer mounts with user=null and shell superAdmin=true (PR #408 regression guard)', () => {
    // Codex 019e1bed PR #408 root cause — UserDetailDrawer is always
    // mounted by UsersPage and only toggles `open`. Prior C-prime PR
    // evaluated Boolean(user.id) unconditionally; when shell reports
    // superAdmin=true the short-circuit walked into user.id and crashed
    // the entire UsersApp on the live cluster ("Cannot read properties
    // of null (reading 'id')"). This test reproduces that exact mount
    // shape: shell auth true, drawer open=false, user=null.
    mockShellAuth.isSuperAdmin.mockReturnValue(true);
    mockShellAuth.isImpersonating.mockReturnValue(false);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    expect(() => {
      render(
        <QueryClientProvider client={queryClient}>
          <UserDetailDrawer open={false} onClose={vi.fn()} user={null as never} />
        </QueryClientProvider>,
      );
    }).not.toThrow();

    // Drawer closed → no dialog, no impersonate-action either way.
    expect(screen.queryByTestId('impersonate-action')).toBeNull();
  });
});
