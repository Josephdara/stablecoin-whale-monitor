FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY src ./src
COPY scripts ./scripts

RUN mkdir -p /app/data && chown node:node /app/data

USER node
ENTRYPOINT ["node"]
CMD ["src/api/server.mjs"]
