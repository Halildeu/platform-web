import { beforeEach, describe, expect, it, vi } from 'vitest';

const keycloakMock = vi.hoisted(() => ({
  init: vi.fn(),
  login: vi.fn(),
  updateToken: vi.fn(),
  token: 'initial-token' as string | undefined,
  tokenParsed: undefined as Record<string, unknown> | undefined,
  onAuthLogout: undefined as (() => void) | undefined,
  onAuthRefreshError: undefined as (() => void) | undefined,
  onTokenExpired: undefined as (() => void) | undefined,
}));

const KeycloakConstructor = vi.hoisted(() =>
  vi.fn(function MockKeycloak() {
    return keycloakMock;
  }),
);

vi.mock('keycloak-js', () => ({ default: KeycloakConstructor }));

const validClaims = () => ({
  aud: ['ethics-manager'],
  scope: 'openid ethics:case:manage',
  realm_access: { roles: ['ethics-manager'] },
});

describe('Etik Speak Keycloak lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    KeycloakConstructor.mockClear();
    keycloakMock.init.mockReset();
    keycloakMock.login.mockReset();
    keycloakMock.updateToken.mockReset();
    keycloakMock.token = 'initial-token';
    keycloakMock.tokenParsed = validClaims();
    keycloakMock.onAuthLogout = undefined;
    keycloakMock.onAuthRefreshError = undefined;
    keycloakMock.onTokenExpired = undefined;
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/ethic/cases/demo?tab=messages#latest');
  });

  it('initializes once with PKCE and the exact manager client contract', async () => {
    keycloakMock.init.mockResolvedValue(true);
    const { initializeManagerSession } = await import('./auth');

    const first = initializeManagerSession();
    const second = initializeManagerSession();
    expect(first).toBe(second);
    await expect(first).resolves.toBe('ready');

    expect(KeycloakConstructor).toHaveBeenCalledWith({
      url: window.location.origin,
      realm: 'platform-test',
      clientId: 'frontend',
    });
    expect(keycloakMock.init).toHaveBeenCalledOnce();
    expect(keycloakMock.init).toHaveBeenCalledWith({
      onLoad: 'check-sso',
      checkLoginIframe: false,
      pkceMethod: 'S256',
    });
  });

  it('performs only the bounded login upgrade with exact scope and a fragment-free deep link', async () => {
    keycloakMock.init.mockResolvedValue(false);
    keycloakMock.login.mockResolvedValue(undefined);
    const { ETHICS_MANAGER_SCOPE, initializeManagerSession } = await import('./auth');

    await expect(initializeManagerSession()).resolves.toBe('redirecting');

    expect(keycloakMock.login).toHaveBeenCalledOnce();
    expect(keycloakMock.login).toHaveBeenCalledWith({
      redirectUri: 'http://localhost:3000/ethic/cases/demo?tab=messages',
      scope: ETHICS_MANAGER_SCOPE,
    });
  });

  it('fails closed and clears the HTTP provider when refreshed claims lose the manager contract', async () => {
    keycloakMock.init.mockResolvedValue(true);
    keycloakMock.updateToken.mockResolvedValue(true);
    const auth = await import('./auth');
    const { api } = await import('./standalone-http');
    const invalidate = vi.fn();
    auth.subscribeManagerSessionInvalidation(invalidate);
    await auth.initializeManagerSession();

    keycloakMock.tokenParsed = { ...validClaims(), aud: ['account'] };
    keycloakMock.onTokenExpired?.();
    await vi.waitFor(() => expect(invalidate).toHaveBeenCalledOnce());

    await expect(api.get('/v1/ethics/cases')).rejects.toThrow('oturumu henüz hazır değil');
  });
});
