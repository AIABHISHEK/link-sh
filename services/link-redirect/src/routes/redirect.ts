import type { FastifyInstance } from "fastify";
import { pool } from "../db";
import { redis } from "../redis";
import { producer } from "../kafka/producer";
import { logger } from "../logger";

import { trace } from "@opentelemetry/api";
const tracer = trace.getTracer("redirect-service");


export default async function (app: FastifyInstance) {
    app.get("/:shortCode", async (req, reply) => {
        const span = tracer.startSpan("redirect-handler");
        const { shortCode } = req.params as { shortCode: string };
        const cacheKey = `link:${shortCode}`;
        logger.info({ shortCode }, "redirect requested");
        let longUrl: string | null = null;
        const cached = await redis.get(cacheKey);
        if (cached) {
            longUrl = cached;
        } else {
            // Fallback to DB
            const result = await pool.query(
                "SELECT long_url FROM links WHERE short_code = $1",
                [shortCode]
            );

            if (result.rowCount === 0) {
                return reply.status(404).send({ error: "Not found" });
            }

            longUrl = result.rows[0].long_url;

            // Cache it
            await redis.set(cacheKey, longUrl!, "EX", 60 * 60);
        }

        // Produce Kafka event (non-blocking)
        producer.send({
            topic: "link.clicks",
            messages: [
                {
                    key: shortCode, // partition key
                    value: JSON.stringify({
                        shortCode,
                        timestamp: Date.now(),
                        ip: req.ip,
                        userAgent: req.headers["user-agent"],
                    }),
                },
            ],
        }).catch((err) => {
            logger.error({ err, shortCode }, "Failed to produce Kafka event");
        });
        span.end();
        return reply.redirect(longUrl!);
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
