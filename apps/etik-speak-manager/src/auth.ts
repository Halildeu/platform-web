import Keycloak, { type KeycloakTokenParsed } from 'keycloak-js';
import {
  clearAccessTokenProvider,
  registerAccessTokenProvider,
  registerAuthorizationFailureHandler,
} from './standalone-http';

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
let initialization: Promise<'ready' | 'redirecting' | 'denied'> | undefined;
/** Yalnız kullanıcı "Yeniden dene" dediğinde true olur — otomatik akış sessizdir. */
let forceReauth = false;
const UPGRADE_MARKER = 'etikSpeakManagerAuthUpgrade_v1';
const UPGRADE_TTL_MS = 5 * 60 * 1000;
const invalidationListeners = new Set<() => void>();

export const managerRedirectUri = () => {
  const { pathname, search } = window.location;
  const safePath =
    pathname === '/ethic' || pathname.startsWith('/ethic/') ? `${pathname}${search}` : '/ethic/';
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

/**
 * Kullanıcı-tetikli yeniden deneme, hesap değiştirme yolunu da açar.
 *
 * Sıradan açılış sessizdir (aşağıya bakın); bu yüzden yanlış hesapla oturum
 * açmış bir kullanıcının tek çıkışı bu düğmedir. `forceReauth` yalnız burada
 * set edilir: otomatik akış asla şifre ekranı zorlamaz, kullanıcı istediğinde
 * zorlar.
 */
export const resetManagerSessionForRetry = (): void => {
  clearUpgradeAttempt();
  initialization = undefined;
  keycloak = undefined;
  forceReauth = true;
};

const invalidateManagerSession = (): void => {
  clearAccessTokenProvider();
  invalidationListeners.forEach((listener) => listener());
};

export const subscribeManagerSessionInvalidation = (listener: () => void): (() => void) => {
  invalidationListeners.add(listener);
  return () => invalidationListeners.delete(listener);
};

const startManagerSession = async (): Promise<'ready' | 'redirecting' | 'denied'> => {
  keycloak ??= new Keycloak({
    url: window.location.origin,
    realm: 'platform-test',
    clientId: 'frontend',
  });

  keycloak.onAuthLogout = invalidateManagerSession;
  keycloak.onAuthRefreshError = invalidateManagerSession;
  keycloak.onTokenExpired = () => {
    void keycloak
      ?.updateToken(30)
      .then(() => {
        if (!keycloak?.token || !hasEthicsManagerContract(keycloak.tokenParsed)) {
          invalidateManagerSession();
        }
      })
      .catch(invalidateManagerSession);
  };

  // Kapsam sessiz SSO kontrolünün KENDİSİNE veriliyor.
  //
  // `ethics-manager-audience` + `ethics:case:manage` KC'de opsiyonel client
  // scope'tur: yalnız istendiğinde token'a girer. Kapsamsız `check-sso`
  // dönen token sözleşmeyi hiçbir zaman taşıyamaz — bu yüzden panel her
  // açılışta yükseltme turuna, eski `prompt: 'login'` ile de şifre ekranına
  // düşüyordu (canlı doğrulama 2026-07-26: suite oturumu açıkken bile).
  // keycloak-js init `scope`'u check-sso yönlendirmesine taşır
  // (`createLoginUrl`: `options?.scope || this.scope`), dolayısıyla yetkili
  // kullanıcı açık suite oturumuyla panele hiç ek adım olmadan girer.
  const authenticated = await keycloak.init({
    onLoad: 'check-sso',
    scope: ETHICS_MANAGER_SCOPE,
    checkLoginIframe: false,
    pkceMethod: 'S256',
  });

  if (!authenticated) {
    if (!claimUpgradeAttempt()) return 'denied';
    await keycloak.login({
      redirectUri: managerRedirectUri(),
      scope: ETHICS_MANAGER_SCOPE,
      ...(forceReauth ? { prompt: 'login' as const } : {}),
    });
    forceReauth = false;
    return 'redirecting';
  }
  if (!hasEthicsManagerContract(keycloak.tokenParsed)) {
    // Kapsam yukarıda zaten istendi: aynı oturumla ikinci sessiz tur aynı
    // token'ı döndürür, sonsuz yönlendirme üretir. Bu noktada eksik olan
    // rol/yetkidir — ya da oturum başka bir hesaba aittir. İkincisinin çıkışı
    // kullanıcı-tetikli yeniden denemedir (aşağıdaki prompt=login).
    if (!forceReauth) return 'denied';
    if (!claimUpgradeAttempt()) return 'denied';
    forceReauth = false;
    await keycloak.login({
      redirectUri: managerRedirectUri(),
      scope: ETHICS_MANAGER_SCOPE,
      prompt: 'login',
    });
    return 'redirecting';
  }
  forceReauth = false;
  clearUpgradeAttempt();

  registerAuthorizationFailureHandler(invalidateManagerSession);
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

export const initializeManagerSession = (): Promise<'ready' | 'redirecting' | 'denied'> => {
  initialization ??= startManagerSession();
  return initialization;
};
