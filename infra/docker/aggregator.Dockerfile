FROM oven/bun:1.3.6

WORKDIR /app

COPY package.json bun.lock ./
COPY services/public-redirect/package.json services/public-redirect/package.json
COPY services/dashboard-api/package.json services/dashboard-api/package.json
COPY services/aggregation-worker/package.json services/aggregation-worker/package.json
COPY packages/shared-config/package.json packages/shared-config/package.json
COPY packages/shared-observability/package.json packages/shared-observability/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

RUN bun install --frozen-lockfile

COPY . .

ENV NODE_ENV=production

CMD ["bun", "run", "services/aggregation-worker/src/index.ts"]
