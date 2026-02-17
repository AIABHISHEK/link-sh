import type { FastifyInstance } from "fastify";
import { pool } from "../db";
import { redis } from "../redis";

export default async function (app: FastifyInstance) {
    app.get("/:shortCode", async (req, reply) => {
        const { shortCode } = req.params as { shortCode: string };

        const cacheKey = `link:${shortCode}`;

        const cached = await redis.get(cacheKey);

        if (cached) {
            return reply.redirect(cached);
        }

        const result = await pool.query(
            "SELECT long_url FROM links WHERE short_code = $1",
            [shortCode]
        );

        if (result.rowCount === 0) {
            return reply.status(404).send({ error: "Not found" });
        }

        const longUrl = result.rows[0].long_url;

        await redis.set(cacheKey, longUrl, "EX", 60 * 60); //ttl 1 hour

        return reply.redirect(longUrl, 301);
    });
}
