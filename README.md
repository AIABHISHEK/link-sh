# link-sh

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

To migrate:

```bash
bun run migrate:up
```

### folder struture;
link-shortener/
│
├── services/
│   │
│   ├── redirect-service/
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── routes/
│   │   │   │   ├── create.ts
│   │   │   │   └── redirect.ts
│   │   │   ├── kafka/
│   │   │   │   └── producer.ts
│   │   │   ├── db.ts
│   │   │   ├── redis.ts
│   │   │   ├── config.ts
│   │   │   └── logger.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── aggregator-service/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── kafka/
│   │   │   │   └── consumer.ts
│   │   │   ├── aggregator.ts
│   │   │   ├── db.ts
│   │   │   ├── config.ts
│   │   │   └── logger.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── shared/
│       ├── types/
│       │   └── click-event.ts
│       ├── constants.ts
│       └── utils/
│           └── validate-url.ts
│
├── infrastructure/
│   ├── docker/
│   │   ├── redirect.Dockerfile
│   │   ├── aggregator.Dockerfile
│   │   └── docker-compose.dev.yml
│   │
│   ├── kafka/
│   │   └── create-topics.sh
│   │
│   └── migrations/
│       └── (node-pg-migrate files)
│
├── .env
├── package.json (workspace root)
└── README.md



#### Kafka Topic Bootstrap

Topic `link.clicks` is created automatically by the one-shot `kafka-init` service in Compose.

Run:
```
docker compose -f infra/docker/docker-compose.dev.yml -f infra/docker/docker-compose.dev.dev2.yml up -d --force-recreate link-redirect
```

Verify topic exists:
```
docker compose -f infra/docker/docker-compose.dev.yml -f infra/docker/docker-compose.dev.dev2.yml exec -T kafka bash -lc "/opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:29092 --list"
```


## Prometheus 
{job="otel-collector"}  query to get all available metrics-fields from otel-collector

## To run
```
docker compose -f infra/docker/docker-compose.dev.yml -f infra/docker/docker-compose.dev.dev2.yml up -d --force-recreate link-redirect
```


## Key Improvements in Redirect Service

### 1) Negative Caching for Missing Short Codes
- Problem: repeated invalid short-code requests were hitting Postgres every time.
- Solution: cache a sentinel value (`__NOT_FOUND__`) in Redis for missing links.
- Result: repeated misses return `404` directly from Redis during negative-cache TTL.

### 2) Hot-Key Stampede Protection
- Problem: when a hot key expires, many concurrent requests can hit Postgres together.
- Solution: per-key Redis lock (`link:{shortCode}:lock`) with `SET NX EX`.
- Follower behavior: non-lock holders wait briefly and retry Redis before falling back.
- Safety: lock release uses token check + Lua script to avoid deleting another request's lock.

### 3) Redirect Route Hardening
- Added `try/catch/finally` in redirect flow.
- Errors are logged with `shortCode` context and return `500` safely.
- OpenTelemetry span is always ended in `finally`.

### 4) Cache Priming on Link Creation
- After `POST /links`, the new mapping is written to Redis immediately.
- This avoids stale negative-cache windows for newly created short codes.

### 5) IP Rate Limiting on Redirect
- Redirect endpoint enforces IP-based rate limiting via Redis counter + TTL window.
- Requests over the threshold return `429 Too Many Requests`.

## Redirect Cache/Lock Config
 In `services/link-redirect/src/config.ts`:

- `CACHE_TTL_SECONDS` (default: `3600`)
- `NEGATIVE_CACHE_TTL_SECONDS` (default: `30`)
- `CACHE_LOCK_TTL_SECONDS` (default: `5`)
- `CACHE_WAIT_MS` (default: `50`)
- `CACHE_WAIT_RETRIES` (default: `20`)
