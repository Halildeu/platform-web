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
// iter-38 — SUT migrated DetailDrawer → FormDrawer; mock both with the
// same shell so probe testids stay stable. iter-39 — Skeleton stub.
// `vi.mock` hoists above all top-level declarations so we declare the
// shell inline within the factory.
vi.mock('@mfe/design-system', () => {
  const drawerShell = ({
    children,
    footer,
    subtitle,
    title,
  }: {
    children: React.ReactNode;
    footer?: React.ReactNode;
    subtitle?: React.ReactNode;
    title?: React.ReactNode;
  }) => (
    <div data-testid="drawer">
      <div data-testid="drawer-title">{title}</div>
      {subtitle ? <div data-testid="drawer-subtitle">{subtitle}</div> : null}
      <div data-testid="drawer-body">{children}</div>
      {footer ? <div data-testid="drawer-footer">{footer}</div> : null}
    </div>
  );
  return {
    DetailDrawer: drawerShell,
    FormDrawer: drawerShell,
    // iter-43 — Avatar primitive used in drawer header leading slot.
    // Stubbed as a passthrough so canEdit tests don't break, but
    // initials still surface in the DOM for any future probe.
    Avatar: ({ initials, alt }: { initials?: string; alt?: string }) => (
      <span data-testid="avatar" aria-hidden="true" aria-label={alt}>
        {initials}
      </span>
    ),
    Skeleton: ({ className }: { className?: string }) => (
      <div data-testid="skeleton" className={className} />
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
    }) => {
      // iter-37 — labels are React fragments (label + description); probe
      // the first textual leaf for the role-${name} testid.
      const probeFirstText = (node: React.ReactNode): string => {
        if (node == null) return 'unknown';
        if (typeof node === 'string' || typeof node === 'number') return String(node);
        if (Array.isArray(node)) {
          for (const c of node) {
            const v = probeFirstText(c);
            if (v && v !== 'unknown') return v;
          }
          return 'unknown';
        }
        if (React.isValidElement(node)) {
          const props = node.props as { children?: React.ReactNode };
          return probeFirstText(props.children);
        }
        return 'unknown';
      };
      const labelKey = probeFirstText(label).split('(')[0].trim() || 'unknown';
      return (
        <label data-testid={`role-${labelKey}`}>
          <input type="checkbox" checked={!!checked} disabled={!!disabled} onChange={onChange} />
          <span>{label}</span>
        </label>
      );
    },
  };
});

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
  // iter-37 — labels are now resolved through resolveRoleMeta(); ADMIN
  // shows up as testid="role-Yönetici" (Turkish locale, default in tests).
  await waitFor(() => {
    const adminLabel = screen.queryByTestId('role-Yönetici');
    expect(adminLabel).not.toBeNull();
  });
  return screen
    .getByTestId('role-Yönetici')
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

