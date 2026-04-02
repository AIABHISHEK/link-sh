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

export type RateLimitCheckResult =
    | "allowed"
    | "blocked";

export type RedisLookupResult =
    | "hit"
    | "miss"
    | "negative_hit";
