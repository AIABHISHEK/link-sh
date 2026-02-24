import { cleanEnv, str, num } from "envalid";

export const config = cleanEnv(process.env, {
    NODE_ENV: str({ choices: ["development", "production", "test"], default: "development" }),
    PORT: num({ default: 3000 }),
    DATABASE_URL: str(),
    REDIS_URL: str(),
    LOG_LEVEL: str({ choices: ["error", "warn", "info", "debug"], default: "info" }),
    KAFKA_BROKERS: str(),
})
