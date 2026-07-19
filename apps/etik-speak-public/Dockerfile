FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* .npmrc* ./
COPY apps/etik-speak-public ./apps/etik-speak-public
RUN pnpm install --frozen-lockfile --prod=false
RUN pnpm --filter etik-speak-public build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY --from=builder /app/apps/etik-speak-public/dist /usr/share/nginx/html
COPY apps/etik-speak-public/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/etik-speak-public/security-headers.conf.inc /etc/nginx/security-headers.conf.inc
EXPOSE 8080
