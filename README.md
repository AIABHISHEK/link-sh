# link-sh

`link-sh` is a Bun + TypeScript URL shortener workspace organized around three backend services and shared internal packages.

## Project Summary

This repository now uses explicit service boundaries:

1. `public-redirect`
   Public, unauthenticated redirect service. It resolves short codes, rate limits requests, and emits click events.
2. `dashboard-api`
   Control-plane API for link management and analytics. It owns migrations and cache warming for new links.
3. `aggregation-worker`
   Internal Kafka consumer that aggregates click data into Postgres.
4. `auth-service`
   Called by the gateway to verify tokens and resolve the caller's identity. It
   never fronts traffic itself.

A Traefik `gateway` sits in front of these as the only publicly published
service; see [Gateway](#gateway).

Reusable code lives in `packages/`:

- `@link-sh/shared-types`
- `@link-sh/shared-config`
- `@link-sh/shared-observability`

External concerns such as gateway routing and identity are intentionally outside this repo.

## What Is Implemented

### Current product behavior

- `POST /v1/links` creates a short link owned by the authenticated user, through `dashboard-api`
- `GET /v1/links`, `GET /v1/links/{linkId}`, `PATCH /v1/links/{linkId}`, `DELETE /v1/links/{linkId}` manage a user's own links
- `GET /v1/links/{linkId}/analytics` (plus `/timeseries`, `/countries`, `/devices`) read the aggregated click data
- `GET /v1/me` returns the authenticated user context
- `GET /:shortCode` redirects through `public-redirect`, and no longer resolves soft-deleted links
- click events flow through Kafka into aggregate tables
- health checks exist for the HTTP services

### Current service boundaries

- `public-redirect` handles only redirect traffic and redirect-side telemetry
- `dashboard-api` exposes authenticated link management and analytics reads (`/v1/links`, `/v1/me`) and health checks
- `aggregation-worker` remains write-side only; it does not expose a public API

### Gateway

A Traefik container is the single public entry point. It publishes one host port
and routes by path:

```
client ──► gateway :8080 ──┬── /v1/*  ──► dashboard-api :3002   (authenticated)
                           └── /*     ──► public-redirect :3000 (public)
                                    │
                          ForwardAuth│
                                    ▼
                             auth-service :3003 ──► (Phase C: identity provider)
```

`/v1` has priority 100 and the catch-all has priority 1, so short codes cannot
shadow API routes. Only the gateway publishes a port — `dashboard-api`,
`auth-service`, and `public-redirect` are `expose`-only and unreachable from the
host.

The `/v1` router applies three middlewares, **in this order**, defined in
[`infra/docker/traefik/dynamic.yml`](infra/docker/traefik/dynamic.yml):

1. `strip-identity` — clears any client-supplied `X-User-Id` and
   `X-Gateway-Secret`. This must come first; without it a client could simply
   send its own `X-User-Id` and the rest would be decoration.
2. `gateway-auth` — a `forwardAuth` call to `auth-service`. A 2xx authorises the
   request, and only `X-User-Id` from that response is copied onto the upstream
   request, so the identity is always the auth service's.
3. `inject-gateway-secret` — adds the shared secret that proves to
   `dashboard-api` that the request came through the gateway.

Two Traefik details worth knowing before editing that file: it is rendered as a
Go template *before* being parsed as YAML (so `'{{ env "VAR" }}'` needs single
quotes), and setting a request header to `""` is how you remove it.

Traefik listens on `:80` inside the container. The host mapping is `8080:80` so
the stack runs without elevated privileges; change the left-hand side when
deploying somewhere that can bind `:80`, and update `BASE_URL` to match.

The gateway's API and dashboard are deliberately disabled — they expose routing
configuration and would need their own authentication.

### Auth contract

`dashboard-api` does not verify identity itself. It trusts an `x-user-id` header
set by an upstream gateway that has already authenticated the caller. Every route
under `/v1` (all of them except `/health`) requires this header and returns `401`
if it's missing or empty.

Because that header is an assertion the service cannot verify, it is only safe if
the caller really is the gateway. Three things enforce that:

1. **`dashboard-api` is not reachable from outside.** The production stack gives it
   no published host port — it is only addressable in-network as
   `http://dashboard-api:3002`. Publishing a host port there would let any local
   client impersonate any user, so don't add one; route through the gateway.
2. **Requests must carry a shared secret.** `GATEWAY_SHARED_SECRET` must match the
   value the gateway sends in `x-gateway-secret`, compared in constant time.
   Requests without it get `403`. This is defence in depth: if the network
   isolation above is ever misconfigured, the boundary still holds.
3. **The gateway strips client-supplied identity headers** before authenticating,
   so a caller cannot smuggle its own `x-user-id` through. See
   [Gateway](#gateway).

`403` means "you are not the gateway"; `401` means "the gateway did not say who
you are". Health checks are exempt from both.

The secret is **required when `NODE_ENV=production`** — the service logs a fatal
error and exits rather than starting with an open trust boundary, and the
production compose file refuses to even parse without it.

In development the secret is intentionally unset: the dev stacks run no gateway,
so provenance checks are skipped (with a loud startup warning) and the header can
be set by hand:

```bash
curl -H "x-user-id: <any-string>" http://localhost:3002/v1/links
```

### Tokens (development stub)

`auth-service` does not yet verify real tokens. Until Phase C wires it to an
identity provider, [`token-verifier.ts`](services/auth-service/src/token-verifier.ts)
accepts any `dev:<userId>` bearer token as proof of that identity:

```bash
curl -H "Authorization: Bearer dev:alice" http://localhost:8080/v1/links
```

This is not authentication — it exists so the gateway's middleware chain can be
wired and tested first. `assertVerifierUsable()` makes the service refuse to boot
with `NODE_ENV=production` while the stub is in use, which is why `auth-service`
runs as `development` even in the production compose file. Replacing the stub is
what unblocks flipping that, rather than something easy to forget.

### Not yet wired in this repo

- real token verification: `auth-service` still uses a development stub (see
  [Tokens](#tokens-development-stub)). Planned: self-hosted Keycloak, with
  `auth-service` verifying signatures against its JWKS.
- login / logout / refresh flows, and a `users` table mirroring identity-provider
  subjects
- TLS at the gateway (it currently serves plain HTTP)

The gateway and the trust boundary these plug into already exist — see
[Gateway](#gateway) and [Auth contract](#auth-contract).

## Repository Layout

```text
.
|-- services/
|   |-- public-redirect/
|   |-- dashboard-api/
|   |-- aggregation-worker/
|   `-- auth-service/
|-- packages/
|   |-- shared-config/
|   |-- shared-observability/
|   `-- shared-types/
|-- infra/docker/
|   `-- traefik/          # gateway static + dynamic config
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

- `GET /health`
- `GET /v1/me`
- `POST /v1/links`, `GET /v1/links`, `GET /v1/links/{linkId}`, `PATCH /v1/links/{linkId}`, `DELETE /v1/links/{linkId}`
- `GET /v1/links/{linkId}/analytics`, plus `/timeseries`, `/countries`, `/devices`
- validate, create, update, and soft-delete links, scoped to the authenticated user
- serve ownership-scoped reads of the aggregate click tables
- warm/refresh/evict the Redis cache on create, update, and delete
- own migration execution in local/dev and container startup flows

### `aggregation-worker`

- consume `link.clicks`
- aggregate by total, hour, country, and device
- write aggregate counters into Postgres

### `auth-service`

- `GET /health`
- `ALL /verify` — called by the gateway's `ForwardAuth`; returns `204` plus
  `x-user-id` on success, `401` otherwise
- currently backed by a development token stub; see [Tokens](#tokens-development-stub)

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

Start the auth service (only needed if you are exercising the gateway; running
services directly, you set `x-user-id` by hand instead):

```bash
$env:NODE_ENV="development"
$env:PORT="3003"
$env:OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
$env:LOG_LEVEL="info"
bun run dev:auth-service
```

These local runs have no gateway in front of them, so call `dashboard-api`
directly on `:3002` with an `x-user-id` header — see
[Auth contract](#auth-contract).

### Run full development stack with Docker

```bash
docker compose -f infra/docker/docker-compose.dev.yml -f infra/docker/docker-compose.dev.dev2.yml up -d --force-recreate
```

This stack runs no gateway; each service is published directly for convenience.

Useful endpoints:

- Public redirect: `http://localhost:3000`
- Dashboard API: `http://localhost:3002` (set `x-user-id` yourself)
- Auth service: `http://localhost:3003`
- Grafana: `http://localhost:3001`
- Prometheus: `http://localhost:9090`

### Run built containers

`GATEWAY_SHARED_SECRET` is required here; compose fails fast without it.

```bash
GATEWAY_SHARED_SECRET="$(openssl rand -hex 32)" \
  docker compose -f infra/docker/docker-compose.yml up -d --build
```

Everything is reached through the gateway on `http://localhost:8080`:

```bash
curl http://localhost:8080/health                                  # public-redirect
curl -H "Authorization: Bearer dev:alice" http://localhost:8080/v1/me
curl -H "Authorization: Bearer dev:alice" -X POST \
  -H "content-type: application/json" \
  -d '{"destinationUrl":"https://example.com"}' \
  http://localhost:8080/v1/links
```

`dashboard-api` and `auth-service` are deliberately not published in this stack,
so they are *not* reachable at `localhost:3002` / `localhost:3003`. Use the
gateway, or `docker compose exec` for debugging.

Note that `/health` through the gateway hits `public-redirect`, since the
catch-all owns everything outside `/v1`. The other services' health endpoints are
reachable in-network:

```bash
docker exec link_gateway wget -qO- http://dashboard-api:3002/health
docker exec link_gateway wget -qO- http://auth-service:3003/health
```

(Plain `docker exec`, not `docker compose exec` — the latter re-reads the compose
file and so would demand `GATEWAY_SHARED_SECRET` in your shell.)

## API Endpoints

### Dashboard API

All `/v1` routes require an `x-user-id` header (see [Auth contract](#auth-contract)).
Links are scoped to the requesting user — attempting to read or mutate another
user's link returns `404`, not `403`, to avoid leaking existence.

`GET /v1/me`

Response:

```json
{ "userId": "user-abc" }
```

`POST /v1/links`

Request:

```json
{
  "destinationUrl": "https://example.com/some/very/long/path",
  "expiresAt": null
}
```

Response (`201`):

```json
{
  "id": "441121",
  "shortCode": "8zmIKCw",
  "shortUrl": "http://localhost:3000/8zmIKCw",
  "destinationUrl": "https://example.com/some/very/long/path",
  "createdAt": "2026-08-10T13:26:27.406Z",
  "expiresAt": null,
  "status": "active"
}
```

`GET /v1/links`

Query params: `cursor`, `limit` (default 20, max 100), `status` (`active` | `expired` | `deleted`,
default excludes deleted), `q` (matches short code or destination URL), `sort` (`created_at:desc`
default, or `created_at:asc`).

Response:

```json
{ "items": [ /* DashboardLink */ ], "nextCursor": "441100" }
```

`GET /v1/links/{linkId}` — returns a single link, including soft-deleted ones (for audit).

`PATCH /v1/links/{linkId}` — body may include `destinationUrl` and/or `expiresAt` (send `null` to
clear the expiry). `status` is derived, not settable. Returns `409` if the link is already deleted.

`DELETE /v1/links/{linkId}` — soft delete (`204`). Idempotent: deleting an already-deleted link
still returns `204`. Once deleted, the short code stops redirecting immediately (cache is evicted
and `public-redirect`'s lookup excludes soft-deleted rows).

#### Analytics

All analytics routes are ownership-scoped the same way as link routes (`404` for a link you don't
own) and remain readable for soft-deleted links, so history stays auditable.

Shared query params: `from` and `to` (ISO timestamps; default is the last 7 days, max range 90
days) and `timezone` (IANA name, default `UTC`).

`GET /v1/links/{linkId}/analytics` — primary dashboard entrypoint. Returns everything in one call:

```json
{
  "summary": { "totalClicks": 27 },
  "timeseries": [ { "bucketStart": "2026-08-09", "clicks": 12 } ],
  "topCountries": [ { "country": "IN", "clicks": 15 } ],
  "topDevices": [ { "deviceType": "mobile", "clicks": 18 } ]
}
```

`summary.totalClicks` is the link's all-time running total (`links.click_count`) and is not
affected by `from`/`to`; the `timeseries` is what respects the range.

`GET /v1/links/{linkId}/analytics/timeseries` — adds `interval` (`hour` or `day`, default `day`).

```json
{ "interval": "day", "points": [ { "bucketStart": "2026-08-09", "clicks": 12 } ] }
```

`GET /v1/links/{linkId}/analytics/countries` and `GET /v1/links/{linkId}/analytics/devices` —
accept `limit` (default 10, max 50), sorted by clicks descending:

```json
{ "items": [ { "country": "IN", "clicks": 15 } ] }
```

**Timezone semantics.** The aggregation worker buckets clicks into UTC `date`/`hour`, so
`interval=hour` buckets are always UTC-aligned and `bucketStart` is a full ISO timestamp; the
`timezone` param is ignored for them. Only `interval=day` re-groups those UTC hours into local
calendar days, where `bucketStart` is a `YYYY-MM-DD` local date. A click at `2026-08-10T23:00Z`
therefore lands on `2026-08-10` in UTC but `2026-08-11` in `Asia/Kolkata`. Per-day totals shift
between buckets, but the range total is unchanged.

Sparse by design: buckets with no clicks are omitted rather than zero-filled, so a chart consuming
`points` should fill gaps itself.

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
- `GATEWAY_SHARED_SECRET` (empty by default; **required when `NODE_ENV=production`**,
  where the service refuses to start without it — see [Auth contract](#auth-contract))

### `aggregation-worker`

Required:

- `DATABASE_URL`
- `KAFKA_BROKERS`

Optional with defaults:

- `NODE_ENV=development`
- `TOPIC=link.clicks`
- `LOG_LEVEL=info`

### `auth-service`

Optional with defaults:

- `NODE_ENV=development` (**must not be `production`** while the token stub is in
  use; the service refuses to start)
- `PORT=3003`
- `LOG_LEVEL=info`

### `gateway`

- `GATEWAY_SHARED_SECRET` — required; injected as `x-gateway-secret` toward
  `dashboard-api` and must match that service's value

## Database Schema

Current tables used by the services:

- `links` — includes `user_id` (ownership) and `deleted_at` (soft delete); pre-existing rows
  from before ownership was added were backfilled with `user_id = 'legacy'`
- `link_click_hourly`
- `link_click_country`
- `link_click_device`

`status` (`active` / `expired` / `deleted`) is derived at read time from `deleted_at` and
`expires_at`, not stored as a column.

The analytics tables are still keyed by `short_code` rather than `link_id`. The analytics
endpoints resolve ownership by loading the link first (by `id` + `user_id`) and then querying
the aggregate tables by that link's `short_code`, so a caller can never read aggregates for a
link they don't own.

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

### Logs, metrics, and traces all ship over OTLP

Each service's `pino` logger writes to two destinations: stdout (for `docker logs` /
local terminal output) and an in-process OTLP log stream that emits through the
same `NodeSDK` used for traces and metrics. Every log record picks up the active
span's trace/span id at emit time, so logs, metrics, and traces all reach the
collector over `OTEL_EXPORTER_OTLP_ENDPOINT` and can be correlated in Grafana.

This means the OTel Collector no longer scrapes Docker's container log files and
no longer needs host log access or root privileges to run. It also means logs
show up in Loki when running a service locally with `bun run dev:*`, not just
when running under Docker.

## Operational Notes

- `dashboard-api` owns migration execution in container flows
- `dashboard-api` must never be published to the host in a deployed stack; it
  trusts `x-user-id` and is meant to sit behind the gateway only
- `public-redirect` is intentionally free of link creation routes
- `aggregation-worker` is internal-only and should not be exposed publicly
- `link.clicks` is created automatically by the Kafka init container
- the development stacks publish `postgres`, `redis`, and `kafka` to the host with
  default credentials for convenience; that is fine locally but is not a
  deployment posture
