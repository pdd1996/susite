FROM node:22.17.1-bookworm-slim

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

COPY apps/api apps/api
COPY packages/site-config packages/site-config
COPY templates/b2b-manufacturing-v1 templates/b2b-manufacturing-v1
COPY tsconfig.base.json ./

RUN pnpm --filter @zhansite/api typecheck

EXPOSE 8787

CMD ["pnpm", "--filter", "@zhansite/api", "exec", "tsx", "src/server.ts"]
