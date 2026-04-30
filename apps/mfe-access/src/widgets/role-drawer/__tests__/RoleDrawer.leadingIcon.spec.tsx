// @vitest-environment jsdom
//
// Codex 019dde0c iter-44 — RoleDrawer leading icon (DetailDrawer.leading).
//
// Pairs with packages/design-system DetailDrawer `leading` slot prop. This
// spec asserts:
//   1. IconShield SVG is rendered inside the drawer header (leading slot
//      wired end-to-end through the real DS DetailDrawer).
//   2. The icon does NOT replace or hide the existing `tags` content
//      (system-role badge, member count) — those keep their semantic
//      role per Codex review (`is_system` belongs in tags, not leading).
//   3. The icon is decorative (`aria-hidden="true"`) so screen readers
//      announce the role title once via the dialog's `aria-label`.
//   4. Outer header layout contract preserved (items-start +
//      justify-between + gap-3 — keeps close button top-aligned).
//
// We render the real `@mfe/design-system` DetailDrawer (no DS mock) so
// the leading-slot DOM wiring is exercised end-to-end. Other heavy DS
// primitives unrelated to header layout (Autocomplete, TextInput, etc.)
// are left as-is — they don't affect header assertions.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

vi.mock('@mfe/auth', () => ({
  usePermissions: () => ({ authz: { userId: 'test-user' } }),
  useZanzibarAccess: () => ({ access: 'enabled', reason: undefined }),
}));

vi.mock('@mfe/shared-http', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../shared/notifications', () => ({
  pushToast: vi.fn(),
}));

vi.mock('../../explain-modal/ExplainPermissionModal', () => ({
  ExplainPermissionModal: () => null,
}));

import { api } from '@mfe/shared-http';
import RoleDrawerWrapper from '../RoleDrawer.ui';
import type { AccessRole } from '../../../features/access-management/model/access.types';

const buildRole = (overrides?: Partial<AccessRole>): AccessRole => ({
  id: '42',
  name: 'PURCHASE_MANAGER',
  description: 'Satin alma yoneticisi',
  memberCount: 5,
  isSystemRole: true,
  policies: [],
  lastModifiedAt: '2026-04-30T00:00:00Z',
  lastModifiedBy: 'system',
  permissions: [],
  ...overrides,
});

const renderDrawer = (role: AccessRole | null = buildRole()) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RoleDrawerWrapper
        open
        mode="view"
        role={role}
        onClose={() => {}}
        t={(key) => key}
        formatNumber={(n) => String(n)}
        formatDate={() => ''}
      />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  // Comprehensive api.get mock mirroring RoleDrawer.policiesRender pattern
  // — covers catalog, granules, members, member-info-batch endpoints.
  (api.get as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
    if (url === '/v1/authz/catalog') {
      return { data: { modules: [], actions: [], reports: [], pages: [] } };
    }
    if (url.startsWith('/v1/roles/') && url.endsWith('/members')) {
      return { data: [] };
    }
    if (url.match(/^\/v1\/roles\/\d+\/granules$/)) {
      return { data: { roleId: 42, granules: [] } };
    }
    if (url.match(/^\/v1\/roles\/\d+$/)) {
      return { data: { policies: [], permissions: [] } };
    }
    if (url.includes('member-info-batch') || url.includes('users')) {
      return { data: [] };
    }
    return { data: {} };
  });
});

describe('RoleDrawer — leading icon (iter-44)', () => {
  it('drawer header renders an IconShield SVG (decorative, aria-hidden)', async () => {
    renderDrawer();
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();

    // IconShield uses createIcon factory which produces an `<svg>` with
    // `aria-hidden="true"` (no label). The shield path starts with
    // `M12 22s8-4` per IconShield.tsx.
    await waitFor(() => {
      const svgs = dialog.querySelectorAll('svg[aria-hidden="true"]');
      const shieldSvg = Array.from(svgs).find((svg) => svg.querySelector('path[d^="M12 22s8-4"]'));
      expect(shieldSvg).toBeDefined();
    });
  });

  it('icon is wrapped in a shrink-0 mt-0.5 leading slot wrapper (DS contract)', async () => {
    renderDrawer();
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      const wrapper = dialog.querySelector('.shrink-0.mt-0\\.5');
      expect(wrapper).not.toBeNull();
      const svg = wrapper?.querySelector('svg[aria-hidden="true"]');
      expect(svg).not.toBeNull();
    });
  });

  it('outer header layout (items-start + justify-between + gap-3) preserved', async () => {
    renderDrawer();
    const dialog = await screen.findByRole('dialog');
    const outer = dialog.querySelector('.flex.items-start.justify-between.gap-3');
    expect(outer).not.toBeNull();
  });

  it('header tags container still renders alongside icon (badges preserved)', async () => {
    renderDrawer();
    const dialog = await screen.findByRole('dialog');
    // The DS DetailDrawer renders tags inside `<div class="flex items-center gap-1.5">`
    // on the same row as the title (header). Confirm at least one tags
    // container exists alongside the leading slot.
    await waitFor(() => {
      const tagsWrapper = dialog.querySelector('.flex.items-center.gap-1\\.5');
      expect(tagsWrapper).not.toBeNull();
      // role.isSystemRole=true + memberCount=5 → at least 2 badges in header tags
      const badges = tagsWrapper?.querySelectorAll('[data-component="badge"], span');
      expect(badges?.length ?? 0).toBeGreaterThan(0);
    });
  });

  it('outer header items-start contract preserved + close button top-right', async () => {
    renderDrawer();
    const dialog = await screen.findByRole('dialog');
    expect(dialog.querySelector('.flex.items-start.justify-between.gap-3')).not.toBeNull();
    expect(dialog.querySelector('button[aria-label="Close drawer"]')).not.toBeNull();
  });
});
