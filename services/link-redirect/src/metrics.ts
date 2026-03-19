import { metrics } from "@opentelemetry/api";
import type { Counter } from "@opentelemetry/api";

export type RedirectRequestOutcome =
    | "redirect"
    | "not_found"
    | "rate_limited"
    | "error";

let redirectRequestsTotal: Counter | null = null;

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

export function recordRedirectRequest(outcome: RedirectRequestOutcome) {
    getRedirectRequestsCounter().add(1, { outcome });
}
