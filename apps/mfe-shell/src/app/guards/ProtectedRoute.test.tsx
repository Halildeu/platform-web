// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { ProtectedRoute } from './ProtectedRoute';

const authState = {
  auth: {
    token: null as string | null,
    user: { email: 'admin@example.com' },
    initialized: true,
  },
};

const permissionsMock = {
  hasModule: (_module: string) => true,
  isSuperAdmin: () => false,
  initialized: true,
  // PR-FE-4 (Codex thread 019e08e2 iter-15 AGREE absorb, 2026-05-08):
  // ProtectedRoute now waits on authorizationReady (real-identity gate)
  // instead of initialized. Mock must default to true so the existing
  // "renders children when authenticated and authorized" expectation
  // continues to hold; the new dedicated cases below exercise the
  // false → keep-loading branch.
  authorizationReady: true,
};

const authModeMock = {
  permitAll: false,
};

const jwt = (payload: Record<string, unknown>) => {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${encoded}.signature`;
};

vi.mock('../store/store.hooks', () => ({
  useAppSelector: (selector: any) => selector(authState),
}));

vi.mock('../auth/auth-config', () => ({
  isPermitAllMode: () => authModeMock.permitAll,
}));

vi.mock('@mfe/auth', () => ({
  usePermissions: () => permissionsMock,
}));

const LocationViewer = ({ label }: { label: string }) => {
  const location = useLocation();
  return (
    <div>
      <span>{label}</span>
      <span data-testid="location-display">{`${location.pathname}${location.search}`}</span>
      <span data-testid="location-state">{String((location.state as any)?.reason ?? 'none')}</span>
    </div>
  );
};

const renderWithRouter = () =>
  render(
    <MemoryRouter initialEntries={['/admin/users']}>
      <Routes>
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute requiredPermissions={['VIEW_USERS']}>
              <div>Protected Content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<LocationViewer label="Login Page" />} />
        <Route path="/unauthorized" element={<LocationViewer label="Unauthorized Page" />} />
      </Routes>
    </MemoryRouter>,
  );

const renderWithAnyModuleRoute = () =>
  render(
    <MemoryRouter initialEntries={['/admin/meetings']}>
      <Routes>
        <Route
          path="/admin/meetings"
          element={
            <ProtectedRoute requiredAnyModule={['MEETING', 'TRANSCRIPT']}>
              <div>Meeting Content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<LocationViewer label="Login Page" />} />
        <Route path="/unauthorized" element={<LocationViewer label="Unauthorized Page" />} />
      </Routes>
    </MemoryRouter>,
  );

const renderWithRoleRoute = () =>
  render(
    <MemoryRouter initialEntries={['/endpoint-admin/remote-access/sessions/session-1/view']}>
      <Routes>
        <Route
          path="/endpoint-admin/remote-access/sessions/:sessionId/view"
          element={
            <ProtectedRoute requiredRole="remote-bridge-operator">
              <div>Remote View Content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/unauthorized" element={<LocationViewer label="Unauthorized Page" />} />
      </Routes>
    </MemoryRouter>,
  );

const renderAnonymousAt = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute requiredPermissions={['VIEW_USERS']}>
              <div>Protected Content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<LocationViewer label="Login Page" />} />
      </Routes>
    </MemoryRouter>,
  );

describe('ProtectedRoute', () => {
  afterEach(() => {
    cleanup();
    // #1200 hold tests drive window.location directly; never leak a
    // fragment into the next case.
    window.history.replaceState(null, '', '/');
  });

  beforeEach(() => {
    authState.auth.token = null;
    permissionsMock.hasModule = () => true;
    permissionsMock.isSuperAdmin = () => false;
    permissionsMock.authorizationReady = true;
    authState.auth.initialized = true;
    authModeMock.permitAll = false;
  });

  it('redirects anonymous user to login with redirect param', () => {
    renderWithRouter();
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.getByTestId('location-display')).toHaveTextContent(
      '/login?redirect=%2Fadmin%2Fusers',
    );
  });

  it('keeps the query but never the fragment in the login redirect param (#1200)', () => {
    // A fragment on an app path is never routing state here; carrying it into
    // ?redirect= let LoginPage hand it to Keycloak as redirect_uri (RFC 6749
    // §3.1.2 forbids that) and produced an infinite login loop.
    renderAnonymousAt('/admin/users?tab=roles#stage=demo');
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    // Exact match on purpose: toHaveTextContent(string) is a substring
    // check, so the pre-fix value `…%3Droles%23stage%3Ddemo` would still
    // "contain" the expected prefix and the test would pass vacuously.
    expect(screen.getByTestId('location-display').textContent).toBe(
      '/login?redirect=%2Fadmin%2Fusers%3Ftab%3Droles',
    );
    expect(screen.getByTestId('location-display').textContent).not.toContain('%23');
  });

  it('holds instead of redirecting while an unconsumed Keycloak callback is in the URL (#1200)', () => {
    // Live shape from the KC LOGIN event: the code was never exchanged because
    // the route redirected away before keycloak-js parsed the fragment.
    // The hold reads window.location (what keycloak-js actually mutates),
    // not the router snapshot — MemoryRouter never touches window.
    window.history.replaceState(
      null,
      '',
      '/admin/users#state=5668b163&session_state=jnqL&iss=https%3A%2F%2Ftestai.acik.com&code=dd81',
    );
    const { container } = renderAnonymousAt('/admin/users');
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });

  it('releases the hold and redirects CLEANLY once keycloak-js has stripped the fragment (#1200)', () => {
    // Regression caught live after the first fix: keycloak-js removes the
    // callback via history.replaceState, React Router's location.hash kept
    // the stale fragment, and the hold never released — header rendered,
    // <main> empty. The next re-render must see the live (clean) hash and
    // redirect with a fragment-free return-to.
    window.history.replaceState(
      null,
      '',
      '/admin/users#state=5668b163&session_state=jnqL&iss=https%3A%2F%2Ftestai.acik.com&code=dd81',
    );
    const view = renderAnonymousAt('/admin/users');
    expect(view.container).toBeEmptyDOMElement();

    // keycloak-js parse step: fragment gone from the live URL.
    window.history.replaceState(null, '', '/admin/users');
    view.rerender(
      <MemoryRouter initialEntries={['/admin/users']}>
        <Routes>
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute requiredPermissions={['VIEW_USERS']}>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LocationViewer label="Login Page" />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.getByTestId('location-display').textContent).toBe(
      '/login?redirect=%2Fadmin%2Fusers',
    );
    expect(screen.getByTestId('location-display').textContent).not.toContain('%23');
  });

  it('still redirects normally when the hash is not a Keycloak callback', () => {
    renderAnonymousAt('/admin/users#stage=demo');
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('permitAll bootstrap tamamlanmadan içerik render etmez', () => {
    authModeMock.permitAll = true;
    authState.auth.initialized = false;

    const { container } = renderWithRouter();

    expect(container).toBeEmptyDOMElement();
  });

  it('navigates authenticated but unauthorized user to /unauthorized', () => {
    authState.auth.token = 'valid-token';
    permissionsMock.hasModule = () => false;

    renderWithRouter();
    expect(screen.getByText('Unauthorized Page')).toBeInTheDocument();
  });

  it('renders children when authenticated and authorized', () => {
    authState.auth.token = 'valid-token';
    permissionsMock.hasModule = () => true;

    renderWithRouter();
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('renders children when any required module is granted', () => {
    authState.auth.token = 'valid-token';
    permissionsMock.hasModule = (module) => module === 'TRANSCRIPT';

    renderWithAnyModuleRoute();

    expect(screen.getByText('Meeting Content')).toBeInTheDocument();
  });

  it('rejects any-module routes when none of the alternatives are granted', () => {
    authState.auth.token = 'valid-token';
    permissionsMock.hasModule = (module) => module === 'REPORT';

    renderWithAnyModuleRoute();

    expect(screen.getByText('Unauthorized Page')).toBeInTheDocument();
    expect(screen.getByTestId('location-state')).toHaveTextContent('module_denied');
  });

  it('renders a transport-specific route only for the exact realm role', () => {
    authState.auth.token = jwt({ realm_access: { roles: ['remote-bridge-operator'] } });

    renderWithRoleRoute();

    expect(screen.getByText('Remote View Content')).toBeInTheDocument();
  });

  it('does not let OpenFGA super-admin bypass a transport-specific realm role', () => {
    authState.auth.token = jwt({ realm_access: { roles: ['admin'] } });
    permissionsMock.isSuperAdmin = () => true;

    renderWithRoleRoute();

    expect(screen.getByText('Unauthorized Page')).toBeInTheDocument();
    expect(screen.getByTestId('location-state')).toHaveTextContent('role_denied');
  });

  it('permitAll modunda bootstrap sonrası token olmasa da children render eder', () => {
    authModeMock.permitAll = true;
    authState.auth.token = null;
    authState.auth.initialized = true;

    renderWithRouter();
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('PR-FE-4: authorizationReady=false → returns null (still loading), no /unauthorized redirect', () => {
    // Mirrors the testai cold-mount race: token+initialized=true but
    // /authz/me hasn't populated authz yet → authorizationReady=false.
    // Pre-fix this redirected to /unauthorized with reason='module_denied'
    // because hasModule() returned false against an empty authz; post-fix
    // the route guard stays in its "loading" branch (returns null) until
    // authorizationReady flips true.
    authState.auth.token = 'valid-token';
    permissionsMock.hasModule = () => false;
    permissionsMock.authorizationReady = false;

    const { container } = renderWithRouter();

    // Container empty: ProtectedRoute returned null; route guard did NOT
    // navigate to /unauthorized.
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Unauthorized Page')).not.toBeInTheDocument();
  });

  it('PR-FE-4: authorizationReady=true + isSuperAdmin=true → renders children even if hasModule=false', () => {
    // Real-identity superAdmin path: authz?.userId populated, isSuperAdmin
    // returns true; module check bypassed. Verifies that the new
    // authorizationReady gate composes correctly with the existing
    // isSuperAdmin override (live testai user:1 superAdmin=true case).
    authState.auth.token = 'valid-token';
    permissionsMock.hasModule = () => false;
    permissionsMock.isSuperAdmin = () => true;
    permissionsMock.authorizationReady = true;

    renderWithRouter();

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});
