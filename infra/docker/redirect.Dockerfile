FROM oven/bun:1.3.6

WORKDIR /app

COPY package.json bun.lock ./
COPY services/link-redirect/package.json services/link-redirect/package.json
COPY services/aggregation/package.json services/aggregation/package.json

RUN bun install --frozen-lockfile

COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["sh", "-lc", "bun run migrate:up && bun run services/link-redirect/src/server.ts"]
