import { createServiceLogger } from "@link-sh/shared-observability";
import { config } from "./config";

export const logger = createServiceLogger("dashboard-api", config.LOG_LEVEL);
