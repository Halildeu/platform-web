// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const authModeMock = { permitAll: false };
const authStateMock = { token: null as string | null, initialized: true };
const { startKeycloakLoginMock, resolveKeycloakLoginUrlMock } = vi.hoisted(() => ({
  startKeycloakLoginMock: vi.fn().mockResolvedValue(undefined),
  resolveKeycloakLoginUrlMock: vi
    .fn()
    .mockResolvedValue('https://ai.acik.com/realms/serban/protocol/openid-connect/auth'),
}));

vi.mock('../../app/auth/keycloakClient', () => ({
  default: {
    login: vi.fn().mockResolvedValue(undefined),
  },
  startKeycloakLogin: startKeycloakLoginMock,
  resolveKeycloakLoginUrl: resolveKeycloakLoginUrlMock,
}));

vi.mock('@mfe/design-system', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('../../app/i18n', () => ({
  useShellCommonI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../app/auth/auth-config', () => ({
  isPermitAllMode: () => authModeMock.permitAll,
  buildAppRedirectUri: (value?: string) => `http://localhost:3000${value ?? '/'}`,
}));

vi.mock('../../app/store/store.hooks', () => ({
  useAppSelector: (selector: (state: { auth: typeof authStateMock }) => unknown) =>
    selector({ auth: authStateMock }),
}));

import { startKeycloakLogin } from '../../app/auth/keycloakClient';
import LoginPage from './LoginPage.ui';

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authModeMock.permitAll = false;
    authStateMock.token = null;
    authStateMock.initialized = true;
    resolveKeycloakLoginUrlMock.mockResolvedValue(
      'https://ai.acik.com/realms/serban/protocol/openid-connect/auth',
    );
  });

  afterEach(() => {
    cleanup();
  });

  it('renders corporate login button', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    );

    const button = screen.getByTestId('corporate-login-button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Güvenli Kurumsal Giriş');
  });

  it('hazirlanan login href bilgisini butona baglar', async () => {
    render(
      <MemoryRouter initialEntries={['/login?redirect=/access/roles']}>
        <LoginPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('corporate-login-button')).toHaveAttribute(
        'href',
        'https://ai.acik.com/realms/serban/protocol/openid-connect/auth',
      ),
    );
  });

  it('login href hazirlanamazsa startKeycloakLogin fallbackini kullanir', async () => {
    resolveKeycloakLoginUrlMock.mockResolvedValueOnce(null);

    render(
      <MemoryRouter initialEntries={['/login?redirect=/access/roles']}>
        <LoginPage />
      </MemoryRouter>,
    );

    const button = await screen.findByTestId('corporate-login-button');
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);

    await waitFor(() => expect(startKeycloakLogin).toHaveBeenCalledTimes(1));
    expect(startKeycloakLogin).toHaveBeenCalledWith({
      redirectUri: 'http://localhost:3000/access/roles',
    });
  });

  it('keycloak init tamamlanmadan login butonu enabled kalir ve startKeycloakLogin fallback calistirir', async () => {
    // 2026-05-10 hotfix (login flow P0 #1): the button used to be
    // `disabled={!loginHrefReady}`, which meant a user clicking
    // "Güvenli Kurumsal Giriş" while kc.init() was still resolving
    // saw a no-op (with only a tiny "hazırlanıyor..." note as
    // feedback). The new contract: button is always clickable;
    // handleLogin falls back to startKeycloakLogin() (which awaits
    // kc.init internally) when loginHref is null. Cross-AI Codex
    // review (thread 019e1336) flagged this as the primary
    // first-click usability bug.
    authStateMock.initialized = false;

    render(
      <MemoryRouter initialEntries={['/login?redirect=/access/roles']}>
        <LoginPage />
      </MemoryRouter>,
    );

    const button = screen.getByTestId('corporate-login-button');
    expect(button).not.toBeDisabled();
    expect(screen.getByTestId('corporate-login-pending')).toBeInTheDocument();

    fireEvent.click(button);
    await waitFor(() => expect(startKeycloakLogin).toHaveBeenCalledTimes(1));
    expect(startKeycloakLogin).toHaveBeenCalledWith({
      redirectUri: 'http://localhost:3000/access/roles',
    });
  });

  it('redirect=/login query parametresini filtreler ve / kokune yonlendirir (loop guard)', async () => {
    // 2026-05-10 hotfix (login flow P0 #2): when user lands on
    // /login?redirect=/login (e.g. stale bookmark, browser back
    // navigation post-SSO) the previous logic returned '/login' as
    // post-SSO target → KC sent browser BACK to /login → onAuthSuccess
    // catch-up handler eventually recovered but with extra round-trip.
    // Contract: any /login* redirect param falls through to '/'.
    // Cross-AI Codex review (thread 019e1336) flagged this as P0
    // redirect-loop class bug.
    authStateMock.initialized = true;

    render(
      <MemoryRouter initialEntries={['/login?redirect=/login']}>
        <LoginPage />
      </MemoryRouter>,
    );

    // The redirectUri passed to resolveKeycloakLoginUrl proves the
    // filter worked — we see '/' instead of '/login'.
    await waitFor(() => expect(resolveKeycloakLoginUrlMock).toHaveBeenCalled());
    expect(resolveKeycloakLoginUrlMock).toHaveBeenCalledWith({
      redirectUri: 'http://localhost:3000/',
    });
  });

  it('redirect=/login/foo nested path icin de loop guard calisir', async () => {
    // Defense-in-depth: nested /login/* paths (e.g. /login/help, hypothetical
    // future sub-routes) should also be treated as login-namespace and
    // fall through to '/'.
    authStateMock.initialized = true;

    render(
      <MemoryRouter initialEntries={['/login?redirect=/login/help']}>
        <LoginPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(resolveKeycloakLoginUrlMock).toHaveBeenCalled());
    expect(resolveKeycloakLoginUrlMock).toHaveBeenCalledWith({
      redirectUri: 'http://localhost:3000/',
    });
  });

  it.each([
    ['/login#hash', 'http://localhost:3000/'],
    ['/LOGIN', 'http://localhost:3000/'],
    ['/Login/help', 'http://localhost:3000/'],
    ['//evil.com/foo', 'http://localhost:3000/'],
    ['///login', 'http://localhost:3000/'],
    ['javascript:alert(1)', 'http://localhost:3000/'],
    ['http://evil.com/', 'http://localhost:3000/'],
  ])(
    'redirect=%p loop guard / open-redirect koruma calisir → %p',
    async (redirect, expectedRedirectUri) => {
      // 2026-05-10 hotfix iter-2 (Codex thread 019e1341 P1 #1 absorb):
      // tighten redirect filter to catch case-insensitive matches,
      // hash bypass, schema-relative URLs, and javascript: scheme.
      authStateMock.initialized = true;

      render(
        <MemoryRouter initialEntries={[`/login?redirect=${encodeURIComponent(redirect)}`]}>
          <LoginPage />
        </MemoryRouter>,
      );

      await waitFor(() => expect(resolveKeycloakLoginUrlMock).toHaveBeenCalled());
      expect(resolveKeycloakLoginUrlMock).toHaveBeenCalledWith({
        redirectUri: expectedRedirectUri,
      });
    },
  );

  it('non-login redirect path olduğu gibi korunur (regression guard)', async () => {
    // Regression guard: legitimate redirect targets like /access/roles
    // must still be honored; the loop guard only filters /login*.
    authStateMock.initialized = true;

    render(
      <MemoryRouter initialEntries={['/login?redirect=/access/roles']}>
        <LoginPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(resolveKeycloakLoginUrlMock).toHaveBeenCalled());
    expect(resolveKeycloakLoginUrlMock).toHaveBeenCalledWith({
      redirectUri: 'http://localhost:3000/access/roles',
    });
  });

  it('shows permitAll mode with Devam Et button', () => {
    authModeMock.permitAll = true;
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Geliştirme modunda/)).toBeInTheDocument();
    expect(screen.getByText('Devam Et')).toBeInTheDocument();
    expect(screen.queryByTestId('corporate-login-button')).toBeNull();
  });
});