// iter-36 P0 Save Safety — load/error guard prevents silent data loss when
// the assignment queries fail. Pre-iter-36 a transient 5xx on the user-roles
// or user-scopes endpoint silently rendered "no roles, no scopes" and the
// Save button stayed enabled — saving in that state wiped the user's actual
// access. The fix: query exposes its error, drawer surfaces a banner and
// disables Save until refetch succeeds.
describe('UserDetailDrawer.iter36 — load error guard', () => {
  beforeEach(() => {
    mockPermissions.isSuperAdmin.mockReset().mockReturnValue(true);
    mockPermissions.hasModule.mockReset().mockReturnValue(false);
    mockPermissions.sessionExpired = false;
    mockPermissions.initialized = true;
    mockPermissions.authz = { userId: '1', superAdmin: true };
  });

  it('shows the load-error banner when /v1/authz/users/{id}/roles fails', async () => {
    // Override the api mock so /v1/authz/users/.../roles rejects.
    const sharedHttp = await import('@mfe/shared-http');
    const apiMock = (sharedHttp as { api: { get: ReturnType<typeof vi.fn> } }).api;
    apiMock.get.mockImplementation(async (url: string) => {
      if (url.includes('/authz/users/') && url.endsWith('/roles')) {
        throw new Error('boom');
      }
      // Other queries — return what they normally would.
      if (url === '/v1/roles') return { data: [{ id: 1, name: 'ADMIN' }] };
      // PR-FE-5 (Codex 019e0954 iter-1 AGREE absorb, 2026-05-08):
      // backend `/v1/roles/users/{id}/scopes` returns the canonical
      // `List<ScopeSummaryDto>` array — NOT the grouped object shape
      // this mock previously used. The drawer's userScopesQuery now
      // parses the array into grouped IDs locally, so the mock must
      // emit the realistic array shape (empty here, since these test
      // cases focus on the assignment-query error banner / disabled
      // Save flow rather than scope rendering).
      if (url.includes('/scopes'))
        return { data: [] as Array<{ scopeType: string; scopeRefId: number }> };
      return { data: [] };
    });

    renderDrawer();

    await waitFor(
      () => {
        const banner = screen.queryByTestId('drawer-load-error-banner');
        expect(banner).not.toBeNull();
      },
      { timeout: 4000 },
    );
  });

  // PR-FE-8 (2026-05-09): Save button removed in favor of auto-save.
  // The assignment-load-error guard now surfaces a load-error message
  // in the footer status indicator instead of disabling a Save button.
  // The new assertion: footer renders `drawer-autosave-load-error`,
  // and no POST /v1/authz/users/{id}/assignments fires (the autosave
  // gate stays closed when assignmentLoadError is true via the seed
  // effect's early return on isError).
  it('PR-FE-8: surfaces load-error footer message + blocks auto-save POST', async () => {
    const sharedHttp = await import('@mfe/shared-http');
    const apiMock = (
      sharedHttp as { api: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> } }
    ).api;
    apiMock.get.mockImplementation(async (url: string) => {
      if (url.includes('/authz/users/') && url.endsWith('/roles')) {
        throw new Error('boom');
      }
      if (url === '/v1/roles') return { data: [{ id: 1, name: 'ADMIN' }] };
      if (url.includes('/scopes'))
        return { data: [] as Array<{ scopeType: string; scopeRefId: number }> };
      return { data: [] };
    });
    apiMock.post.mockClear();

    renderDrawer();

    await waitFor(
      () => {
        const errorMsg = screen.queryByTestId('drawer-autosave-load-error');
        expect(
          errorMsg,
          'PR-FE-8 load-error footer message must render under load-error',
        ).not.toBeNull();
      },
      { timeout: 4000 },
    );

    // Wait past the debounce window plus a buffer to confirm the
    // observer effect did not fire a save.
    await new Promise((r) => setTimeout(r, 700));
    const assignmentPosts = apiMock.post.mock.calls.filter(([url]) =>
      String(url).includes('/assignments'),
    );
    expect(
      assignmentPosts.length,
      'PR-FE-8: assignmentLoadError must keep the autosave gate closed',
    ).toBe(0);
  });

  // PR-FE-8 (2026-05-09): the legacy "dirty hint + Save button" footer
  // pattern was replaced with an auto-save status indicator. Footer
  // now renders unconditionally for canEdit users (no Save button to
  // gate on dirty), and after the initial seed completes it shows the
  // "saved" indicator. We verify the footer slot is populated and the
  // saved-state testid is rendered.
  it('PR-FE-8: footer renders auto-save status indicator (no Save button)', async () => {
    // Reset api.get implementation — the previous test in this
    // describe block leaves the /authz/users/{id}/roles error stub
    // in place; vi.clearAllMocks does not reset mockImplementation,
    // and the file-level beforeEach lives in the OUTER describe.
    // Without this, userRolesQuery would still error and the seed
    // effect would early-return on isError, never reaching the
    // 'saved' status the test asserts on.
    const sharedHttp = await import('@mfe/shared-http');
    const apiMock = (sharedHttp as { api: { get: ReturnType<typeof vi.fn> } }).api;
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/v1/roles') return { data: [{ id: 1, name: 'ADMIN' }] };
      if (url.includes('/authz/users/') && url.endsWith('/roles')) {
        return { data: [{ roleId: 1 }] };
      }
      if (url.includes('/scopes')) {
        return { data: [] as Array<{ scopeType: string; scopeRefId: number }> };
      }
      return { data: [] };
    });

    renderDrawer();
    await waitFor(() => {
      const footer = screen.queryByTestId('drawer-footer');
      expect(footer, 'footer slot should be populated').not.toBeNull();
    });
    // Pre-PR-FE-8 looked for `drawer-save-button`; that no longer
    // exists. The auto-save model puts a status indicator in its place.
    const savedIndicator = await screen.findByTestId('drawer-autosave-saved', undefined, {
      timeout: 4000,
    });
    expect(savedIndicator).toBeTruthy();
    // No legacy Save button should remain.
    expect(screen.queryByTestId('drawer-save-button')).toBeNull();
  });
});
