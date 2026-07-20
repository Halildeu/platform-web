FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* .npmrc* ./
COPY apps/etik-speak-manager ./apps/etik-speak-manager
COPY apps/mfe-ethic ./apps/mfe-ethic
RUN pnpm install --frozen-lockfile --prod=false
RUN pnpm --filter etik-speak-manager build

FROM nginxinc/nginx-unprivileged:1.27-alpine
ARG BUILD_SHA=""
LABEL org.opencontainers.image.revision="${BUILD_SHA}"
COPY --from=builder /app/apps/etik-speak-manager/dist /usr/share/nginx/html/ethic
COPY apps/etik-speak-manager/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/etik-speak-manager/security-headers.conf.inc /etc/nginx/security-headers.conf.inc
EXPOSE 8080
