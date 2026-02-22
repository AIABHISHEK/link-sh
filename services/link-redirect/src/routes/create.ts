import type { FastifyInstance } from "fastify";
import { pool } from "../db";
import { generateShortCode } from "../idGenerator";
import { logger } from "../logger";

export default async function (app: FastifyInstance) {
    app.post("/links", async (req, reply) => {
        const { longUrl } = req.body as { longUrl: string };
        try {
            new URL(longUrl);
        } catch {
            logger.error({ longUrl }, "Invalid URL");
            return reply.status(400).send({ error: "Invalid URL" });
        }
        logger.info({ longUrl }, "Link creation requested");
        const shortCode = generateShortCode();
        await pool.query(
            "INSERT INTO links (short_code, long_url) VALUES ($1, $2)",
            [shortCode, longUrl]
        );

        return {
            shortUrl: `${process.env.BASE_URL}/${shortCode}`,
        };
    });
}
