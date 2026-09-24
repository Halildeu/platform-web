import Keycloak from 'keycloak-js';
import { authentication } from '@microsoft/teams-js';
import { BASE, isRecord, type PanelConfig } from './config';

export interface PanelSession { token(): Promise<string>; close(): void }
export type LoginResult = { request: string; token: string; refreshToken: string; idToken: string };

export function parseLoginResult(raw: string, request: string): LoginResult {
  if (raw.length > 100_000) throw new Error('invalid_login');
  const result: unknown = JSON.parse(raw);
  if (!isRecord(result) || result.request !== request) throw new Error('invalid_login');
  for (const key of ['token', 'refreshToken', 'idToken']) {
    if (typeof result[key] !== 'string' || !result[key] || result[key].length > 32_000)
      throw new Error('invalid_login');
  }
  return result as LoginResult;
}

/** Teams context never grants platform access. The API validates the platform JWT. */
export async function signIn(config: PanelConfig): Promise<PanelSession> {
  const request = crypto.randomUUID();
  const raw = await authentication.authenticate({
    url: `${location.origin}${BASE}login.html?request=${request}`, width: 600, height: 640,
  });
  const result = parseLoginResult(raw, request);
  const identity = new Keycloak(config.keycloak);
  const authenticated = await identity.init({
    token: result.token, refreshToken: result.refreshToken, idToken: result.idToken,
    checkLoginIframe: false, pkceMethod: 'S256',
  });
  if (!authenticated) { identity.clearToken(); throw new Error('login_required'); }
  let closed = false;
  return {
    async token() {
      if (closed) throw new Error('login_required');
      try {
        await identity.updateToken(30);
        if (closed || !identity.token) throw new Error('login_required');
        return identity.token;
      } catch { identity.clearToken(); throw new Error('login_required'); }
    },
    close() { closed = true; identity.clearToken(); },
  };
}
