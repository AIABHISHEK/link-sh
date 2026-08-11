import { createServiceLogger } from "@link-sh/shared-observability";
import { config } from "./config";

export const logger = createServiceLogger("auth-service", config.LOG_LEVEL);
