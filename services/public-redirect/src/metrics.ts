import { metrics } from "@opentelemetry/api";
import type { Counter, Histogram } from "@opentelemetry/api";
import type {
    RateLimitCheckResult,
    RedisLookupResult,
    RedirectRequestOutcome,
    RequestDurationRoute,
} from "@link-sh/shared-types";

let redirectRequestsTotal: Counter | null = null;
let requestDurationMs: Histogram | null = null;
let rateLimitChecksTotal: Counter | null = null;
let redisLookupsTotal: Counter | null = null;

function getRedirectRequestsCounter() {
    if (redirectRequestsTotal) {
        return redirectRequestsTotal;
    }

    const meter = metrics.getMeter("public-redirect");
    redirectRequestsTotal = meter.createCounter("redirect_requests_total", {
        description: "Total number of redirect requests by final outcome.",
    });

    return redirectRequestsTotal;
}

function getRequestDurationHistogram() {
    if (requestDurationMs) {
        return requestDurationMs;
    }

    const meter = metrics.getMeter("public-redirect");
    requestDurationMs = meter.createHistogram("request_duration_ms", {
        description: "Duration of HTTP requests in milliseconds.",
        unit: "ms",
    });

    return requestDurationMs;
}

function getRateLimitChecksCounter() {
    if (rateLimitChecksTotal) {
        return rateLimitChecksTotal;
    }

    const meter = metrics.getMeter("public-redirect");
    rateLimitChecksTotal = meter.createCounter("rate_limit_checks_total", {
        description: "Total number of rate limit checks by final decision.",
    });

    return rateLimitChecksTotal;
}

function getRedisLookupsCounter() {
    if (redisLookupsTotal) {
        return redisLookupsTotal;
    }

    const meter = metrics.getMeter("public-redirect");
    redisLookupsTotal = meter.createCounter("redis_lookups_total", {
        description: "Total number of redirect cache lookups by final cache result.",
    });

    return redisLookupsTotal;
}

export function recordRedirectRequest(outcome: RedirectRequestOutcome) {
    getRedirectRequestsCounter().add(1, { outcome });
}

export function recordRequestDuration(
    route: RequestDurationRoute,
    method: "GET" | "POST",
    outcome: RedirectRequestOutcome,
    durationMs: number
) {
    getRequestDurationHistogram().record(durationMs, {
        route,
        method,
        outcome,
    });
}

export function recordRateLimitCheck(result: RateLimitCheckResult) {
    getRateLimitChecksCounter().add(1, { result });
}

export function recordRedisLookup(result: RedisLookupResult) {
    getRedisLookupsCounter().add(1, { result });
}
