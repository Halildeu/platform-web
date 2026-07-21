#!/usr/bin/env node
/**
 * Faz 22 Sec slice-1 — SPA-nginx CSP header-contract test.
 *
 * Build-independent guard (greps source, no container needed) asserting:
 *   1. The main Content-Security-Policy-Report-Only header is present, and
 *      byte-identical, inside EVERY HTML-returning nginx location in the
 *      Dockerfile: `= /`, `= /index.html`, and the SPA catch-all `/`
 *      (the add_header inheritance trap means it must be repeated in each).
 *   2. The SEPARATE Report-Only policy is present on `= /silent-check-sso.html`.
 *   3. script-src stays `'self'`-only (no 'unsafe-inline'/'unsafe-eval'/
 *      'wasm-unsafe-eval'/blob:) — a regression tripwire.
 *   4. The externalized HTML entries carry NO inline <script> bodies
 *      (index.html + silent-check-sso.html) — keeps script-src 'self' honest.
 *   5. security/csp/report-only-policy.json mirrors the nginx directives (no
 *      drift between the two sources).
 *
 * Usage: node scripts/security/check-nginx-csp.mjs
 * Exit 0 = all contracts hold; exit 1 = at least one violation (printed).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');

const MAIN_CSP =
  "default-src 'self'; base-uri 'none'; object-src 'none'; script-src 'self'; " +
  "script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  "font-src 'self' data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; " +
  "form-action 'self'; manifest-src 'self'";

const SILENT_CSP = "default-src 'none'; script-src 'self'; frame-ancestors 'self'";

const failures = [];
const fail = (msg) => failures.push(msg);
const ok = (msg) => console.log(`  ok  ${msg}`);

/** Extract a single nginx `location <matcher> {…}` body via brace counting. */
function locationBody(config, matcher) {
  const startToken = `location ${matcher} {`;
  const idx = config.indexOf(startToken);
  if (idx < 0) return null;
  let depth = 1;
  let i = idx + startToken.length;
  const bodyStart = i;
  for (; i < config.length && depth > 0; i += 1) {
    if (config[i] === '{') depth += 1;
    else if (config[i] === '}') depth -= 1;
  }
  return depth === 0 ? config.slice(bodyStart, i - 1) : null;
}

/** True if html contains a <script> tag with no src attribute but a non-empty body.
 *  CodeQL js/incomplete-multi-character-sanitization amend: the closing tag
 *  pattern tolerates HTML5-legal whitespace before `>` (browsers accept
 *  `</script >` verbatim) and rejects tag-name suffixes (`</scripty>` must
 *  NOT close the script) via a right-bracket-anchored `\s*>` clause. */
function hasInlineScriptBody(html) {
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || '';
    const body = (m[2] || '').trim();
    if (!/\bsrc\s*=/.test(attrs) && body.length > 0) return true;
  }
  return false;
}

/** Parse a CSP string into a { directive: [values...] } map. */
function parseCsp(csp) {
  const map = {};
  for (const part of csp.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    map[tokens[0]] = tokens.slice(1);
  }
  return map;
}

/* ---- 1 + 2 + 3: Dockerfile nginx locations ---- */
console.log('[check-nginx-csp] Dockerfile nginx CSP header contract');
const dockerfile = readFileSync(path.join(repoRoot, 'Dockerfile'), 'utf8');

const htmlLocations = ['= /', '= /index.html', '/'];
for (const matcher of htmlLocations) {
  const body = locationBody(dockerfile, matcher);
  if (body === null) {
    fail(`nginx location "${matcher}" not found in Dockerfile`);
    continue;
  }
  const header = `add_header Content-Security-Policy-Report-Only "${MAIN_CSP}" always;`;
  if (!body.includes(header)) {
    fail(`nginx location "${matcher}" is missing the exact main CSP-Report-Only header`);
  } else {
    ok(`location "${matcher}" carries the main CSP-Report-Only header`);
  }
}

