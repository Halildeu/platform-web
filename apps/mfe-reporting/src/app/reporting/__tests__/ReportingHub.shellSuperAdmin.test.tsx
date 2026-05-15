// @vitest-environment jsdom
/**
 * R15 user-visible repair regression guard (Codex 019e2aef iter-7).
 *
 * Pins the live testai 2026-05-15 contract:
 *   1. useCatalog() returns 52 raw items (12 dashboard + 31 dynamic + 9 static).
 *   2. The local @mfe/auth PermissionProvider context resolves to the
 *      no-op default (isSuperAdmin: () => false, canViewReport: () => false),
 *      reproducing the federation singleton failure mode.
 *   3. The shell services bridge reports superAdmin=true.
 *
 * Expected behaviour after the iter-7 fix: ReportingHub passes all 52
 * items to GroupedCardGallery (no filter drop), because the shell-level
 * bridge short-circuits the gate. Without the fix the auth filter would
 * drop the 31 dynamic + 7 static report entries (those with a non-empty
 * `reportGroup`), reproducing the live bug.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Capture the items prop that ReportingHub passes to GroupedCardGallery.
const galleryItemsCapture: unknown[] = [];

vi.mock('@mfe/design-system', () => {
  return {
    GroupedCardGallery: (props: { items: unknown[] }) => {
      galleryItemsCapture.push(props.items);
      return null;
    },
    GalleryCard: () => null,
  };
});

// Default @mfe/auth context returns no-op (false) for both probes, just
// like the live remote-bundle default before iter-7.
vi.mock('@mfe/auth', () => ({
  usePermissions: () => ({
    canViewReport: () => false,
    isSuperAdmin: () => false,
  }),
}));

// Catalog: 52 items mirroring the live testai snapshot.
const dashboardItems = Array.from({ length: 12 }, (_, i) => ({
  id: `dashboard-${i}`,
  title: `Dashboard ${i}`,
  description: '',
  group: 'Dashboard',
  icon: '📈',
  tags: [],
  badge: { label: 'Dashboard', tone: 'info' },
  route: `dashboard-${i}`,
  type: 'dashboard' as const,
  category: 'Dashboard',
  source: 'dashboard' as const,
  reportGroup: 'ANALYTICS_REPORTS',
}));

const dynamicItems = Array.from({ length: 31 }, (_, i) => ({
  id: `dynamic-${i}`,
  title: `Dynamic Report ${i}`,
  description: '',
  group: 'Finans',
  icon: '📊',
  tags: [],
  badge: { label: 'Grid', tone: 'primary' },
  route: `dyn-${i}`,
  type: 'grid' as const,
  category: 'Finans',
  source: 'dynamic' as const,
  reportGroup: 'FINANCE_REPORTS',
}));

const staticItems = Array.from({ length: 9 }, (_, i) => ({
  id: `static-${i}`,
  title: `Static ${i}`,
  description: '',
  group: 'İnsan Kaynakları',
  icon: '📋',
  tags: [],
  badge: { label: i === 8 ? 'Grid' : 'Grid', tone: 'primary' },
  route: `static-${i}`,
  type: 'grid' as const,
  category: 'İnsan Kaynakları',
  source: 'static' as const,
  reportGroup: i < 7 ? 'HR_REPORTS' : undefined, // 2 extra without reportGroup
}));

vi.mock('../useCatalog', () => ({
  useCatalog: () => ({
    items: [...dashboardItems, ...dynamicItems, ...staticItems],
    isLoading: false,
  }),
  catalogTypeTone: { grid: 'primary', dashboard: 'info', mixed: 'warning' },
}));

// Shell services bridge — superAdmin = true.
vi.mock('../../services/shell-services', () => ({
  getShellServices: () => ({
    auth: { isSuperAdmin: () => true },
  }),
}));

import ReportingHubModule from '../ReportingHub';

const ReportingHub =
  (ReportingHubModule as unknown as { default?: React.FC }).default ??
  (ReportingHubModule as React.FC);

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ReportingHub shell-superAdmin bridge (R15 iter-7)', () => {
  beforeEach(() => {
    galleryItemsCapture.length = 0;
    cleanup();
  });

  it('passes all 52 catalog items to Gallery when shell reports superAdmin=true', () => {
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <ReportingHub />
      </Wrapper>,
    );
    expect(galleryItemsCapture.length).toBeGreaterThan(0);
    const items = galleryItemsCapture[0] as Array<{ source: string }>;
    expect(items).toHaveLength(52);
    expect(items.filter((it) => it.source === 'dynamic')).toHaveLength(31);
    expect(items.filter((it) => it.source === 'dashboard')).toHaveLength(12);
    expect(items.filter((it) => it.source === 'static')).toHaveLength(9);
  });
});
