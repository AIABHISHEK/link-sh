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
        return false;
    }

    return true;
}
