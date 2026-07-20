import Keycloak, { type KeycloakTokenParsed } from 'keycloak-js';
import { clearAccessTokenProvider, registerAccessTokenProvider } from './standalone-http';

export const ETHICS_MANAGER_SCOPE = 'openid ethics-manager-audience ethics:case:manage';

const stringList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return typeof value === 'string' ? [value] : [];
};

export const hasEthicsManagerContract = (
  claims: KeycloakTokenParsed | Record<string, unknown> | undefined,
): boolean => {
  if (!claims) return false;
  const audience = stringList(claims['aud']);
  const scope = typeof claims['scope'] === 'string' ? claims['scope'].split(/\s+/) : [];
  const realmAccess = claims['realm_access'];
  const roles =
    realmAccess && typeof realmAccess === 'object' && !Array.isArray(realmAccess)
      ? stringList((realmAccess as Record<string, unknown>)['roles'])
      : [];
  return (
    audience.includes('ethics-manager') &&
    scope.includes('ethics:case:manage') &&
    roles.includes('ethics-manager')
  );
};

let keycloak: Keycloak | undefined;
const UPGRADE_MARKER = 'etikSpeakManagerAuthUpgrade_v1';
const UPGRADE_TTL_MS = 5 * 60 * 1000;
const invalidationListeners = new Set<() => void>();

export const managerRedirectUri = () => {
  const { pathname, search, hash } = window.location;
  const safePath =
    pathname === '/ethic' || pathname.startsWith('/ethic/')
      ? `${pathname}${search}${hash}`
      : '/ethic/';
  return `${window.location.origin}${safePath}`;
};

export const claimUpgradeAttempt = (): boolean => {
  try {
    const raw = window.sessionStorage.getItem(UPGRADE_MARKER);
    if (raw) {
      const attemptedAt = Number.parseInt(raw, 10);
      if (Number.isFinite(attemptedAt) && Date.now() - attemptedAt < UPGRADE_TTL_MS) return false;
    }
    window.sessionStorage.setItem(UPGRADE_MARKER, String(Date.now()));
    return true;
  } catch {
    return false;
  }
};

const clearUpgradeAttempt = (): void => {
  try {
    window.sessionStorage.removeItem(UPGRADE_MARKER);
  } catch {
    // A valid token contract is authoritative when storage is unavailable.
  }
};

const invalidateManagerSession = (): void => {
  clearAccessTokenProvider();
  invalidationListeners.forEach((listener) => listener());
};

export const subscribeManagerSessionInvalidation = (listener: () => void): (() => void) => {
  invalidationListeners.add(listener);
  return () => invalidationListeners.delete(listener);
};

export const initializeManagerSession = async (): Promise<'ready' | 'redirecting' | 'denied'> => {
  keycloak ??= new Keycloak({
    url: window.location.origin,
    realm: 'platform-test',
    clientId: 'frontend',
  });

  const authenticated = await keycloak.init({
    onLoad: 'check-sso',
    checkLoginIframe: false,
    pkceMethod: 'S256',
  });

  if (!authenticated) {
    if (!claimUpgradeAttempt()) return 'denied';
    await keycloak.login({ redirectUri: managerRedirectUri(), scope: ETHICS_MANAGER_SCOPE });
    return 'redirecting';
  }
  if (!hasEthicsManagerContract(keycloak.tokenParsed)) {
    if (!claimUpgradeAttempt()) return 'denied';
    await keycloak.login({ redirectUri: managerRedirectUri(), scope: ETHICS_MANAGER_SCOPE });
    return 'redirecting';
  }
  clearUpgradeAttempt();

  registerAccessTokenProvider(async () => {
    try {
      await keycloak?.updateToken(30);
      if (!keycloak?.token || !hasEthicsManagerContract(keycloak.tokenParsed)) {
        throw new Error('Etik Speak yetkili oturum sözleşmesi artık geçerli değil.');
      }
      return keycloak.token;
    } catch (error) {
      invalidateManagerSession();
      throw error;
    }
  });
  return 'ready';
};
