// Keycloak silent SSO check — externalized from silent-check-sso.html for CSP
// `script-src 'self'` (Faz 22 Sec slice-1). Loaded same-origin inside the KC
// silent-check iframe; posts the current URL back to the parent so the KC
// adapter can complete the silent token check.
parent.postMessage(location.href, location.origin);
