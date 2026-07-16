#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  BUILD_INFO_SCHEMA_VERSION,
  collectRootEntrypoints,
} from './build-info-contract.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDir, '..', '..');
const outputDir = path.resolve(webRoot, 'dist/ubuntu-single-domain');

// Faz 19 post-cutover: MFE remotes genişletildi
// User bulgusu 2026-04-25: /admin/schema-explorer remoteEntry.js yüklenemedi
// Kök sebep: build-single-domain.mjs sadece 4 MFE alıyordu (access/audit/reporting/users)
// Shell routing 7 MFE bekliyor (+ schema-explorer + suggestions + ethic)
// Faz 22 Web endpoint-admin (#653): mfe-endpoint-admin testai-only — bu
// listeye aşağıda (publicOrigin hesaplandıktan sonra) `endpointAdminEnabled`
// koşuluyla push edilir.
// ATS-0019 39c-3c: mfe-interview-evidence de aynı pattern — STAGE'de (testai)
// otomatik, prod'da yalnız env-flag ile; `interviewEvidenceEnabled` koşuluyla
// aşağıda push edilir (default-disabled → testai-görünür kademeli açılış).
const coreRemotes = [
  { app: 'mfe-access', slug: 'access' },
  { app: 'mfe-audit', slug: 'audit' },
  { app: 'mfe-reporting', slug: 'reporting' },
  { app: 'mfe-users', slug: 'users' },
  { app: 'mfe-schema-explorer', slug: 'schema-explorer' },
  { app: 'mfe-suggestions', slug: 'suggestions' },
  { app: 'mfe-ethic', slug: 'ethic' },
];

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function normalizeOriginValue(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return trimTrailingSlash(trimmed);
}

function normalizePathPrefix(value) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '/') return '/';
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

