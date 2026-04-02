import { createServiceLogger } from "@link-sh/shared-observability";
import { config } from "./config";

export const logger = createServiceLogger("public-redirect", config.LOG_LEVEL);
