# Frontend MFE — K8s deployment Docker image
# Multi-stage build: pnpm install + build + nginx serve
# Used by platform-k8s-gitops kustomize/base/apps/frontend/deployment.yaml
# GHCR target (2 env): ghcr.io/halildeu/platform-ssot-frontend-{prod,testai}:sha-<short>
#
# 2026-04-20: ADR-0002 Faz E env-per-build (host nginx sub_filter hack kaldır).
# Build context: ./web (workflow frontend-image.yml)
#
# Build args (default: prod):
#   --build-arg VITE_KEYCLOAK_URL=https://ai.acik.com
#   --build-arg VITE_KEYCLOAK_REALM=serban
#   --build-arg VITE_FRONTEND_PUBLIC_ORIGIN=https://ai.acik.com
# Test build:
#   --build-arg VITE_KEYCLOAK_URL=https://testai.acik.com
#   --build-arg VITE_KEYCLOAK_REALM=platform-test
#   --build-arg VITE_FRONTEND_PUBLIC_ORIGIN=https://testai.acik.com

# Stage 1: Builder
FROM node:22-alpine AS builder

# Build-time env (webpack DefinePlugin inline; runtime'da process.env[key] bulur)
ARG VITE_KEYCLOAK_URL=https://ai.acik.com
ARG VITE_KEYCLOAK_REALM=serban
ARG VITE_KEYCLOAK_CLIENT_ID=frontend
ARG VITE_FRONTEND_PUBLIC_ORIGIN=https://ai.acik.com
ARG VITE_GATEWAY_URL=https://ai.acik.com
ARG VITE_AUTH_MODE=keycloak
# AG Grid lisansı: TEK KAYNAK = GitHub Secret AG_GRID_LICENSE_KEY (CI build-arg
# olarak VITE_AG_GRID_LICENSE_KEY ismiyle pass edilir). Bundle'da tek kez
# (`window.__env__.VITE_AG_GRID_LICENSE_KEY`) görünür; non-VITE alias yok.
ARG VITE_AG_GRID_LICENSE_KEY=""
# iter-50 Step 3.1 (Codex 019dded6): build-info.json sentinel için explicit
# SHA/REF — `.git` kontekste güvenmek riskli (Docker build context çoğu
# zaman .dockerignore git'i hariç tutar; CI'da git context yok).
ARG BUILD_SHA=""
ARG BUILD_REF=""
# build-info v2 producer identity. The digest is resolved only after push, but
# the immutable commit tag is deterministic before the image build starts.
ARG BUILD_IMAGE=""

# PERF-INIT-V2 PR-B5b1 (canary) — MFE on-demand bootstrap build-time flag.
# When set to `1`/`true`/`yes`/`on`, the shell `vite.config.ts` reader
# (`readSuggestionsOnDemandBuildFlag`) returns true and the
# `__MFE_SUGGESTIONS_ON_DEMAND__` define switches `lazy-routes.ts` to the
# on-demand `host.registerRemotes`/`host.loadRemote` path; Rolldown dead-
# code-eliminates the static `import('mfe_suggestions/SuggestionsApp')`
# specifier from the bundle, and `federation({remotes})` omits the
# `mfe_suggestions` entry — no eager `/remotes/suggestions/remoteEntry.js`
# fetch at host bootstrap. Default off keeps the eager federation
# manifest intact (no regression on prod). Set via build-arg from
# `ci-web-image-push.yml` matrix (`testai` variant gets the canary).
# Rollback semantic: rebuild with flag off (post-build runtime override
# is NOT possible because the inverse branch is DCE'd; see B5b3-prep
# audit `apps/mfe-shell/src/app/config/mfe-bootstrap-flag.ts`).
ARG VITE_MFE_ON_DEMAND_BOOTSTRAP="false"

