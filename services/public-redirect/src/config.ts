import { cleanEnv, num, str } from "envalid";
import { logLevelValidator, nodeEnvValidator } from "@link-sh/shared-config";

export const config = cleanEnv(process.env, {
    NODE_ENV: nodeEnvValidator(),
    PORT: num({ default: 3000 }),
    DATABASE_URL: str(),
    REDIS_URL: str(),
    CACHE_TTL_SECONDS: num({ default: 60 * 60 }),
    NEGATIVE_CACHE_TTL_SECONDS: num({ default: 30 }),
    CACHE_LOCK_TTL_SECONDS: num({ default: 5 }),
    CACHE_WAIT_MS: num({ default: 50 }),
    CACHE_WAIT_RETRIES: num({ default: 20 }),
    KAFKA_BATCH_SIZE: num({ default: 100 }),
    KAFKA_BATCH_MAX_WAIT_MS: num({ default: 25 }),
    KAFKA_MAX_BUFFERED_MESSAGES: num({ default: 10_000 }),
    KAFKA_PRODUCER_RETRIES: num({ default: 8 }),
    KAFKA_PRODUCER_RETRY_INITIAL_MS: num({ default: 300 }),
    KAFKA_PRODUCER_RETRY_MAX_MS: num({ default: 30_000 }),
    KAFKA_PRODUCER_ACK_TIMEOUT_MS: num({ default: 30_000 }),
    LOG_LEVEL: logLevelValidator(),
    KAFKA_BROKERS: str(),
});
