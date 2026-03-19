import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { trace } from "@opentelemetry/api";
import { config } from "../config";
import { pool } from "../db";
import { redis } from "../redis";
import { enqueueClickEvent } from "../kafka/producer";
import { logger } from "../logger";
import { recordRedirectRequest, type RedirectRequestOutcome } from "../metrics";
import { rateLimit } from "../middleware/rateLimit";

const tracer = trace.getTracer("redirect-service");
const NEGATIVE_CACHE_SENTINEL = "__NOT_FOUND__";
const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
end
return 0
`;

export default async function (app: FastifyInstance) {
    app.get("/:shortCode", async (req, reply) => {
        const { shortCode } = req.params as { shortCode: string };
        const span = tracer.startSpan("redirect-handler");
        let outcome: RedirectRequestOutcome | null = null;

        try {
            if (!await rateLimit(req.ip)) {
                outcome = "rate_limited";
                return reply.status(429).send({ error: "Too many requests" });
            }

            const cacheKey = `link:${shortCode}`;
            logger.info({ shortCode }, "redirect requested");
            const longUrl = await resolveLongUrlWithStampedeProtection(shortCode, cacheKey);
            if (!longUrl) {
                logger.debug({ shortCode }, "redirect negative cache hit");
                outcome = "not_found";
                return reply.status(404).send({ error: "Not found" });
            }

            // Queue Kafka event for internal batching/compression/retry handling.
            enqueueClickEvent({
                shortCode,
                timestamp: Date.now(),
                ip: req.ip,
                userAgent: req.headers["user-agent"],
            });

            outcome = "redirect";
            return reply.redirect(longUrl);
        } catch (err) {
            outcome = "error";
            logger.error({ err, shortCode }, "redirect failed");
            return reply.status(500).send({ error: "Internal server error" });
        } finally {
            if (outcome) {
                span.setAttribute("redirect.outcome", outcome);
                recordRedirectRequest(outcome);
            }
            span.end();
        }
    });

    app.get("/otel-test", async (_, reply) => {
        const tracer = trace.getTracer("debug");

        await tracer.startActiveSpan("test-span", async (span) => {
            await new Promise(r => setTimeout(r, 100));
            span.end();
        });

        return "ok";
    });
}


const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function releaseCacheLock(lockKey: string, lockToken: string) {
    await redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, lockToken);
}

async function fetchLongUrlFromDb(shortCode: string, cacheKey: string): Promise<string | null> {
    const result = await pool.query(
        "SELECT long_url FROM links WHERE short_code = $1",
        [shortCode]
    );

    if (result.rowCount === 0) {
        await redis.set(cacheKey, NEGATIVE_CACHE_SENTINEL, "EX", config.NEGATIVE_CACHE_TTL_SECONDS);
        return null;
    }

    const longUrl = result.rows[0].long_url as string;
    await redis.set(cacheKey, longUrl, "EX", config.CACHE_TTL_SECONDS);
    return longUrl;
}

async function resolveLongUrlWithStampedeProtection(shortCode: string, cacheKey: string): Promise<string | null> {
    const cached = await redis.get(cacheKey);
    if (cached === NEGATIVE_CACHE_SENTINEL) {
        return null;
    }
    if (cached) {
        return cached;
    }

    const lockKey = `${cacheKey}:lock`;
    const lockToken = randomUUID();
    const lockAcquired = await redis.set(lockKey, lockToken, "EX", config.CACHE_LOCK_TTL_SECONDS, "NX");

    if (lockAcquired === "OK") {
        try {
            return await fetchLongUrlFromDb(shortCode, cacheKey);
        } finally {
            await releaseCacheLock(lockKey, lockToken).catch((err) => {
                logger.warn({ err, shortCode }, "failed to release cache lock");
            });
        }
    }

    for (let attempt = 0; attempt < config.CACHE_WAIT_RETRIES; attempt++) {
        await sleep(config.CACHE_WAIT_MS);

        const waitedValue = await redis.get(cacheKey);
        if (waitedValue === NEGATIVE_CACHE_SENTINEL) {
            return null;
        }
        if (waitedValue) {
            return waitedValue;
        }
    }

    const retryLockToken = randomUUID();
    const retryLockAcquired = await redis.set(
        lockKey,
        retryLockToken,
        "EX",
        config.CACHE_LOCK_TTL_SECONDS,
        "NX"
    );
    if (retryLockAcquired === "OK") {
        try {
            return await fetchLongUrlFromDb(shortCode, cacheKey);
        } finally {
            await releaseCacheLock(lockKey, retryLockToken).catch((err) => {
                logger.warn({ err, shortCode }, "failed to release cache lock");
            });
        }
    }

    logger.warn({ shortCode }, "cache lock wait timed out, falling back to direct DB read");
    return fetchLongUrlFromDb(shortCode, cacheKey);
}
