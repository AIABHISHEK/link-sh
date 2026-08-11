import "dotenv/config";
import { cleanEnv, num } from "envalid";
import { logLevelValidator, nodeEnvValidator } from "@link-sh/shared-config";

export const config = cleanEnv(process.env, {
    NODE_ENV: nodeEnvValidator(),
    PORT: num({ default: 3003 }),
    LOG_LEVEL: logLevelValidator(),
});
