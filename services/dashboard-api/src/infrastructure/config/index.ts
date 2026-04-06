import "dotenv/config";
import { cleanEnv, num, str } from "envalid";
import { logLevelValidator, nodeEnvValidator } from "@link-sh/shared-config";

export const config = cleanEnv(process.env, {
    NODE_ENV: nodeEnvValidator(),
    PORT: num({ default: 3001 }),
    DATABASE_URL: str(),
    REDIS_URL: str(),
    BASE_URL: str(),
    CACHE_TTL_SECONDS: num({ default: 60 * 60 }),
    LOG_LEVEL: logLevelValidator(),
});
