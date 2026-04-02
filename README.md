# link-sh

`link-sh` is a Bun + TypeScript URL shortener workspace organized around three backend services and shared internal packages.

## Project Summary

This repository now uses explicit service boundaries:

1. `public-redirect`
   Public, unauthenticated redirect service. It resolves short codes, rate limits requests, and emits click events.
2. `dashboard-api`
   Control-plane API for link creation and future authenticated dashboard features. It owns migrations and cache warming for new links.
3. `aggregation-worker`
   Internal Kafka consumer that aggregates click data into Postgres.

Reusable code lives in `packages/`:

- `@link-sh/shared-types`
- `@link-sh/shared-config`
- `@link-sh/shared-observability`

External concerns such as gateway routing and identity are intentionally outside this repo.

## What Is Implemented

### Current product behavior

- `POST /links` creates a short link through `dashboard-api`
- `GET /:shortCode` redirects through `public-redirect`
- click events flow through Kafka into aggregate tables
- health checks exist for the HTTP services

### Current service boundaries

- `public-redirect` handles only redirect traffic and redirect-side telemetry
- `dashboard-api` currently exposes link creation and health checks
- `aggregation-worker` remains write-side only; it does not expose a public API

### Not yet wired in this repo

- gateway-authenticated dashboard routes
- ownership and authorization checks
- analytics read endpoints in `dashboard-api`
- external identity integration

## Repository Layout

```text
.
|-- services/
|   |-- public-redirect/
|   |-- dashboard-api/
|   `-- aggregation-worker/
|-- packages/
|   |-- shared-config/
|   |-- shared-observability/
|   `-- shared-types/
|-- infra/docker/
|-- migrations/
|-- package.json
`-- README.md
```

## Service Responsibilities

### `public-redirect`

- `GET /:shortCode`
- `GET /health`
- read Redis first, then Postgres on cache miss
- apply IP-based rate limiting
- publish click events to Kafka

### `dashboard-api`

- `POST /links`
- `GET /health`
- validate and create links
- warm Redis on successful create
- own migration execution in local/dev and container startup flows

### `aggregation-worker`

- consume `link.clicks`
- aggregate by total, hour, country, and device
- write aggregate counters into Postgres

## How To Run

### Prerequisites

- Bun
- Docker and Docker Compose

### Install workspace dependencies

```bash
bun install
```

### Run infra only

```bash
docker compose -f infra/docker/docker-compose.dev.yml up -d
```

### Run services locally

Run migrations first:

```bash
bun run migrate:up
```

Start the public redirect service:

```bash
$env:NODE_ENV="development"
$env:PORT="3000"
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/links"
$env:REDIS_URL="redis://localhost:6379"
$env:KAFKA_BROKERS="localhost:9092"
$env:OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
$env:LOG_LEVEL="info"
bun run dev:public-redirect
```

Start the dashboard API:

```bash
$env:NODE_ENV="development"
$env:PORT="3002"
$env:BASE_URL="http://localhost:3000"
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/links"
$env:REDIS_URL="redis://localhost:6379"
$env:OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
$env:LOG_LEVEL="info"
bun run dev:dashboard-api
```

Start the aggregation worker:

```bash
$env:NODE_ENV="development"
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/links"
$env:KAFKA_BROKERS="localhost:9092"
$env:OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
$env:LOG_LEVEL="info"
$env:TOPIC="link.clicks"
bun run dev:aggregation-worker
```

### Run full development stack with Docker

```bash
docker compose -f infra/docker/docker-compose.dev.yml -f infra/docker/docker-compose.dev.dev2.yml up -d --force-recreate
```

Useful endpoints:

- Public redirect: `http://localhost:3000`
- Dashboard API: `http://localhost:3002`
- Grafana: `http://localhost:3001`
- Prometheus: `http://localhost:9090`

### Run built containers

```bash
docker compose -f infra/docker/docker-compose.yml up -d --build
```

## API Endpoints

### Dashboard API

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

### Public Redirect

`GET /:shortCode`

Responses:

- `302` redirect
- `404 Not Found`
- `429 Too Many Requests`
- `500 Internal Server Error`

### Health

`GET /health`

Implemented on both HTTP services.

## Configuration

### `public-redirect`

Required:

- `DATABASE_URL`
- `REDIS_URL`
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

### `dashboard-api`

Required:

- `DATABASE_URL`
- `REDIS_URL`
- `BASE_URL`

Optional with defaults:

- `NODE_ENV=development`
- `PORT=3002`
- `CACHE_TTL_SECONDS=3600`
- `LOG_LEVEL=info`

### `aggregation-worker`

Required:

- `DATABASE_URL`
- `KAFKA_BROKERS`

Optional with defaults:

- `NODE_ENV=development`
- `TOPIC=link.clicks`
- `LOG_LEVEL=info`

## Database Schema

Current tables used by the services:

- `links`
- `link_click_hourly`
- `link_click_country`
- `link_click_device`

The analytics worker updates aggregate tables asynchronously, so analytics data remains eventually consistent by design.

## Observability

The workspace includes:

- OpenTelemetry Collector
- Prometheus
- Loki
- Tempo
- Grafana

Current service names exported through OTEL/logging:

- `public-redirect`
- `dashboard-api`
- `aggregation-worker`

## Operational Notes

- `dashboard-api` owns migration execution in container flows
- `public-redirect` is intentionally free of link creation routes
- `aggregation-worker` is internal-only and should not be exposed publicly
- `link.clicks` is created automatically by the Kafka init container
