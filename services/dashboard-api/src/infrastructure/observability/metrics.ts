import { metrics } from "@opentelemetry/api";
import type { Counter, Histogram } from "@opentelemetry/api";
import type {
    CreateRequestOutcome,
    RequestDurationRoute,
} from "@link-sh/shared-types";

let createRequestsTotal: Counter | null = null;
let requestDurationMs: Histogram | null = null;

function getCreateRequestsCounter() {
    if (createRequestsTotal) {
        return createRequestsTotal;
    }

    const meter = metrics.getMeter("dashboard-api");
    createRequestsTotal = meter.createCounter("create_requests_total", {
        description: "Total number of create link requests by final outcome.",
    });

    return createRequestsTotal;
}

function getRequestDurationHistogram() {
    if (requestDurationMs) {
        return requestDurationMs;
    }

    const meter = metrics.getMeter("dashboard-api");
    requestDurationMs = meter.createHistogram("request_duration_ms", {
        description: "Duration of HTTP requests in milliseconds.",
        unit: "ms",
    });

    return requestDurationMs;
}

export function recordCreateRequest(outcome: CreateRequestOutcome) {
    getCreateRequestsCounter().add(1, { outcome });
}

export function recordRequestDuration(
    route: RequestDurationRoute,
    method: "GET" | "POST",
    outcome: CreateRequestOutcome,
    durationMs: number
) {
    getRequestDurationHistogram().record(durationMs, {
        route,
        method,
        outcome,
    });
}
