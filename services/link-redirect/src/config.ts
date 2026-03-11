import { cleanEnv, str, num } from "envalid";

export const config = cleanEnv(process.env, {
    NODE_ENV: str({ choices: ["development", "production", "test"], default: "development" }),
    PORT: num({ default: 3000 }),
    DATABASE_URL: str(),
    REDIS_URL: str(),
    CACHE_TTL_SECONDS: num({ default: 60 * 60 }),
    NEGATIVE_CACHE_TTL_SECONDS: num({ default: 30 }),
    CACHE_LOCK_TTL_SECONDS: num({ default: 5 }),
    CACHE_WAIT_MS: num({ default: 50 }),
    CACHE_WAIT_RETRIES: num({ default: 20 }),
    LOG_LEVEL: str({ choices: ["error", "warn", "info", "debug"], default: "info" }),
    KAFKA_BROKERS: str(),
})
