import { pool } from "../../infrastructure/db/pool";
import { redis } from "../../infrastructure/cache/redis";

export async function checkServiceHealth() {
    await pool.query("SELECT 1");
    await redis.ping();
}
