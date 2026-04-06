import { trace } from "@opentelemetry/api";
import type { CreateRequestOutcome } from "@link-sh/shared-types";
import { config } from "../../infrastructure/config";
import { logger } from "../../infrastructure/observability/logger";
import {
    recordCreateRequest,
    recordRequestDuration,
} from "../../infrastructure/observability/metrics";
import { redis } from "../../infrastructure/cache/redis";
import { toCreateLinkResponse } from "./mapper";
import { insertLink } from "./repository";
import { parseCreateLinkBody } from "./schemas";
import type { CreateLinkResponse } from "./types";

const tracer = trace.getTracer("dashboard-api");

export class InvalidCreateLinkPayloadError extends Error {
    constructor() {
        super("Invalid URL");
        this.name = "InvalidCreateLinkPayloadError";
    }
}

export async function createLink(body: unknown): Promise<CreateLinkResponse> {
    const span = tracer.startSpan("create-link-handler");
    const startedAt = performance.now();
    let outcome: CreateRequestOutcome | null = null;

    try {
        const payload = parseCreateLinkBody(body);
        if (!payload) {
            outcome = "invalid_url";
            logger.warn({ body }, "Invalid create link payload");
            throw new InvalidCreateLinkPayloadError();
        }

        logger.info({ longUrl: payload.longUrl }, "Link creation requested");
        const link = await insertLink(payload.longUrl);

        await redis.set(`link:${link.shortCode}`, link.longUrl, "EX", config.CACHE_TTL_SECONDS).catch((err) => {
            logger.warn({ err, shortCode: link.shortCode }, "Failed to warm Redis cache for new link");
        });

        outcome = "created";
        logger.info({ shortCode: link.shortCode }, "Link created successfully");
        return toCreateLinkResponse(link);
    } catch (err) {
        if (err instanceof InvalidCreateLinkPayloadError) {
            throw err;
        }

        outcome = "error";
        span.recordException(err as Error);
        logger.error({ err }, "Link creation failed");
        throw err;
    } finally {
        if (outcome) {
            span.setAttribute("create.outcome", outcome);
            recordCreateRequest(outcome);
            recordRequestDuration("create", "POST", outcome, performance.now() - startedAt);
        }
        span.end();
    }
}
