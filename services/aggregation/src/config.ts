import { cleanEnv, str, num } from "envalid";

export const config = cleanEnv(process.env, {
    NODE_ENV: str({ default: "development" }),
    DATABASE_URL: str(),
    KAFKA_BROKERS: str(),
    LOG_LEVEL: str({ default: "info" }),
    PARTITIONS_CONCURRENT: num({ default: 1 }),
    TOPIC: str({ default: "link.clicks" }),
});
