FROM node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
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
