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
 * 2026-05-10 hotfix (login flow P0 #3) iter-2: poll until keycloak-js
 * has populated public readiness signals indicating the OIDC discovery
 * document is loaded and {@code createLoginUrl} can safely build a URL.
 *
 * <p>Iter-1 erroneously polled {@code keycloak.adapter} — that field is
 * a PRIVATE class field ({@code #adapter}) in keycloak-js@26.2.4 and is
 * NOT accessible from outside the library. Cross-AI Codex review
 * (thread 019e1341) caught this; the iter-1 wait silently always timed
 * out, adding 800ms latency without actual safety.
 *
 * <p>Iter-2 watches the PUBLIC {@code endpoints.authorize} closure
 * which keycloak-js installs at {@code lib/keycloak.js:672} after the
 * realm config has been fetched and parsed (this is also exactly what
 * {@code createLoginUrl} calls internally — the same readiness signal
 * the library uses). Plus {@code authServerUrl} as a redundant check.
 *
 * <p>Returns true if endpoints ready within timeoutMs, false otherwise.
 * On timeout the caller proceeds and the existing try/catch around
 * {@code createLoginUrl} catches the inevitable internal throw, so
 * this remains best-effort.
 */
const waitForKcEndpoints = async (timeoutMs: number): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const kc = keycloak as unknown as {
      endpoints?: { authorize?: () => string };
      authServerUrl?: string;
    };
    if (kc.endpoints && typeof kc.endpoints.authorize === 'function' && kc.authServerUrl) {
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
      // 2026-05-10 hotfix (login flow P0 #3) iter-2: wait for kc
      // OIDC discovery to populate public {@code endpoints.authorize}
      // before invoking createLoginUrl. The Redux `initialized` flag
      // can fire BEFORE the discovery document is fetched and parsed
      // (race observed on testai:
      // `[Auth] keycloak.createLoginUrl() failed: TypeError: Cannot
      // read properties of undefined (reading 'redirectUri')` thrown
      // from inside vo.createLoginUrl). Cross-AI Codex review (thread
      // 019e1341) iter-1 flagged that polling kc.adapter is wrong
      // (private #adapter field in keycloak-js@26.2.4); iter-2 polls
      // the public endpoints.authorize signal which is set after
      // realm config fetch — exactly what createLoginUrl needs.
      const endpointsReady = await waitForKcEndpoints(800);
      if (!endpointsReady) {
        console.warn(
          `[Auth] keycloak.createLoginUrl() invoked before endpoints ready (timed out 800ms). Falling through; existing try/catch handles internal KC throw.`,
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
