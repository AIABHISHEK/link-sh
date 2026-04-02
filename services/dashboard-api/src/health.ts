import type { FastifyInstance } from "fastify";
import { pool } from "./db";
import { redis } from "./redis";

export default async function (app: FastifyInstance) {
    app.get("/health", async () => {
        await pool.query("SELECT 1");
        await redis.ping();
        return { status: "ok" };
    });
}
