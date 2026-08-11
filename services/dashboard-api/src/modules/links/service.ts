import { trace } from "@opentelemetry/api";
import type { CreateRequestOutcome, DashboardLink, ListLinksResponse } from "@link-sh/shared-types";
import { config } from "../../infrastructure/config";
import { logger } from "../../infrastructure/observability/logger";
import {
    recordCreateRequest,
    recordRequestDuration,
} from "../../infrastructure/observability/metrics";
import { redis } from "../../infrastructure/cache/redis";
import { toLinkResponse } from "./mapper";
import {
    insertLink,
    selectLinkByIdAndUser,
    selectLinksByUser,
    softDeleteLinkByIdAndUser,
    updateLinkByIdAndUser,
} from "./repository";
import { parseCreateLinkBody, parseLinkId, parseListLinksQuery, parseUpdateLinkBody } from "./schemas";

const tracer = trace.getTracer("dashboard-api");

export class InvalidCreateLinkPayloadError extends Error {
    constructor() {
        super("Invalid destinationUrl or expiresAt");
        this.name = "InvalidCreateLinkPayloadError";
    }
}

export class InvalidUpdateLinkPayloadError extends Error {
    constructor() {
        super("Invalid update payload");
        this.name = "InvalidUpdateLinkPayloadError";
    }
}

export class InvalidLinkIdError extends Error {
    constructor() {
        super("Invalid linkId");
        this.name = "InvalidLinkIdError";
    }
}

export class LinkNotFoundError extends Error {
    constructor() {
        super("Link not found");
        this.name = "LinkNotFoundError";
    }
}

export class LinkDeletedConflictError extends Error {
    constructor() {
        super("Link has been deleted");
        this.name = "LinkDeletedConflictError";
    }
}

function cacheKeyFor(shortCode: string) {
    return `link:${shortCode}`;
}

function requireValidLinkId(linkIdParam: unknown): string {
    const linkId = parseLinkId(linkIdParam);
    if (!linkId) {
        throw new InvalidLinkIdError();
    }
    return linkId;
}

export async function createLink(userId: string, body: unknown): Promise<DashboardLink> {
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

        logger.info({ destinationUrl: payload.destinationUrl }, "Link creation requested");
        const link = await insertLink(userId, payload.destinationUrl, payload.expiresAt);

        await redis
            .set(cacheKeyFor(link.shortCode), link.longUrl, "EX", config.CACHE_TTL_SECONDS)
            .catch((err) => {
                logger.warn({ err, shortCode: link.shortCode }, "Failed to warm Redis cache for new link");
            });

        outcome = "created";
        logger.info({ shortCode: link.shortCode }, "Link created successfully");
        return toLinkResponse(link);
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

export async function listLinks(userId: string, query: unknown): Promise<ListLinksResponse> {
    const filter = parseListLinksQuery(query);
    const { rows, nextCursor } = await selectLinksByUser(userId, filter);

    return {
        items: rows.map(toLinkResponse),
        nextCursor,
    };
}

export async function getLink(userId: string, linkIdParam: unknown): Promise<DashboardLink> {
    const linkId = requireValidLinkId(linkIdParam);
    const row = await selectLinkByIdAndUser(userId, linkId);

    if (!row) {
        throw new LinkNotFoundError();
    }

    return toLinkResponse(row);
}

export async function updateLink(
    userId: string,
    linkIdParam: unknown,
    body: unknown
): Promise<DashboardLink> {
    const linkId = requireValidLinkId(linkIdParam);
    const patch = parseUpdateLinkBody(body);
    if (!patch) {
        throw new InvalidUpdateLinkPayloadError();
    }

    const updated = await updateLinkByIdAndUser(userId, linkId, patch);
    if (!updated) {
        await assertLinkExistsAndNotDeleted(userId, linkId);
        throw new LinkNotFoundError();
    }

    if (patch.destinationUrl !== undefined) {
        await redis
            .set(cacheKeyFor(updated.shortCode), updated.longUrl, "EX", config.CACHE_TTL_SECONDS)
            .catch((err) => {
                logger.warn({ err, shortCode: updated.shortCode }, "Failed to refresh Redis cache after update");
            });
    }

    logger.info({ linkId, userId }, "Link updated");
    return toLinkResponse(updated);
}

export async function deleteLink(userId: string, linkIdParam: unknown): Promise<void> {
    const linkId = requireValidLinkId(linkIdParam);
    const row = await softDeleteLinkByIdAndUser(userId, linkId);

    if (!row) {
        throw new LinkNotFoundError();
    }

    await redis.del(cacheKeyFor(row.shortCode)).catch((err) => {
        logger.warn({ err, shortCode: row.shortCode }, "Failed to evict Redis cache after delete");
    });

    logger.info({ linkId, userId }, "Link soft-deleted");
}

async function assertLinkExistsAndNotDeleted(userId: string, linkId: string): Promise<void> {
    const row = await selectLinkByIdAndUser(userId, linkId);
    if (row && row.deletedAt) {
        throw new LinkDeletedConflictError();
    }
}
