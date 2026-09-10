FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* .npmrc* ./
COPY apps/etik-speak-public ./apps/etik-speak-public
RUN pnpm install --frozen-lockfile --prod=false
RUN pnpm --filter etik-speak-public build

# ES-306 (#2665): 1.27-alpine tabani calisan imajda 13 Critical + 56 High
# tasiyordu (openssl CVE-2025-15467, libxml2 CVE-2025-49794/49796 basta). Bu
# taban (nginx 1.30.4 / stable-alpine, 2026-08-02) ayni grype ile tarandi:
# Critical 0, High 2 — ikisi de libtiff'te ve fix'i YOK. libtiff bu imajda
# yalniz taban paketi olarak duruyor; statik dosya sunan nginx onu cagirmiyor,
# ve urunun goruntu ayristirmasi zaten baska bir yerde (kendi JVM'imizde) olur.
#
# Digest ile sabitlenmis: "stable-alpine" hareketli bir etiket, ve tabani
# etiketle birakmak yeniden uretilebilirligi kaybettirirdi — bugun taradigim
# sey ile yarin build edilen sey ayni olmayabilirdi. Yenileme: digest'i
# guncelle + ayni taramayi tekrar kosur.
# ES-306b (gitops#3624, 2026-09-10): vuln gate 2026-08-25'ten beri kirmiziydi —
# bu tabanin openssl 3.5.7-r0 / curl 8.21.0 / libexpat 2.8.2 paketleri 8 Critical +
# 36 High biriktirdi. Yeni stable-alpine index digest'i (nginx 1.30.4, Alpine 3.24.1,
# openssl 3.5.8-r0, curl 8.22.0-r0, libexpat 2.8.4-r0) ayni ACCEPTED listesiyle
# grype'la tarandi: 0 Critical / 0 High. Digest registry index manifest'i (multi-arch).
# Onceki: sha256:44e36330f74d4f3a1d4e222acca9e23b401fb87811a7597024502bb759c4dd49
FROM nginxinc/nginx-unprivileged@sha256:442753882674b49ae2c1de83ed67896131c0777f56df5005e356e62bc3f7e7ce
ARG BUILD_SHA=""
LABEL org.opencontainers.image.revision="${BUILD_SHA}"
COPY --from=builder /app/apps/etik-speak-public/dist /usr/share/nginx/html
COPY apps/etik-speak-public/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/etik-speak-public/security-headers.conf.inc /etc/nginx/security-headers.conf.inc
EXPOSE 8080