# Faz 23.7 M7 T4.2 PR-W5 follow-up — Web Push Protocol VAPID public key.
# Backend Vault `kv/platform/notification-orchestrator/vapid_public_key`
# ile sync olmalı (operator action — RB-graph-mail-adapter-activation pattern).
# Public key gizli değil; GitHub Actions `vars` ile build-arg pass edilir.
# Empty default → frontend PushSubscriptionCard "configuration missing"
# warning state'inde gösterir (fail-closed UI; subscribe button disabled).
ARG VITE_NOTIFY_VAPID_PUBLIC_KEY=""

# Faz 22.5 — endpoint-admin remote GA gate (gitops#1436 backplane + #1438 modal).
# Default OFF (test-first rollout); set "true" for the prod variant to include
# the endpoint-admin MFE: vite.config buildRemotes() manifest entry +
# __SHELL_ENDPOINT_ADMIN_REMOTE_ENABLED__ define (keeps the static EndpointAdminApp
# import) + the window.__env__ env-config payload (AppRouter runtime guard).
ARG VITE_SHELL_ENABLE_ENDPOINT_ADMIN_REMOTE=""

# ATS-0019 39c-3c — interview-evidence remote (endpoint-admin mirror). Default
# OFF; testai variant'ta origin-based auto-enable (build-single-domain.mjs
# STAGE tespiti), prod'a ileride opt-in bu ARG "true" ile.
ARG VITE_SHELL_ENABLE_INTERVIEW_EVIDENCE_REMOTE=""

# Faz 24 — mfe-meeting remote (endpoint-admin / interview-evidence mirror). Default
# OFF; testai variant'ta origin-based auto-enable (build-single-domain.mjs STAGE
# tespiti), prod'a ileride opt-in bu ARG "true" ile.
ARG VITE_SHELL_ENABLE_MEETING_REMOTE=""

ENV VITE_KEYCLOAK_URL=${VITE_KEYCLOAK_URL} \
    VITE_KEYCLOAK_REALM=${VITE_KEYCLOAK_REALM} \
    VITE_KEYCLOAK_CLIENT_ID=${VITE_KEYCLOAK_CLIENT_ID} \
    VITE_FRONTEND_PUBLIC_ORIGIN=${VITE_FRONTEND_PUBLIC_ORIGIN} \
    VITE_GATEWAY_URL=${VITE_GATEWAY_URL} \
    VITE_AUTH_MODE=${VITE_AUTH_MODE} \
    VITE_AG_GRID_LICENSE_KEY=${VITE_AG_GRID_LICENSE_KEY} \
    VITE_MFE_ON_DEMAND_BOOTSTRAP=${VITE_MFE_ON_DEMAND_BOOTSTRAP} \
    VITE_NOTIFY_VAPID_PUBLIC_KEY=${VITE_NOTIFY_VAPID_PUBLIC_KEY} \
    VITE_SHELL_ENABLE_ENDPOINT_ADMIN_REMOTE=${VITE_SHELL_ENABLE_ENDPOINT_ADMIN_REMOTE} \
    VITE_SHELL_ENABLE_INTERVIEW_EVIDENCE_REMOTE=${VITE_SHELL_ENABLE_INTERVIEW_EVIDENCE_REMOTE} \
    VITE_SHELL_ENABLE_MEETING_REMOTE=${VITE_SHELL_ENABLE_MEETING_REMOTE} \
    BUILD_SHA=${BUILD_SHA} \
    BUILD_REF=${BUILD_REF} \
    BUILD_IMAGE=${BUILD_IMAGE}

WORKDIR /app

# pnpm via corepack (npm-compatible, lock file deterministic)
RUN corepack enable && corepack prepare pnpm@10 --activate

# Workspace manifests first (cache layer)
# pnpm-workspace.yaml ile monorepo; install cache için kök manifest + lock
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* .npmrc* ./

# Tüm kaynak (scripts, apps, packages, design-tokens, tsconfig, configs)
# .dockerignore node_modules + dist + cache exclude eder
COPY . .

