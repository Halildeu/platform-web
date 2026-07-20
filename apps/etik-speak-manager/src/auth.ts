import Keycloak, { type KeycloakTokenParsed } from 'keycloak-js';
import { registerAccessTokenProvider } from './standalone-http';

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

const managerRedirectUri = () => `${window.location.origin}/ethic/`;

export const initializeManagerSession = async (): Promise<'ready' | 'redirecting'> => {
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

  if (!authenticated || !hasEthicsManagerContract(keycloak.tokenParsed)) {
    await keycloak.login({ redirectUri: managerRedirectUri(), scope: ETHICS_MANAGER_SCOPE });
    return 'redirecting';
  }

  registerAccessTokenProvider(async () => {
    await keycloak?.updateToken(30);
    if (!keycloak?.token || !hasEthicsManagerContract(keycloak.tokenParsed)) {
      throw new Error('Etik Speak yetkili oturum sözleşmesi artık geçerli değil.');
    }
    return keycloak.token;
  });
  return 'ready';
};
