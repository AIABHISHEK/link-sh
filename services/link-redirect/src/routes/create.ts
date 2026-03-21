import type { FastifyInstance } from "fastify";
import { trace } from "@opentelemetry/api";
import { config } from "../config";
import { pool } from "../db";
import { generateShortCode } from "../idGenerator";
import { logger } from "../logger";
import {
    recordCreateRequest,
    recordRequestDuration,
    type CreateRequestOutcome,
} from "../metrics";
import { redis } from "../redis";

const tracer = trace.getTracer("redirect-service");
const CREATE_LINK_MAX_ATTEMPTS = 3;
const UNIQUE_VIOLATION = "23505";

export default async function (app: FastifyInstance) {
    app.post("/links", async (req, reply) => {
        const span = tracer.startSpan("create-link-handler");
        const startedAt = performance.now();
        let outcome: CreateRequestOutcome | null = null;

        try {
            const longUrl = getValidatedLongUrl(req.body);
            if (!longUrl) {
                outcome = "invalid_url";
                logger.warn({ body: req.body }, "Invalid create link payload");
                return reply.status(400).send({ error: "Invalid URL" });
            }

            logger.info({ longUrl }, "Link creation requested");
            const shortCode = await createLinkWithRetries(longUrl);
            await redis.set(`link:${shortCode}`, longUrl, "EX", config.CACHE_TTL_SECONDS).catch((err) => {
                logger.warn({ err, shortCode }, "Failed to warm Redis cache for new link");
            });

            outcome = "created";
            logger.info({ shortCode }, "Link created successfully");
            return {
                shortUrl: `${config.BASE_URL}/${shortCode}`,
            };
        } catch (err) {
            outcome = "error";
            span.recordException(err as Error);
            logger.error({ err }, "Link creation failed");
            return reply.status(500).send({ error: "Internal server error" });
        } finally {
            if (outcome) {
                span.setAttribute("create.outcome", outcome);
                recordCreateRequest(outcome);
                recordRequestDuration("create", "POST", outcome, performance.now() - startedAt);
            }
            span.end();
        }
    });
}

function getValidatedLongUrl(body: unknown): string | null {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return null;
    }

    const { longUrl } = body as { longUrl?: unknown };
    if (typeof longUrl !== "string" || longUrl.trim().length === 0) {
        return null;
    }

    try {
        new URL(longUrl);
        return longUrl;
    } catch {
        return null;
    }
}

async function createLinkWithRetries(longUrl: string): Promise<string> {
    for (let attempt = 1; attempt <= CREATE_LINK_MAX_ATTEMPTS; attempt++) {
        const shortCode = generateShortCode();

        try {
            await pool.query(
                "INSERT INTO links (short_code, long_url) VALUES ($1, $2)",
                [shortCode, longUrl]
            );
            return shortCode;
        } catch (err) {
            if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
                logger.warn({ attempt, shortCode }, "Short code collision detected during link creation");
                continue;
            }

            throw err;
        }
    }

    throw new Error("Exceeded maximum retries while generating a unique short code");
}
