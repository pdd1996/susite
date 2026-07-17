FROM node:22.17.1-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY packages/site-config/package.json packages/site-config/package.json
COPY templates/b2b-manufacturing-v1/package.json templates/b2b-manufacturing-v1/package.json

RUN pnpm install --frozen-lockfile

COPY apps/admin apps/admin
COPY packages/site-config packages/site-config
COPY tsconfig.base.json ./

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ARG VITE_UPLOADS_ENABLED=true
ENV VITE_UPLOADS_ENABLED=$VITE_UPLOADS_ENABLED

RUN pnpm --filter @zhansite/admin build

FROM nginx:1.28-alpine

COPY deploy/nginx.ip-baseline.conf /etc/nginx/conf.d/default.conf
COPY deploy/nginx-auth-entrypoint.sh /docker-entrypoint.d/10-zhansite-auth.sh
COPY --from=build /app/apps/admin/dist /usr/share/nginx/html

RUN chmod 755 /docker-entrypoint.d/10-zhansite-auth.sh

EXPOSE 80
