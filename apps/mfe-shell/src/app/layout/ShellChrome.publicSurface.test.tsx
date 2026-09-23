// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * #1047 — aday yüzeyinde personel kabuğu çizilmez, yalnız personele dönüş şeridi çizilir.
 *
 * <p>Ağır alt bileşenler (başlık, sol menü, yönlendirici) taklit edildi: bu testin iddiası
 * onların içeriği değil, {@code ShellChrome}'un HANGİSİNİ çizdiği.
 */
const authMock = vi.hoisted(() => ({ token: null as string | null }));
vi.mock('../store/store.hooks', () => ({
  useAppDispatch: () => vi.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ auth: { token: authMock.token, initialized: true } }),
}));
vi.mock('../theme/theme-context.provider', () => ({
  useThemeContext: () => ({ currentTheme: { colors: { background: '#fff', text: '#000' } } }),
}));
vi.mock('@mfe/design-system', () => ({ useBreakpoint: () => ({ isBelow: () => false }) }));
vi.mock('@mfe/design-system/components', () => ({ useToast: () => ({ show: vi.fn() }) }));
vi.mock('./Sidebar', () => ({ Sidebar: () => <nav data-testid="shell-sidebar">menü</nav> }));
vi.mock('./header', () => ({
  ShellHeaderNew: () => <header data-testid="shell-header">iç arama</header>,
  BreadcrumbStrip: () => <div data-testid="shell-breadcrumb" />,
}));
vi.mock('../router/AppRouter', () => ({ AppRouter: () => <div data-testid="app-router" /> }));
vi.mock('./MobileBottomBar', () => ({ MobileBottomBar: () => <div data-testid="mobile-bar" /> }));
vi.mock('./ImpersonationBanner', () => ({ ImpersonationBanner: () => null }));
vi.mock('./AuditSummaryStrip', () => ({ default: () => null }));
vi.mock('../shortcuts/useChordNavigation', () => ({
  useChordNavigation: () => ({ isPending: false, activeChords: [] }),
}));
vi.mock('../shortcuts/ChordOverlay', () => ({ ChordOverlay: () => null }));
vi.mock('../router/RouteTracker', () => ({ RouteTracker: () => null }));

import { ShellChrome } from './ShellLayout';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ShellChrome />
    </MemoryRouter>,
  );

describe('ShellChrome on public candidate surfaces (#1047)', () => {
  beforeEach(() => {
    authMock.token = 'staff-token';
  });
  afterEach(cleanup);

  it('keeps the internal menu and search off the candidate surface for staff', () => {
    renderAt('/candidate');

    expect(screen.queryByTestId('shell-sidebar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('shell-header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('shell-breadcrumb')).not.toBeInTheDocument();
    // Aday yüzeyi yine çizilir; kaybolan yalnız personel kabuğudur.
    expect(screen.getByTestId('app-router')).toBeInTheDocument();
  });

  it('gives staff a way back from the candidate surface', () => {
    renderAt('/jobs/urun-yoneticisi/apply');

    expect(screen.getByTestId('staff-public-surface-strip')).toBeVisible();
    expect(screen.getByRole('link', { name: /Platform'a dön/ })).toBeVisible();
  });

  it('shows no strip to a visitor without a session', () => {
    authMock.token = null;
    renderAt('/candidate');

    expect(screen.queryByTestId('staff-public-surface-strip')).not.toBeInTheDocument();
    expect(screen.queryByTestId('shell-sidebar')).not.toBeInTheDocument();
  });

  it('leaves internal pages untouched', () => {
    renderAt('/admin/ats/recruiter');

    expect(screen.getByTestId('shell-header')).toBeVisible();
    expect(screen.getByTestId('shell-sidebar')).toBeVisible();
    expect(screen.queryByTestId('staff-public-surface-strip')).not.toBeInTheDocument();
  });
});
