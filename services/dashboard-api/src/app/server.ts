import Fastify from "fastify";
import { config } from "../infrastructure/config";
import { pool } from "../infrastructure/db/pool";
import { logger } from "../infrastructure/observability/logger";
import { sdk } from "../infrastructure/observability/otel";
import { redis } from "../infrastructure/cache/redis";
import { registerRoutes } from "./register-routes";
await sdk.start();
logger.info("OpenTelemetry SDK started");

const app = Fastify();

await registerRoutes(app);

try {
    await app.listen({
        port: config.PORT,
        host: "0.0.0.0",
    });
    logger.info({ port: config.PORT }, "Dashboard API started");
} catch (err) {
    logger.error({ err }, "Failed to start dashboard API");
    process.exit(1);
}

setupGracefulShutdown();

function setupGracefulShutdown() {
    const shutdown = async () => {
        logger.info("Shutdown signal received");

        try {
            await app.close();
            logger.info("HTTP server closed");

            await pool.end();
            logger.info("Postgres connection closed");

            await redis.quit();
            logger.info("Redis connection closed");

            await sdk.shutdown();
            logger.info("OpenTelemetry SDK shut down");

            process.exit(0);
        } catch (err) {
            logger.error({ err }, "Error during shutdown");
            process.exit(1);
        }
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
}
