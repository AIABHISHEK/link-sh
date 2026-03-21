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



## Docker Quick Guide

### Compose files
- `infra/docker/docker-compose.dev.yml`: shared infra and observability services.
- `infra/docker/docker-compose.dev.dev2.yml`: development app containers for `link-redirect` and `aggregation`.
- `infra/docker/docker-compose.yml`: built-image stack for a more production-like run.

### What to run

Start only the redirect service and its required dependencies:
```bash
docker compose -f infra/docker/docker-compose.dev.yml -f infra/docker/docker-compose.dev.dev2.yml up -d --force-recreate link-redirect
```

Start both app services in development:
```bash
docker compose -f infra/docker/docker-compose.dev.yml -f infra/docker/docker-compose.dev.dev2.yml up -d --force-recreate link-redirect aggregation
```

Start the full development stack, including Prometheus, Loki, Tempo, and Grafana:
```bash
docker compose -f infra/docker/docker-compose.dev.yml -f infra/docker/docker-compose.dev.dev2.yml up -d --force-recreate
```

Start the built-image stack:
```bash
docker compose -f infra/docker/docker-compose.yml up -d --build
```

Stop the development stack:
```bash
docker compose -f infra/docker/docker-compose.dev.yml -f infra/docker/docker-compose.dev.dev2.yml down
```

Stop the built-image stack:
```bash
docker compose -f infra/docker/docker-compose.yml down
```

### Notes
- `link.clicks` is created automatically by the one-shot `kafka-init` container.
- `link-redirect` does not automatically start `prometheus`, `loki`, `tempo`, or `grafana` unless you include them explicitly or run the full stack command.
- In development, code is bind-mounted into the Bun containers, so source changes do not require rebuilding an image.
- Use `--build` when you changed a Dockerfile or files copied into an app image.

Verify the Kafka topic exists:
```bash
docker compose -f infra/docker/docker-compose.dev.yml -f infra/docker/docker-compose.dev.dev2.yml exec -T kafka bash -lc "/opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:29092 --list"
```

## Prometheus
`{job="otel-collector"}` query to get all available metric fields from `otel-collector`


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

## Kafka Producer Reliability Improvements
Implemented in `services/link-redirect/src/kafka/producer.ts`:

- Idempotent producer (`idempotent: true`) for safer retries.
- Durable delivery settings (`acks: -1` + producer retries).
- Internal buffered batching for click events.
- GZIP compression on batch send.
- No app-level requeue retry loop; if a buffered batch still fails after producer retries, it is dropped with logs.
- Graceful shutdown flush via `disconnectProducer()`.

Kafka tuning config in `services/link-redirect/src/config.ts`:

- `KAFKA_BATCH_SIZE` (default: `100`)
- `KAFKA_BATCH_MAX_WAIT_MS` (default: `25`)
- `KAFKA_MAX_BUFFERED_MESSAGES` (default: `10000`)
- `KAFKA_PRODUCER_RETRIES` (default: `8`)
- `KAFKA_PRODUCER_RETRY_INITIAL_MS` (default: `300`)
- `KAFKA_PRODUCER_RETRY_MAX_MS` (default: `30000`)
- `KAFKA_PRODUCER_ACK_TIMEOUT_MS` (default: `30000`)

## Metrics
Implemented in `services/link-redirect/src/metrics.ts`:

- `redirect_requests_total`
  - Type: counter
  - Purpose: total redirect requests by final outcome
  - Labels: `outcome=redirect|not_found|rate_limited|error`

- `create_requests_total`
  - Type: counter
  - Purpose: total create-link requests by final outcome
  - Labels: `outcome=created|invalid_url|error`

- `request_duration_ms`
  - Type: histogram
  - Purpose: request latency for both main routes
  - Labels: `route=redirect|create`, `method=GET|POST`, `outcome=<final outcome>`

### Prometheus Names
- OTEL counters usually appear in Prometheus with an extra `_total` suffix.
- That means `redirect_requests_total` may appear as `redirect_requests_total_total`.
- `create_requests_total` may appear as `create_requests_total_total`.
- Histograms usually appear as `_bucket`, `_sum`, and `_count` series such as:
  - `request_duration_ms_bucket`
  - `request_duration_ms_sum`
  - `request_duration_ms_count`

### Example PromQL
```promql
sum by (outcome) (redirect_requests_total_total)
```

```promql
sum by (outcome) (create_requests_total_total)
```

```promql
histogram_quantile(0.95, sum(rate(request_duration_ms_bucket[5m])) by (le, route))
```
