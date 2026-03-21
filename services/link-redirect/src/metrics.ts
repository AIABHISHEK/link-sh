import { metrics } from "@opentelemetry/api";
import type { Counter, Histogram } from "@opentelemetry/api";

export type RedirectRequestOutcome =
    | "redirect"
    | "not_found"
    | "rate_limited"
    | "error";
export type CreateRequestOutcome =
    | "created"
    | "invalid_url"
    | "error";
export type RequestDurationRoute =
    | "redirect"
    | "create";

let redirectRequestsTotal: Counter | null = null;
let createRequestsTotal: Counter | null = null;
let requestDurationMs: Histogram | null = null;

function getRedirectRequestsCounter() {
    if (redirectRequestsTotal) {
        return redirectRequestsTotal;
    }

    const meter = metrics.getMeter("redirect-service");
    redirectRequestsTotal = meter.createCounter("redirect_requests_total", {
        description: "Total number of redirect requests by final outcome.",
    });

    return redirectRequestsTotal;
}

function getCreateRequestsCounter() {
    if (createRequestsTotal) {
        return createRequestsTotal;
    }

    const meter = metrics.getMeter("redirect-service");
    createRequestsTotal = meter.createCounter("create_requests_total", {
        description: "Total number of create link requests by final outcome.",
    });

    return createRequestsTotal;
}

function getRequestDurationHistogram() {
    if (requestDurationMs) {
        return requestDurationMs;
    }

    const meter = metrics.getMeter("redirect-service");
    requestDurationMs = meter.createHistogram("request_duration_ms", {
        description: "Duration of HTTP requests in milliseconds.",
        unit: "ms",
    });

    return requestDurationMs;
}

export function recordRedirectRequest(outcome: RedirectRequestOutcome) {
    getRedirectRequestsCounter().add(1, { outcome });
}

export function recordCreateRequest(outcome: CreateRequestOutcome) {
    getCreateRequestsCounter().add(1, { outcome });
}

export function recordRequestDuration(
    route: RequestDurationRoute,
    method: "GET" | "POST",
    outcome: RedirectRequestOutcome | CreateRequestOutcome,
    durationMs: number
) {
    getRequestDurationHistogram().record(durationMs, {
        route,
        method,
        outcome,
    });
}
