import { cleanEnv, num, str } from "envalid";
import { logLevelValidator, nodeEnvValidator } from "@link-sh/shared-config";

export const config = cleanEnv(process.env, {
    NODE_ENV: nodeEnvValidator(),
    DATABASE_URL: str(),
    KAFKA_BROKERS: str(),
    LOG_LEVEL: logLevelValidator(),
    PARTITIONS_CONCURRENT: num({ default: 1 }),
    TOPIC: str({ default: "link.clicks" }),
});
