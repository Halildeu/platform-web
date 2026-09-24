import Keycloak from 'keycloak-js';
import { app, authentication } from '@microsoft/teams-js';
import { BASE, UUID, loadConfig } from './config';

const REQUEST_KEY = 'teams-panel.login.request';

async function login(): Promise<void> {
  await app.initialize();
  const query = new URLSearchParams(location.search);
  const request = query.get('request');
  // Only correlation is held in session storage; access/refresh tokens stay in memory.
  if (request) {
    if (!UUID.test(request) || query.has('code') || query.has('state')) throw new Error('invalid_login');
    sessionStorage.setItem(REQUEST_KEY, request);
  }
  const expected = sessionStorage.getItem(REQUEST_KEY);
  if (!expected || !UUID.test(expected)) throw new Error('invalid_login');
  const config = await loadConfig();
  const identity = new Keycloak(config.keycloak);
  // Keycloak owns OAuth state, nonce and PKCE verification on the return leg.
  const authenticated = await identity.init({ onLoad: 'login-required', checkLoginIframe: false,
    pkceMethod: 'S256', responseMode: 'query', redirectUri: `${location.origin}${BASE}login.html` });
  if (!authenticated || !identity.token || !identity.refreshToken || !identity.idToken)
    throw new Error('invalid_login');
  sessionStorage.removeItem(REQUEST_KEY);
  authentication.notifySuccess(JSON.stringify({ request: expected, token: identity.token,
    refreshToken: identity.refreshToken, idToken: identity.idToken }));
}

void login().catch(() => {
  sessionStorage.removeItem(REQUEST_KEY);
  const status = document.getElementById('status');
  if (status) status.textContent = 'Giriş tamamlanamadı. Panelden yeniden deneyin.';
  authentication.notifyFailure('AuthenticationFailed');
});
