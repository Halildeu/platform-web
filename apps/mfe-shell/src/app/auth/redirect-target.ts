/**
 * Return-to / redirect_uri hygiene helpers (platform-web#1200).
 *
 * RFC 6749 §3.1.2: the OAuth redirection endpoint URI MUST NOT include a
 * fragment. Keycloak (response_mode=fragment) appends `#state=…&code=…` to
 * whatever redirect_uri we send. If that URI already carries a fragment —
 * most dangerously a *previous, unconsumed* callback — the new callback is
 * glued onto the old one, keycloak-js matches the stale `state` first and
 * declares the user unauthenticated, and the app bounces back to /login
 * with the same poisoned return-to. Live symptom: "login olunca anasayfa
 * açılmıyor, gene login'e yönlendiriyor" (KC LOGIN event redirect_uri =
 * `…/hr-demografik-yapi#state=…&session_state=…&iss=…&code=…`).
 *
 * The shell never uses the URL fragment for its own routing or state, so a
 * fragment on an app path carries no information worth preserving.
 */

/** Drop everything from the first `#` on. Empty input stays empty. */
export const stripUrlFragment = (value: string): string => {
  const hashIndex = value.indexOf('#');
  return hashIndex === -1 ? value : value.slice(0, hashIndex);
};

/**
 * True when the given `location.hash` looks like an unconsumed Keycloak
 * authorization-code callback. Both `code` and `state` are required so an
 * unrelated hash that merely mentions `code` is not mistaken for one.
 */
export const hasOidcCallbackFragment = (hash: string | null | undefined): boolean => {
  if (!hash) {
    return false;
  }
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return params.has('code') && params.has('state');
};
