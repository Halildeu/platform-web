FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.12.4 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* .npmrc* ./
COPY apps/etik-speak-manager ./apps/etik-speak-manager
COPY apps/mfe-ethic/src ./apps/mfe-ethic/src
RUN pnpm install --frozen-lockfile --prod=false
RUN pnpm --filter etik-speak-manager build

FROM nginxinc/nginx-unprivileged:1.27-alpine@sha256:65e3e85dbaed8ba248841d9d58a899b6197106c23cb0ff1a132b7bfe0547e4c0
ARG BUILD_SHA=""
LABEL org.opencontainers.image.revision="${BUILD_SHA}"
COPY --from=builder /app/apps/etik-speak-manager/dist /usr/share/nginx/html/ethic
COPY apps/etik-speak-manager/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/etik-speak-manager/security-headers.conf.inc /etc/nginx/security-headers.conf.inc
EXPOSE 8080