# Workspace install (frozen lockfile = reproducible, tüm workspace packages dahil)
RUN pnpm install --frozen-lockfile --prod=false

# Build (scripts/deploy/build-single-domain.mjs → dist/ubuntu-single-domain)
# Build-time VITE_* env vars webpack DefinePlugin inline eder bundle'a.
# CACHE-BUST: RUN line'ında BUILD_SHA referansı buildx cache key'ine girer.
# Her commit'te BUILD_SHA değişir → cache invalidate. Bu olmadan ARG/ENV
# değişimleri RUN cache'i invalidate etmiyordu (Secret update edilse bile
# eski bundle output cached). License key gibi build-time-injected env
# değişimleri için bu satır kritik.
RUN echo "build-rev=${BUILD_SHA}" && pnpm run build:ubuntu:single-domain

# Stage 2: Runtime (nginx serve)
FROM nginx:1.27-alpine

# Build artifact'leri kopyala (46 MB civarı)
COPY --from=builder /app/dist/ubuntu-single-domain /usr/share/nginx/html

# K8s default nginx config (basit; reverse-proxy host nginx'te yapılır)
# /index.html no-store + /assets immutable (entry vs hashed asset cache strategy)
RUN cat > /etc/nginx/conf.d/default.conf <<'EOF'
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Entry files MUST NOT cache (hashed asset references)
    location = / {
        try_files /index.html =404;
        add_header Cache-Control "no-store, must-revalidate" always;
    }
    location = /index.html {
        add_header Cache-Control "no-store, must-revalidate" always;
    }
    location = /remoteEntry.js {
        try_files $uri =404;
        add_header Cache-Control "no-store, must-revalidate" always;
    }
    location ~ ^/remotes/[^/]+/remoteEntry\.js$ {
        try_files $uri =404;
        add_header Cache-Control "no-store, must-revalidate" always;
    }

    # PERF-INIT-V2 PR-B3c (Codex thread `019e240d` AGREE) — hashed Vite
    # chunks under `/assets/` get long-cache.  Content-hash filenames
    # (e.g. `bootstrap-CDWbzp5o.js`) auto-invalidate on every new build,
    # so 1y immutable is safe.  Vite docs canonical pattern.
    #
    # Pre-B3c: `max-age=3600` (1h) — returning visitors re-validated
    # every hour.
    # Post-B3c: `max-age=31536000, immutable` (1y) — disk cache HIT for
    # all hashed JS/CSS chunks, 0 KB transfer on warm visits.
    #
    # Codex iter-3 P1.1 absorb: `always` keyword removed — without it,
    # the long-cache header applies only to successful 2xx/3xx
    # responses.  404 stale-bundle responses do NOT inherit 1y
    # immutable (would otherwise lock browsers on a missing asset).
    #
    # Entry surfaces (`/`, `/index.html`, `*remoteEntry.js`) above retain
    # `no-store, must-revalidate` so the SPA shell + federation manifest
    # stay live.
    location /assets/ {
        try_files $uri =404;
        access_log off;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # PERF-INIT-V2 PR-B3c iter-3 P1.2 absorb: hashed remote chunks under
    # `/remotes/<remote>/assets/` get the same 1y immutable treatment.
    # `build-single-domain.mjs` copies remote dist `/assets/*` to
    # `/remotes/<slug>/assets/*` (see scripts/deploy/build-single-domain.mjs
    # line ~173).  Without this regex block, those paths fall through
    # to the SPA catch-all (`location /`) and inherit no Cache-Control
    # header (browser defaults to short revalidation).
    location ~ ^/remotes/[^/]+/assets/ {
        try_files $uri =404;
        access_log off;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # SPA catch-all
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Health
    location = /healthz {
        access_log off;
        add_header Content-Type text/plain;
        return 200 'ok';
    }
}
EOF

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O- http://localhost/healthz | grep -q 'ok' || exit 1
