import Keycloak from 'keycloak-js';
import { authConfig } from './auth-config';

// STORY-0034: FE Keycloak / OIDC Integration
const keycloak = new Keycloak({
  url: authConfig.keycloak.url,
  realm: authConfig.keycloak.realm,
  clientId: authConfig.keycloak.clientId,
});

type KeycloakLoginRedirectOptions = {
  redirectUri: string;
};

const LOGIN_URL_TIMEOUT_MS = 3_000;

const summarizeUrl = (value: string): string => {
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return value;
  }
};

const navigateToLoginUrl = (loginUrl: string): void => {
  const currentHref = window.location.href;

  console.info(
    `[Auth] Redirecting to Keycloak login. current=${summarizeUrl(currentHref)} target=${summarizeUrl(loginUrl)}`,
  );

  window.location.assign(loginUrl);

  window.setTimeout(() => {
    if (window.location.href === currentHref) {
      console.warn(
        `[Auth] location.assign() did not change href. Retrying with replace. current=${summarizeUrl(currentHref)} target=${summarizeUrl(loginUrl)}`,
      );
      window.location.replace(loginUrl);
    }
  }, 250);
};

/**
 * 2026-05-10 hotfix (login flow P0 #3): poll until keycloak-js has
 * populated the internal {@code adapter} field, indicating that
 * {@code init()} has progressed far enough for {@code createLoginUrl}
 * to be safe to call.
 *
 * <p>keycloak-js exposes the adapter at {@code keycloak.adapter} only
 * after init() resolves the OIDC discovery document and constructs
 * the chosen flow adapter (default/cordova/cordova-native). Calling
 * {@code createLoginUrl} before this point throws inside the library
 * with {@code TypeError: Cannot read properties of undefined (reading
 * 'redirectUri')} because the internal options object is still
 * unresolved.
 *
 * <p>Returns true if adapter ready within timeoutMs, false otherwise.
 * Caller may proceed even on timeout — keycloak-js will fall back to
 * its internal "no-adapter" path which throws but the wrapper here
 * catches it cleanly. The wait is best-effort, not blocking.
 */
const waitForKcAdapter = async (timeoutMs: number): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const kc = keycloak as unknown as { adapter?: unknown };
    if (kc.adapter) {
      return true;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 25));
  }
  return false;
};

const readBrowserAuthRuntime = () => {
  if (typeof window === 'undefined') {
    return {
      currentHref: '',
      isSecureContext: false,
      hasCryptoSubtle: false,
    };
  }

  return {
    currentHref: window.location.href,
    isSecureContext: window.isSecureContext,
    hasCryptoSubtle: Boolean(window.crypto?.subtle),
  };
};

export const startKeycloakLogin = async ({
  redirectUri,
}: KeycloakLoginRedirectOptions): Promise<void> => {
  const loginUrl = await resolveKeycloakLoginUrl({ redirectUri });
  if (loginUrl) {
    navigateToLoginUrl(loginUrl);
    return;
  }

  console.info(`[Auth] Falling back to keycloak.login(). redirectUri=${summarizeUrl(redirectUri)}`);
  await keycloak.login({ redirectUri });
};

export const resolveKeycloakLoginUrl = async ({
  redirectUri,
}: KeycloakLoginRedirectOptions): Promise<string | null> => {
  if (typeof window !== 'undefined') {
    const runtime = readBrowserAuthRuntime();
    const currentHref = runtime.currentHref;

    if (!runtime.isSecureContext) {
      console.warn(
        `[Auth] Insecure browser context detected. app=${summarizeUrl(currentHref)} keycloak=${summarizeUrl(authConfig.keycloak.url)} secureContext=${runtime.isSecureContext} subtle=${runtime.hasCryptoSubtle}`,
      );
    }

    try {
      // 2026-05-10 hotfix (login flow P0 #3): wait for kc.adapter to
      // populate before invoking createLoginUrl. keycloak-js sets
      // `keycloak.adapter` inside init(), but the Redux `initialized`
      // flag can fire BEFORE adapter is wired (race observed on testai:
      // `[Auth] keycloak.createLoginUrl() failed: TypeError: Cannot
      // read properties of undefined (reading 'redirectUri')` thrown
      // from inside vo.createLoginUrl on bootstrap-DXLrVsh1.js:10:5908).
      // The error originates inside KC because options or adapter is
      // undefined; spinning briefly until adapter is ready avoids the
      // race without changing observable behavior on the happy path.
      // Cross-AI Codex review (thread 019e1336) flagged this as part
      // of the auth bootstrap FSM gap.
      const adapterReady = await waitForKcAdapter(800);
      if (!adapterReady) {
        console.warn(
          `[Auth] keycloak.createLoginUrl() invoked before adapter ready (timed out ${800}ms). Falling through; KC may still resolve via adapter:'default'.`,
        );
      }
      const loginUrl = await Promise.race<string>([
        keycloak.createLoginUrl({ redirectUri }),
        new Promise<string>((_, reject) => {
          window.setTimeout(() => {
            reject(
              new Error(`keycloak.createLoginUrl() timed out after ${LOGIN_URL_TIMEOUT_MS}ms`),
            );
          }, LOGIN_URL_TIMEOUT_MS);
        }),
      ]);
      if (loginUrl) {
        console.info(
          `[Auth] keycloak.createLoginUrl() resolved. current=${summarizeUrl(currentHref)} target=${summarizeUrl(loginUrl)} redirectUri=${summarizeUrl(redirectUri)} secureContext=${runtime.isSecureContext} subtle=${runtime.hasCryptoSubtle}`,
        );

        if (loginUrl !== currentHref) {
          return loginUrl;
        }

        console.warn(
          `[Auth] keycloak.createLoginUrl() returned current href. current=${summarizeUrl(currentHref)} redirectUri=${summarizeUrl(redirectUri)}`,
        );
      } else {
        console.warn(
          `[Auth] keycloak.createLoginUrl() returned an empty URL. redirectUri=${summarizeUrl(redirectUri)}`,
        );
      }

      if (loginUrl && loginUrl !== currentHref) {
        return loginUrl;
      }
    } catch (error) {
      console.error('[Auth] keycloak.createLoginUrl() failed:', error);
    }
  }

  return null;
};

// Expose to window for MFE remotes in single-domain builds where
// @mfe/shared-http is not shared via Module Federation.
if (typeof window !== 'undefined') {
  (window as Record<string, unknown>).__keycloak = keycloak;
}

export default keycloak;
