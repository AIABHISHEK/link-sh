# link-sh

`link-sh` is a Bun + TypeScript URL shortener system with a separate click-aggregation pipeline.

It currently includes:

- Short link creation
- Redirect handling
- Redis caching and negative caching
- Redirect rate limiting
- Kafka-based click event ingestion
- Background analytics aggregation into Postgres
- OpenTelemetry metrics, traces, and log shipping
- Docker-based local development and full-stack runs

## Index

- [Project Summary](#project-summary)
- [What Is Implemented](#what-is-implemented)
- [Architecture](#architecture)
- [Repository Layout](#repository-layout)
- [How To Run](#how-to-run)
- [API Endpoints](#api-endpoints)
- [Configuration](#configuration)
- [Database Schema](#database-schema)
- [Observability](#observability)
- [Operational Notes](#operational-notes)
- [How To Extend This README](#how-to-extend-this-readme)

## Project Summary

This repository is split into two application services:

1. `link-redirect`
   Handles link creation, short-code resolution, caching, rate limiting, health checks, and Kafka event publishing.
2. `aggregation`
   Consumes click events from Kafka and writes aggregated analytics into Postgres.

Supporting infrastructure is provided through Docker Compose:

- Postgres
- Redis
- Kafka
- OpenTelemetry Collector
- Prometheus
- Loki
- Tempo
- Grafana

## What Is Implemented

### Core product behavior

- `POST /links` creates a new short link from a valid `longUrl`
- `GET /:shortCode` resolves and redirects to the original URL
- `GET /health` checks Postgres and Redis connectivity

### Redirect service behavior

- Short codes are generated with `nanoid` using a 7-character alphabet
- Link creation retries on unique short-code collisions
- Newly created links are written into Redis immediately to warm the cache
- Redirects use Redis as the first lookup layer
- Missing short codes are stored in Redis with a negative-cache sentinel to reduce repeated DB misses
- Cache stampede protection is implemented with a per-key Redis lock
- Redirect requests are rate limited by client IP
- Click events are pushed to Kafka for asynchronous analytics processing
- Redirect and create request metrics are recorded with OpenTelemetry

### Analytics pipeline behavior

- Kafka topic: `link.clicks`
- Click events are consumed in batches
- Aggregation writes are stored in Postgres for:
  - total clicks per link
  - hourly clicks per link
  - clicks by country
  - clicks by device type
- Country is derived with `geoip-lite`
- Device type is derived from the user agent with `ua-parser-js`

### Observability

- OpenTelemetry traces exported to Tempo through the collector
- OpenTelemetry metrics exported to Prometheus through the collector
- Container logs shipped to Loki through the collector
- Grafana is included in the Docker stack for visualization

### Already present in schema but not wired into behavior

- `links.expires_at` exists in the database schema
- Expiry enforcement is not currently applied in the redirect flow
- There is no public analytics read API yet; analytics are written to database tables only

## Architecture

### Create link flow

1. Client sends `POST /links`
2. Service validates `longUrl`
3. Service generates a short code and inserts into Postgres
4. Service warms Redis with `link:{shortCode} -> longUrl`
5. Service returns the final short URL

### Redirect flow

1. Client requests `GET /:shortCode`
2. Service applies IP-based rate limiting
3. Service checks Redis
4. If cache miss happens, the service uses a Redis lock to avoid stampede on the same key
5. Service reads Postgres when needed
6. Service stores either the real URL or a negative-cache sentinel in Redis
7. Service publishes a click event to Kafka
8. Service responds with HTTP redirect

### Analytics flow

1. Redirect service publishes click events to Kafka
2. Aggregation service consumes Kafka batches
3. Events are grouped in memory by total, hour, country, and device
4. Aggregated counters are flushed to Postgres in a transaction

## Repository Layout

```text
.
|-- services/
|   |-- link-redirect/        # Fastify redirect + creation service
|   |-- aggregation/          # Kafka consumer and analytics writer
|   `-- shared/               # Shared types
|-- infra/docker/             # Dockerfiles, compose files, OTEL/Prometheus config
|-- migrations/               # Postgres schema migrations
|-- package.json              # Workspace scripts
`-- README.md
```

## How To Run

### Prerequisites

- Bun
- Docker and Docker Compose

### Workspace install

```bash
bun install
```

### Option 1: Run the full development stack with Docker

This starts infra plus both application services in watch mode.

```bash
docker compose -f infra/docker/docker-compose.dev.yml -f infra/docker/docker-compose.dev.dev2.yml up -d --force-recreate
```

Useful endpoints after startup:

- Redirect service: `http://localhost:3000`
- Grafana: `http://localhost:3001`
- Prometheus: `http://localhost:9090`
- Loki: `http://localhost:3100`
- Tempo: `http://localhost:3200`

To stop it:

```bash
docker compose -f infra/docker/docker-compose.dev.yml -f infra/docker/docker-compose.dev.dev2.yml down
```

### Option 2: Run infra in Docker and apps locally with Bun

Start shared dependencies:

```bash
docker compose -f infra/docker/docker-compose.dev.yml up -d
```

Run migrations:

```bash
bun run migrate:up
```

Set environment variables for the redirect service:

```bash
$env:NODE_ENV="development"
$env:PORT="3000"
$env:BASE_URL="http://localhost:3000"
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/links"
$env:REDIS_URL="redis://localhost:6379"
$env:KAFKA_BROKERS="localhost:9092"
$env:OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
$env:LOG_LEVEL="info"
```

Start the redirect service:

```bash
bun run dev:redirect
```

In another terminal, set environment variables for the aggregation service:

```bash
$env:NODE_ENV="development"
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/links"
$env:KAFKA_BROKERS="localhost:9092"
$env:OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
$env:LOG_LEVEL="info"
$env:TOPIC="link.clicks"
```

Start the aggregation service:

```bash
bun run dev:aggregator
```

To stop infra:

```bash
docker compose -f infra/docker/docker-compose.dev.yml down
```

### Option 3: Run the built-image stack

```bash
docker compose -f infra/docker/docker-compose.yml up -d --build
```

To stop it:

```bash
docker compose -f infra/docker/docker-compose.yml down
```

### Migrations

Create a new migration:

```bash
bun run migrate:create <migration_name>
```

Apply migrations:

```bash
bun run migrate:up
```

Rollback the latest migration:

```bash
bun run migrate:down
```

## API Endpoints

### Create short link

`POST /links`

Request:

```json
{
  "longUrl": "https://example.com/some/very/long/path"
}
```

Success response:

```json
{
  "shortUrl": "http://localhost:3000/abc123X"
}
```

Possible responses:

- `201 Created`
- `400 Bad Request` for invalid URLs
- `500 Internal Server Error`

Example:

```bash
curl -X POST http://localhost:3000/links -H "Content-Type: application/json" -d "{\"longUrl\":\"https://example.com\"}"
```

### Redirect

`GET /:shortCode`

Possible responses:

- `302` or framework redirect response to the original URL
- `404 Not Found` when the short code does not exist
- `429 Too Many Requests` when the IP rate limit is exceeded
- `500 Internal Server Error`

Example:

```bash
curl -i http://localhost:3000/abc123X
```

### Health check

`GET /health`

Checks:

- Postgres connectivity
- Redis connectivity

Example:

```bash
curl http://localhost:3000/health
```

### OpenTelemetry test route

`GET /otel-test`

This route exists for manual trace validation.

## Configuration

### Redirect service environment variables

Required:

- `DATABASE_URL`
- `REDIS_URL`
- `BASE_URL`
- `KAFKA_BROKERS`

Optional with defaults:

- `NODE_ENV=development`
- `PORT=3000`
- `CACHE_TTL_SECONDS=3600`
- `NEGATIVE_CACHE_TTL_SECONDS=30`
- `CACHE_LOCK_TTL_SECONDS=5`
- `CACHE_WAIT_MS=50`
- `CACHE_WAIT_RETRIES=20`
- `KAFKA_BATCH_SIZE=100`
- `KAFKA_BATCH_MAX_WAIT_MS=25`
- `KAFKA_MAX_BUFFERED_MESSAGES=10000`
- `KAFKA_PRODUCER_RETRIES=8`
- `KAFKA_PRODUCER_RETRY_INITIAL_MS=300`
- `KAFKA_PRODUCER_RETRY_MAX_MS=30000`
- `KAFKA_PRODUCER_ACK_TIMEOUT_MS=30000`
- `LOG_LEVEL=info`
- `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`

### Aggregation service environment variables

Required:

- `DATABASE_URL`
- `KAFKA_BROKERS`

Optional with defaults:

- `NODE_ENV=development`
- `TOPIC=link.clicks`
- `LOG_LEVEL=info`
- `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`

## Database Schema

### `links`

Stores the source mapping for each short code.

Columns currently added by migrations:

- `id`
- `short_code`
- `long_url`
- `created_at`
- `expires_at`
- `click_count`

### `link_click_hourly`

Aggregated hourly click counts per short code.

Key:

- `(short_code, date, hour)`

### `link_click_country`

Aggregated click counts per country.

Key:

- `(short_code, country)`

### `link_click_device`

Aggregated click counts by device type.

Key:

- `(short_code, device_type)`

## Observability

### Included components

- OpenTelemetry Collector
- Prometheus
- Loki
- Tempo
- Grafana

### Application metrics

Implemented in the redirect service:

- `redirect_requests_total`
  Final outcomes: `redirect`, `not_found`, `rate_limited`, `error`
- `create_requests_total`
  Final outcomes: `created`, `invalid_url`, `error`
- `rate_limit_checks_total`
  Final results: `allowed`, `blocked`
- `redis_lookups_total`
  Final results: `hit`, `miss`, `negative_hit`
- `request_duration_ms`
  Labels include route, method, and outcome

### Prometheus naming note

OTEL counters commonly appear in Prometheus with an additional `_total` suffix.

Examples:

- `redirect_requests_total_total`
- `create_requests_total_total`
- `rate_limit_checks_total_total`
- `redis_lookups_total_total`
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
sum by (result) (rate_limit_checks_total_total)
```

```promql
sum by (result) (redis_lookups_total_total)
```

```promql
histogram_quantile(0.95, sum(rate(request_duration_ms_bucket[5m])) by (le, route))
```

## Operational Notes

- `link.clicks` is created automatically by the `kafka-init` container
- In Docker development mode, `workspace-install` installs workspace dependencies once before app containers start
- In Docker development mode, source code is bind-mounted, so code changes do not require image rebuilds
- Use `--build` when Dockerfiles or copied image content changes

Verify that the Kafka topic exists:

```bash
docker compose -f infra/docker/docker-compose.dev.yml -f infra/docker/docker-compose.dev.dev2.yml exec -T kafka bash -lc "/opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:29092 --list"
```

## How To Extend This README

When new work is added:

- Add new product capabilities under `What Is Implemented`
- Add new request flows under `Architecture`
- Add new commands under `How To Run`
- Add new endpoints under `API Endpoints`
- Add new env vars under `Configuration`
- Add new tables under `Database Schema`
- Add new telemetry or dashboards under `Observability`