function runBuild(app, env) {
  const result = spawnSync('npm', ['run', 'build', '--prefix', `apps/${app}`], {
    cwd: webRoot,
    env: {
      ...process.env,
      ...env,
    },
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function ensureDir(target) {
  mkdirSync(target, { recursive: true });
}

function copyDirContents(sourceDir, targetDir) {
  ensureDir(targetDir);
  for (const entry of readdirSync(sourceDir)) {
    cpSync(path.join(sourceDir, entry), path.join(targetDir, entry), { recursive: true });
  }
}

function writeManifest(origin, remotes) {
  const manifest = {
    origin,
    gatewayUrl: `${origin}/api`,
    shell: {
      app: 'mfe-shell',
      basePath: '/',
      remoteEntry: `${origin}/remoteEntry.js`,
    },
    remotes: remotes.map(({ app, slug }) => ({
      app,
      slug,
      basePath: `/remotes/${slug}/`,
      remoteEntry: `${origin}/remotes/${slug}/remoteEntry.js`,
    })),
  };

  writeFileSync(
    path.join(outputDir, 'single-domain-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
}

/* ------------------------------------------------------------------ */
/* iter-50 Step 2 — build-info.json sentinel                          */
/*                                                                     */
/* Codex 019dded6 sertleştirme: artifact identity + deploy reachability*/
/* için stabil, primary verify kaynağı. HTTP 200'de döndüğünde         */
/* deploy chain'in son halkası (host nginx serve) doğrulanmış olur.   */
/*                                                                     */
/* sha priority: build-arg → GITHUB_SHA → git rev-parse HEAD → unknown */
/* assets[] / remotes[].assets[] post-build dizin tarama ile dolar.   */
/* imageDigest CI'da tag-resolve sonrası boş bırakılabilir.           */
/* ------------------------------------------------------------------ */

function resolveBuildSha() {
  // 1. Açık build arg (en güçlü)
  const explicit = (process.env.BUILD_SHA || process.env.WEB_BUILD_SHA || '').trim();
  if (explicit) return explicit;

  // 2. GitHub Actions native env
  const githubSha = (process.env.GITHUB_SHA || '').trim();
  if (githubSha) return githubSha;

  // 3. Local git (dev veya ad-hoc build)
  try {
    const result = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: webRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    if (result.status === 0) {
      const value = (result.stdout || '').trim();
      if (value) return value;
    }
  } catch {
    /* ignore — fall through */
  }

  // 4. Last-resort sentinel
  return 'unknown';
}

function resolveBuildRef() {
  return (
    (process.env.BUILD_REF || process.env.GITHUB_REF_NAME || process.env.GITHUB_REF || '').trim() ||
    'unknown'
  );
}

function listAssetsIn(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /\.(js|css|map|json)$/i.test(f)).sort();
}

function writeBuildInfo(origin, remotes, sha) {
  const shortSha = sha === 'unknown' ? 'unknown' : sha.slice(0, 7);
  const rootEntrypoints = collectRootEntrypoints(outputDir);
  // Legacy basename retained for older diagnostics. v2 consumers MUST use
  // rootEntrypoints[].path + bodySha256 for the content-addressed contract.
  const rootEntry = path.posix.basename(rootEntrypoints[0].path);
  const rootAssets = listAssetsIn(path.join(outputDir, 'assets'));
  const remoteEntries = remotes.map(({ app, slug }) => ({
    app,
    slug,
    remoteEntry: `${origin}/remotes/${slug}/remoteEntry.js`,
    assets: listAssetsIn(path.join(outputDir, 'remotes', slug, 'assets')),
  }));

  const buildInfo = {
    schemaVersion: BUILD_INFO_SCHEMA_VERSION,
    sha,
    shortSha,
    ref: resolveBuildRef(),
    image: process.env.BUILD_IMAGE || '',
    imageDigest: process.env.BUILD_IMAGE_DIGEST || '',
    buildTime: new Date().toISOString(),
    origin,
    rootEntry,
    rootEntrypoints,
    assets: rootAssets,
    remotes: remoteEntries,
  };

  writeFileSync(
    path.join(outputDir, 'build-info.json'),
    `${JSON.stringify(buildInfo, null, 2)}\n`,
    'utf8',
  );

  // Inject window.__BUILD_SHA__ for runtime correlation (secondary signal;
  // primary verify source is the build-info.json HTTP fetch).
  //
  // CodeQL flagged the prior `existsSync → readFileSync` pattern as TOCTOU
  // (file may change between check and use). Single try/readFileSync keeps
  // the operation atomic at the syscall level; ENOENT just means we skipped
  // index.html injection (build never produced it), which is fine for the
  // sentinel — primary signal is build-info.json above.
  const indexHtmlPath = path.join(outputDir, 'index.html');
  let original = null;
  try {
    original = readFileSync(indexHtmlPath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      console.log(`[ubuntu] window.__BUILD_SHA__ inject skipped: ${indexHtmlPath} not present`);
    } else {
      throw err;
    }
  }
  if (original !== null) {
    const marker = '<!-- __BUILD_SHA_INJECTED__ -->';
    if (!original.includes(marker)) {
      const safeSha = JSON.stringify(shortSha);
      const injectedScript = `${marker}\n  <script>window.__BUILD_SHA__ = ${safeSha};</script>`;
      const replaced = original.replace('</head>', `  ${injectedScript}\n  </head>`);
      writeFileSync(indexHtmlPath, replaced, 'utf8');
    }
  }

  console.log(
    `[ubuntu] wrote build-info.json (sha=${shortSha}, rootEntry=${rootEntry ?? 'n/a'}, remotes=${remoteEntries.length})`,
  );
}

const PROD_PUBLIC_ORIGIN = 'https://ai.acik.com';
const STAGE_PUBLIC_ORIGIN = 'https://testai.acik.com';
const deployEnv = (process.env.DEPLOY_ENV || process.env.WEB_DEPLOY_ENV || '').trim().toLowerCase();
const isStageLikeDeploy = ['stage', 'staging', 'test'].includes(deployEnv);

function resolvePublicOrigin(...candidates) {
  for (const candidate of candidates) {
    const normalized = normalizeOriginValue(candidate);
    if (!normalized) {
      continue;
    }
    if (isStageLikeDeploy && normalized === PROD_PUBLIC_ORIGIN) {
      continue;
    }
    return normalized;
  }

  return isStageLikeDeploy ? STAGE_PUBLIC_ORIGIN : PROD_PUBLIC_ORIGIN;
}

function resolveKeycloakPublicUrl(publicOrigin, ...candidates) {
  for (const candidate of candidates) {
    const normalized = normalizeOriginValue(candidate);
    if (!normalized) {
      continue;
    }
    if (isStageLikeDeploy && normalized === PROD_PUBLIC_ORIGIN) {
      continue;
    }
    return normalized;
  }

  return publicOrigin;
}

function resolveKeycloakRealm(...candidates) {
  for (const candidate of candidates) {
    const normalized = String(candidate ?? '').trim();
    if (!normalized) {
      continue;
    }
    if (isStageLikeDeploy && normalized === 'serban') {
      continue;
    }
    return normalized;
  }

  return isStageLikeDeploy ? 'platform-test' : 'serban';
}

const publicOrigin = resolvePublicOrigin(
  process.env.WEB_PUBLIC_ORIGIN ||
    process.env.VITE_FRONTEND_PUBLIC_ORIGIN ||
    process.env.FRONTEND_PUBLIC_ORIGIN ||
    PROD_PUBLIC_ORIGIN,
);
const remoteEntryUrlFor = (slug) => `${publicOrigin}/remotes/${slug}/remoteEntry.js`;

// Faz 22 Web endpoint-admin runtime acceptance (#653): historically
// testai-only. Faz 22.5 GA (owner 2026-06-10 "ga açalım", platform-web#806):
// the prod variant now opts in via VITE_SHELL_ENABLE_ENDPOINT_ADMIN_REMOTE
// (Dockerfile ARG→ENV from the ci-web-image-push prod matrix) — same flag +
// truthy set the shell reads at runtime (shell-navigation readEnvBoolean), so
// build inclusion and runtime gating stay in lockstep. testai stays
// unconditionally enabled (origin match), independent of the flag.
const envFlagTruthy = (value) =>
  ['1', 'true', 'yes', 'on'].includes(
    String(value ?? '')
      .trim()
      .toLowerCase(),
  );
const endpointAdminEnabled =
  publicOrigin === STAGE_PUBLIC_ORIGIN ||
  envFlagTruthy(
    process.env.VITE_SHELL_ENABLE_ENDPOINT_ADMIN_REMOTE ??
      process.env.SHELL_ENABLE_ENDPOINT_ADMIN_REMOTE,
  );
if (endpointAdminEnabled) {
  coreRemotes.push({ app: 'mfe-endpoint-admin', slug: 'endpoint-admin' });
}
// ATS-0019 39c-3c: interview-evidence, endpoint-admin ile aynı kademeli açılış —
// STAGE (testai) origin'de otomatik enabled; prod'da yalnız explicit env-flag.
const interviewEvidenceEnabled =
  publicOrigin === STAGE_PUBLIC_ORIGIN ||
  envFlagTruthy(
    process.env.VITE_SHELL_ENABLE_INTERVIEW_EVIDENCE_REMOTE ??
      process.env.SHELL_ENABLE_INTERVIEW_EVIDENCE_REMOTE,
  );
if (interviewEvidenceEnabled) {
  coreRemotes.push({ app: 'mfe-interview-evidence', slug: 'interview-evidence' });
}
// Faz 24 mfe-meeting — interview-evidence / endpoint-admin ile aynı kademeli açılış:
// STAGE (testai) origin'de otomatik enabled; prod'da yalnız explicit env-flag.
// Shell (Sidebar/AppRouter/vite.config) meeting remote'unu zaten VITE_SHELL_ENABLE_MEETING_REMOTE
// + MFE_MEETING_URL ile flag-gated wire'lı; eksik olan tek şey bu build'de remote'un
// derlenip serve edilmesi + shellEnv flag'inin set edilmesiydi (aşağıda shellEnv spread).
const meetingEnabled =
  publicOrigin === STAGE_PUBLIC_ORIGIN ||
  envFlagTruthy(
    process.env.VITE_SHELL_ENABLE_MEETING_REMOTE ??
      process.env.SHELL_ENABLE_MEETING_REMOTE,
  );
if (meetingEnabled) {
  coreRemotes.push({ app: 'mfe-meeting', slug: 'meeting' });
}
const authMode =
  process.env.VITE_AUTH_MODE || process.env.AUTH_MODE || process.env.WEB_AUTH_MODE || 'keycloak';
const keycloakUrl = resolveKeycloakPublicUrl(
  publicOrigin,
  process.env.VITE_KEYCLOAK_URL ||
    process.env.KEYCLOAK_URL ||
    process.env.KEYCLOAK_PUBLIC_URL ||
    process.env.WEB_KEYCLOAK_PUBLIC_URL ||
    publicOrigin,
);
const keycloakRealm = resolveKeycloakRealm(
  process.env.VITE_KEYCLOAK_REALM ||
  process.env.KEYCLOAK_REALM ||
  process.env.WEB_KEYCLOAK_REALM ||
  'serban',
);
const keycloakClientId =
  process.env.VITE_KEYCLOAK_CLIENT_ID ||
  process.env.KEYCLOAK_CLIENT_ID ||
  process.env.WEB_KEYCLOAK_CLIENT_ID ||
  'frontend';

const STAGE_EXPORT_PROFILE_JSON = JSON.stringify({
  version: 1,
  binding: { interviewId: 'iv-smoke-1' },
  generatorVersionRef: 'ats-app-boot-stage',
  locale: 'tr-TR',
  timezone: 'Europe/Istanbul',
  aiAssistanceDisclosureRef: 'disclosure-eu-ai-act-m50-v1',
  rubricVersionRef: 'rubric-stage-v1',
  redactionPolicyRef: 'redaction-policy-stage-v1',
  redactionRunRef: 'redaction-run-stage-smoke',
  retentionPolicyRef: 'retention-policy-stage-v1',
  signatureRef: 'signature-stage-smoke',
  schemaDigest: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  criteria: [
    { criterionId: 'crit-communication', jobRelatednessRationaleRef: 'jr-communication-v1' },
    { criterionId: 'crit-experience', jobRelatednessRationaleRef: 'jr-experience-v1' },
  ],
});

const shellEnv = {
  SINGLE_DOMAIN_BUILD: '1',
  APP_BASE_PATH: '/',
  VITE_APP_BASE_PATH: '/',
  AUTH_MODE: authMode,
  VITE_AUTH_MODE: authMode,
  VITE_GATEWAY_URL: process.env.VITE_GATEWAY_URL || `${publicOrigin}/api`,
  FRONTEND_PUBLIC_ORIGIN:
    process.env.FRONTEND_PUBLIC_ORIGIN || process.env.WEB_PUBLIC_ORIGIN || publicOrigin,
  VITE_FRONTEND_PUBLIC_ORIGIN:
    process.env.VITE_FRONTEND_PUBLIC_ORIGIN || process.env.WEB_PUBLIC_ORIGIN || publicOrigin,
  KEYCLOAK_URL: keycloakUrl,
  VITE_KEYCLOAK_URL: keycloakUrl,
  KEYCLOAK_REALM: keycloakRealm,
  VITE_KEYCLOAK_REALM: keycloakRealm,
  KEYCLOAK_CLIENT_ID: keycloakClientId,
  VITE_KEYCLOAK_CLIENT_ID: keycloakClientId,
  MFE_ACCESS_URL: remoteEntryUrlFor('access'),
  VITE_MFE_ACCESS_URL: remoteEntryUrlFor('access'),
  MFE_AUDIT_URL: remoteEntryUrlFor('audit'),
  VITE_MFE_AUDIT_URL: remoteEntryUrlFor('audit'),
  MFE_REPORTING_URL: remoteEntryUrlFor('reporting'),
  VITE_MFE_REPORTING_URL: remoteEntryUrlFor('reporting'),
  MFE_USERS_URL: remoteEntryUrlFor('users'),
  VITE_MFE_USERS_URL: remoteEntryUrlFor('users'),
  // Faz 19 post-cutover fix: 3 MFE daha enable + URL (user raporu schema-explorer 404)
  MFE_SCHEMA_EXPLORER_URL: remoteEntryUrlFor('schema-explorer'),
  VITE_MFE_SCHEMA_EXPLORER_URL: remoteEntryUrlFor('schema-explorer'),
  MFE_SUGGESTIONS_URL: remoteEntryUrlFor('suggestions'),
  VITE_MFE_SUGGESTIONS_URL: remoteEntryUrlFor('suggestions'),
  MFE_ETHIC_URL: remoteEntryUrlFor('ethic'),
  VITE_MFE_ETHIC_URL: remoteEntryUrlFor('ethic'),
  VITE_SHELL_ENABLE_ACCESS_REMOTE: '1',
  SHELL_ENABLE_ACCESS_REMOTE: '1',
  VITE_SHELL_ENABLE_AUDIT_REMOTE: '1',
  SHELL_ENABLE_AUDIT_REMOTE: '1',
  VITE_SHELL_ENABLE_USERS_REMOTE: '1',
  SHELL_ENABLE_USERS_REMOTE: '1',
  VITE_SHELL_ENABLE_REPORTING_REMOTE: '1',
  SHELL_ENABLE_REPORTING_REMOTE: '1',
  // Faz 19 fix: disable → enable (3 MFE)
  VITE_SHELL_ENABLE_SUGGESTIONS_REMOTE: '1',
  SHELL_ENABLE_SUGGESTIONS_REMOTE: '1',
  VITE_SHELL_ENABLE_ETHIC_REMOTE: '1',
  SHELL_ENABLE_ETHIC_REMOTE: '1',
  VITE_SHELL_ENABLE_SCHEMA_EXPLORER_REMOTE: '1',
  SHELL_ENABLE_SCHEMA_EXPLORER_REMOTE: '1',
  // Faz 22 Web endpoint-admin runtime acceptance (#653): testai-only remote
  // URL + build/runtime enable flags. Empty spread for the prod build
  // (endpointAdminEnabled false) so vite.config buildRemotes() omits the
  // manifest entry and lazy-routes DCE's the static import.
  ...(endpointAdminEnabled
    ? {
        MFE_ENDPOINT_ADMIN_URL: remoteEntryUrlFor('endpoint-admin'),
        VITE_MFE_ENDPOINT_ADMIN_URL: remoteEntryUrlFor('endpoint-admin'),
        SHELL_ENABLE_ENDPOINT_ADMIN_REMOTE: '1',
        VITE_SHELL_ENABLE_ENDPOINT_ADMIN_REMOTE: '1',
      }
    : {}),
  // ATS-0019 39c-3c: interview-evidence — endpoint-admin mirror. Kapalıysa
  // (prod default) boş spread → shell vite.config buildRemotes() STUB üretir,
  // AppRouter /home'a Navigate eder; testai'de flag ON → gerçek mount.
  ...(interviewEvidenceEnabled
    ? {
        MFE_INTERVIEW_EVIDENCE_URL: remoteEntryUrlFor('interview-evidence'),
        VITE_MFE_INTERVIEW_EVIDENCE_URL: remoteEntryUrlFor('interview-evidence'),
        SHELL_ENABLE_INTERVIEW_EVIDENCE_REMOTE: '1',
        VITE_SHELL_ENABLE_INTERVIEW_EVIDENCE_REMOTE: '1',
      }
    : {}),
  // 39d-6: STAGE'de canlı /api/ats READ EXPLICIT enjekte edilir (Codex 019f50b7:
  // "STAGE olduğu için otomatik" değil, STAGE dalının açık değer yazması).
  // Prod'da anahtar YOK → MFE default 'demo' (fail-safe). iv-smoke-1 = 39d-4
  // D29 smoke'unun SENTETİK fixture interview'u (gerçek aday verisi DEĞİL;
  // ATS-0016/G0 sınırı) — uygulama koduna hardcode edilmez, buradan enjekte edilir.
  ...(interviewEvidenceEnabled && publicOrigin === STAGE_PUBLIC_ORIGIN
    ? {
        INTERVIEW_EVIDENCE_DATA_MODE: 'live',
        VITE_INTERVIEW_EVIDENCE_DATA_MODE: 'live',
        INTERVIEW_EVIDENCE_INTERVIEW_ID: 'iv-smoke-1',
        VITE_INTERVIEW_EVIDENCE_INTERVIEW_ID: 'iv-smoke-1',
        // 39d-7d export (F7) profili — SENTETİK stage değerleri (opak pointer;
        // secret YOK; binding iv-smoke-1'e kilitli — yanlış mülakata export
        // MFE'de fail-closed). Şema: mfe-interview-evidence exportProfile.ts
        // ExportProfileV1 (strict parser). Backend schemaDigest'i yalnız
        // 64-hex FORMAT doğrular (ExportService.validateContext) — eşleşme
        // kontrolü packet-integrity alanına gömülür.
        INTERVIEW_EVIDENCE_EXPORT_PROFILE: STAGE_EXPORT_PROFILE_JSON,
        VITE_INTERVIEW_EVIDENCE_EXPORT_PROFILE: STAGE_EXPORT_PROFILE_JSON,
      }
    : {}),
  // Faz 24 mfe-meeting — interview-evidence mirror. Kapalıysa (prod default) boş
  // spread → shell vite.config buildRemotes() STUB üretir, AppRouter /home'a
  // Navigate eder; testai'de flag ON → gerçek mount (/admin/meetings, MEETING/TRANSCRIPT modül).
  ...(meetingEnabled
    ? {
        MFE_MEETING_URL: remoteEntryUrlFor('meeting'),
        VITE_MFE_MEETING_URL: remoteEntryUrlFor('meeting'),
        SHELL_ENABLE_MEETING_REMOTE: '1',
        VITE_SHELL_ENABLE_MEETING_REMOTE: '1',
      }
    : {}),
};

const shellRemoteUrl = `${publicOrigin}/remoteEntry.js`;
const reportingRemoteUrl = remoteEntryUrlFor('reporting');

rmSync(outputDir, { recursive: true, force: true });
ensureDir(outputDir);

for (const remote of coreRemotes) {
  const basePath = normalizePathPrefix(`/remotes/${remote.slug}/`);
  const remoteEnv = {
    SINGLE_DOMAIN_BUILD: '1',
    APP_BASE_PATH: basePath,
    VITE_APP_BASE_PATH: basePath,
    MFE_SHELL_URL: shellRemoteUrl,
    VITE_MFE_SHELL_URL: shellRemoteUrl,
  };

  if (remote.slug === 'users') {
    remoteEnv.MFE_REPORTING_URL = reportingRemoteUrl;
    remoteEnv.VITE_MFE_REPORTING_URL = reportingRemoteUrl;
  }

  runBuild(remote.app, remoteEnv);
}

runBuild('mfe-shell', shellEnv);

copyDirContents(path.join(webRoot, 'apps/mfe-shell/dist'), outputDir);
for (const remote of coreRemotes) {
  const sourceDir = path.join(webRoot, `apps/${remote.app}/dist`);
  if (!existsSync(sourceDir)) {
    throw new Error(`build output missing: ${sourceDir}`);
  }
  copyDirContents(sourceDir, path.join(outputDir, 'remotes', remote.slug));
}

/* 2026-04-25 Faz 19.MSSQL.O: MFE asset merge to root /assets/
 * Vite Module Federation child build CSS/JS preload absolute path `/assets/...`
 * generates (relative `./assets/` desteklenmiyor MF v2 virtual_mf pattern'inde).
 * Tarayıcı runtime: GET /assets/App-XXX.css → 404 (dosya /remotes/<slug>/assets/'da)
 * → "Unable to preload CSS" → React tree çökmesi.
 * Fix: her remote'un assets dosyalarını root /assets/'a kopyala (dest hardlink yok,
 *      build output relative kalır). Çakışma olursa shell asset'leri öncelikli (zaten
 *      root /assets/'da olur copyDirContents ile shell-first).
 */
const rootAssetsDir = path.join(outputDir, 'assets');
ensureDir(rootAssetsDir);
let mergedCount = 0;
for (const remote of coreRemotes) {
  const remoteAssetsDir = path.join(outputDir, 'remotes', remote.slug, 'assets');
  if (!existsSync(remoteAssetsDir)) continue;
  for (const file of readdirSync(remoteAssetsDir)) {
    const src = path.join(remoteAssetsDir, file);
    const dest = path.join(rootAssetsDir, file);
    if (!existsSync(dest)) {
      copyFileSync(src, dest);
      mergedCount += 1;
    }
  }
}
console.log(`[ubuntu] merged ${mergedCount} MFE asset files to root /assets/`);

writeManifest(publicOrigin, coreRemotes);

// iter-50 Step 2 — build-info.json sentinel + window.__BUILD_SHA__ injection.
// MUST run after writeManifest so root /assets/ merge is finalized.
writeBuildInfo(publicOrigin, coreRemotes, resolveBuildSha());

console.log(`[ubuntu] assembled single-domain bundle at ${outputDir}`);
