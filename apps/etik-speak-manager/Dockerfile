FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.12.4 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* .npmrc* ./
COPY apps/etik-speak-manager ./apps/etik-speak-manager
COPY apps/mfe-ethic/src ./apps/mfe-ethic/src
# The real design system and the generated theme. The cell used to build against a
# local stand-in with invented tokens, which is why nothing below was needed — and
# why the manager panel looked like a different product from the platform.
COPY packages/design-system ./packages/design-system
COPY packages/shared-types ./packages/shared-types
COPY packages/x-charts ./packages/x-charts
COPY apps/mfe-shell/src/styles ./apps/mfe-shell/src/styles
RUN pnpm install --frozen-lockfile --prod=false
# AG Grid Enterprise licence: GitHub secret AG_GRID_LICENSE_KEY -> build-arg -> index.html
# window.__env__ (inject-runtime-env plugin, allowlisted key only) -> design-system reader
# (same single-source lane as the platform frontend, platform-web#1155). The key is public
# by design (it ships in the client bundle). The empty default is for local and PR builds
# without the secret and yields the licence banner; the release workflow refuses to build
# with it empty.
ARG VITE_AG_GRID_LICENSE_KEY=""
ENV VITE_AG_GRID_LICENSE_KEY=$VITE_AG_GRID_LICENSE_KEY
RUN pnpm --filter etik-speak-manager build

# ES-306 (#2665): ayni bulgu bu imaj icin de gecerliydi — 1.27-alpine tabani
# 13 Critical + 56 High tasiyor. Yeni taban (nginx 1.30.4 / stable-alpine)
# grype ile tarandi: Critical 0, High 2 (ikisi libtiff, fix'i yok, statik
# dosya sunan nginx onu cagirmiyor). Etiket + digest yerine SADECE digest:
# ikisini birlikte yazmak, etiket hareket ettiginde ikisinin ayni seyi
# gosterdigi yanilsamasini birakiyordu.
# ES-306b (gitops#3624, 2026-09-10): vuln gate 2026-08-25'ten beri kirmiziydi —
# bu tabanin openssl 3.5.7-r0 / curl 8.21.0 / libexpat 2.8.2 paketleri 8 Critical +
# 36 High biriktirdi. Yeni stable-alpine index digest'i (nginx 1.30.4, Alpine 3.24.1,
# openssl 3.5.8-r0, curl 8.22.0-r0, libexpat 2.8.4-r0) ayni ACCEPTED listesiyle
# grype'la tarandi: 0 Critical / 0 High. Digest registry index manifest'i (multi-arch).
# Onceki: sha256:44e36330f74d4f3a1d4e222acca9e23b401fb87811a7597024502bb759c4dd49
FROM nginxinc/nginx-unprivileged@sha256:442753882674b49ae2c1de83ed67896131c0777f56df5005e356e62bc3f7e7ce
ARG BUILD_SHA=""
LABEL org.opencontainers.image.revision="${BUILD_SHA}"
COPY --from=builder /app/apps/etik-speak-manager/dist /usr/share/nginx/html/ethic
COPY apps/etik-speak-manager/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/etik-speak-manager/security-headers.conf.inc /etc/nginx/security-headers.conf.inc
EXPOSE 8080
