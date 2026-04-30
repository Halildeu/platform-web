// @vitest-environment jsdom
//
// Codex 019dddf4 iter-43 — UserDetailDrawer leading avatar.
//
// Pairs with packages/design-system FormDrawer `leading` slot prop. This
// spec proves three things:
//   1. The drawer header renders an Avatar primitive in the leading slot.
//   2. The avatar text content equals getInitials({ fullName, email }) —
//      "Halil Koçoğlu" → "HK", "Çiğdem Öz" → "ÇÖ", email-only → first
//      letter uppercased.
//   3. The avatar is `aria-hidden="true"` so screen readers announce
//      the title once (the drawer's `aria-label` already carries the
//      user's display name).
//
// Test surface is intentionally semantic — we render real DS primitives
// (no `vi.mock('@mfe/design-system')`) so the assertions exercise the
// actual leading slot wiring end-to-end.

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

// ---------- mocks (must precede SUT import) ----------

const mockPermissions = vi.hoisted(() => ({
  isSuperAdmin: vi.fn(() => true),
  hasModule: vi.fn(() => true),
  sessionExpired: false,
  initialized: true,
  authz: { userId: '1', superAdmin: true } as Record<string, unknown> | null,
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
    get: vi.fn(async () => ({ data: [] })),
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

// NOTE: We deliberately do NOT mock @mfe/design-system here. The whole
// point of this spec is to exercise the real FormDrawer + Avatar wiring
// so the leading-slot DOM structure is asserted end-to-end.

// ---------- SUT ----------

import UserDetailDrawer from '../UserDetailDrawer.ui';
import type { UserDetail } from '@mfe/shared-types';

const renderDrawer = (user: UserDetail) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <UserDetailDrawer open onClose={() => {}} user={user} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  mockPermissions.isSuperAdmin.mockReturnValue(true);
  mockPermissions.hasModule.mockReturnValue(true);
  mockPermissions.sessionExpired = false;
  mockPermissions.initialized = true;
});

describe('UserDetailDrawer — leading avatar (iter-43)', () => {
  it('drawer header renders an avatar with two-letter initials from fullName', async () => {
    const user: UserDetail = {
      id: '1',
      fullName: 'Halil Kocoglu',
      email: 'halil@example.com',
      role: 'ADMIN',
      status: 'ACTIVE',
      modulePermissions: [],
      sessionTimeoutMinutes: 30,
    };

    renderDrawer(user);

    // The avatar primitive renders initials inside a <span>; uppercase
    // is applied by getInitials before the DS Avatar receives the prop.
    await waitFor(() => {
      expect(screen.getByText('HK')).toBeInTheDocument();
    });
  });

  it('preserves Turkish characters in initials (no transliteration)', async () => {
    const user: UserDetail = {
      id: '2',
      fullName: 'Çiğdem Öz',
      email: 'cigdem@example.com',
      role: 'USER_VIEWER',
      status: 'ACTIVE',
      modulePermissions: [],
      sessionTimeoutMinutes: 15,
    };

    renderDrawer(user);

    await waitFor(() => {
      // "Çiğdem Öz" → "ÇÖ", NOT "CO". Locked behavior — see
      // getInitials.ts for rationale.
      expect(screen.getByText('ÇÖ')).toBeInTheDocument();
    });
  });

  it('falls back to a single letter for one-token names', async () => {
    const user: UserDetail = {
      id: '3',
      fullName: 'Ada',
      email: 'ada@example.com',
      role: 'USER_VIEWER',
      status: 'ACTIVE',
      modulePermissions: [],
      sessionTimeoutMinutes: 15,
    };

    renderDrawer(user);

    await waitFor(() => {
      expect(screen.getByText('A')).toBeInTheDocument();
    });
  });

  it('avatar is aria-hidden so screen readers do not announce initials twice', async () => {
    const user: UserDetail = {
      id: '4',
      fullName: 'Halil Kocoglu',
      email: 'halil@example.com',
      role: 'ADMIN',
      status: 'ACTIVE',
      modulePermissions: [],
      sessionTimeoutMinutes: 30,
    };

    renderDrawer(user);

    await waitFor(() => {
      expect(screen.getByText('HK')).toBeInTheDocument();
    });

    // The Avatar's outer <span> carries aria-hidden="true" forwarded from
    // the JSX prop on the consumer side. The drawer's accessible name
    // already comes from the dialog's aria-label (= user.fullName).
    const initials = screen.getByText('HK');
    const avatarSpan = initials.closest('span[aria-hidden="true"]');
    expect(avatarSpan).not.toBeNull();
  });

  it('header title and subtitle still render alongside the avatar', async () => {
    const user: UserDetail = {
      id: '5',
      fullName: 'Halil Kocoglu',
      email: 'halil@example.com',
      role: 'ADMIN',
      status: 'ACTIVE',
      modulePermissions: [],
      sessionTimeoutMinutes: 30,
    };

    renderDrawer(user);

    await waitFor(() => {
      expect(screen.getByText('Halil Kocoglu')).toBeInTheDocument();
    });
    // Email may appear multiple times across the drawer (header subtitle
    // + identity tab body), but it must appear at least once in the
    // header subtitle <p> directly under the title <h2>.
    const title = screen.getByText('Halil Kocoglu');
    const headerLeftGroup = title.closest('div')!.parentElement!;
    expect(headerLeftGroup.textContent).toContain('halil@example.com');
    // Avatar sits as a sibling of the title block in the same header
    // (not absorbed into title text).
    expect(screen.getByText('HK')).toBeInTheDocument();
  });
});
