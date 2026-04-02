import { createServiceLogger } from "@link-sh/shared-observability";
import { config } from "./config";

export const logger = createServiceLogger("aggregation-worker", config.LOG_LEVEL);
