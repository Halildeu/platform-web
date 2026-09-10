# platform-web#1155 (2026-09-10): AG Grid 34 (Theming API) injects its styles at runtime;
# `style-src 'self'` blocked them and the case grid rendered collapsed (headers stacked,
# no rows) — measured by scripts/acceptance/etik-speak-manager-browser-smoke on the test
# cell, 35 CSP violations per session. `'unsafe-inline'` is granted to style-src ONLY, the
# same directive the shell's canonical policy carries (scripts/security/check-nginx-csp.mjs
# MAIN_CSP); script-src stays 'self' and script-src-attr 'none' closes inline handlers.
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" always;
add_header Referrer-Policy "no-referrer" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
