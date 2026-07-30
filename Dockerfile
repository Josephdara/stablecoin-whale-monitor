FROM node:20-bookworm-slim
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