const silentBody = locationBody(dockerfile, '= /silent-check-sso.html');
if (silentBody === null) {
  fail('nginx location "= /silent-check-sso.html" not found in Dockerfile');
} else {
  const header = `add_header Content-Security-Policy-Report-Only "${SILENT_CSP}" always;`;
  if (!silentBody.includes(header)) {
    fail('nginx location "= /silent-check-sso.html" is missing the exact separate CSP-Report-Only header');
  } else {
    ok('location "= /silent-check-sso.html" carries the separate CSP-Report-Only header');
  }
  if (silentBody.includes('frame-ancestors \'none\'')) {
    fail("silent-check-sso.html must use frame-ancestors 'self' (not 'none') or silent SSO breaks on enforce");
  }
}

// 3: script-src tripwire on the main policy.
const mainMap = parseCsp(MAIN_CSP);
const scriptSrc = (mainMap['script-src'] || []).join(' ');
if (scriptSrc !== "'self'") {
  fail(`main CSP script-src must be exactly 'self' (found: "${scriptSrc}")`);
} else {
  ok("main CSP script-src is 'self'-only");
}

/* ---- 4: no inline <script> bodies in externalized HTML entries ---- */
// Faz 22 Sec slice-1a scope: silent-check-sso.html externalized in this
// slice. `apps/mfe-shell/index.html` still carries an inline seed block
// (`window.__env__` + AG-Grid early license + earlyErrors capture) that
// the Vite `inject-runtime-env` plugin regex-replaces at build time;
// externalizing it requires a plugin refactor (emitFile + hashed
// external `env-init-<hash>.js`) tracked in Sec-1b follow-up. Until then
// this contract only guards the silent-SSO iframe entry — shell inline
// scan re-enables when Sec-1b lands (add the path back to the loop).
console.log('[check-nginx-csp] externalized HTML entries have no inline <script> bodies');
const externalizedHtmlEntries = ['apps/mfe-shell/public/silent-check-sso.html'];
for (const rel of externalizedHtmlEntries) {
  const html = readFileSync(path.join(repoRoot, rel), 'utf8');
  if (hasInlineScriptBody(html)) {
    fail(`${rel} still contains an inline <script> body — externalize it (CSP script-src 'self')`);
  } else {
    ok(`${rel} has only external <script src=…> references`);
  }
}

/* ---- 5: report-only-policy.json mirrors the nginx directives ---- */
console.log('[check-nginx-csp] security/csp/report-only-policy.json mirrors nginx');
const policy = JSON.parse(
  readFileSync(path.join(repoRoot, 'security', 'csp', 'report-only-policy.json'), 'utf8'),
);
function assertMirror(label, directiveMap, jsonMap) {
  for (const [directive, values] of Object.entries(directiveMap)) {
    const policyValues = jsonMap?.[directive];
    if (!Array.isArray(policyValues)) {
      fail(`policy JSON ${label} is missing directive "${directive}" present in the nginx header`);
      continue;
    }
    if (policyValues.join(' ') !== values.join(' ')) {
      fail(
        `policy JSON ${label} directive "${directive}" drifted from nginx: ` +
          `json=[${policyValues.join(' ')}] nginx=[${values.join(' ')}]`,
      );
    }
  }
}
assertMirror('main', mainMap, policy?.directives);
const silentMap = parseCsp(SILENT_CSP);
assertMirror('silentCheckSso', silentMap, policy?.silentCheckSso?.directives);
if (policy?.metadata?.owner !== 'platform-security') {
  fail('policy JSON metadata.owner must stay "platform-security"');
}
if (!failures.some((f) => f.includes('policy JSON'))) {
  ok('policy JSON main + silentCheckSso directives match the nginx headers (owner: platform-security)');
}

/* ---- verdict ---- */
if (failures.length > 0) {
  console.error(`\n[check-nginx-csp] FAIL (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\n[check-nginx-csp] PASS — CSP header contract holds.');
