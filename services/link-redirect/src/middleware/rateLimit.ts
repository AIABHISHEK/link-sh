import { recordRateLimitCheck } from "../metrics";
import { redis } from "../redis";

const LIMIT = 100;
const WINDOW = 60; // seconds

export async function rateLimit(ip: string) {
    const key = `rate_limit:${ip}`;

    const count = await redis.incr(key);

    if (count === 1) {
        await redis.expire(key, WINDOW);
    }

    if (count > LIMIT) {
        recordRateLimitCheck("blocked");
        return false;
    }

    recordRateLimitCheck("allowed");
    return true;
}
