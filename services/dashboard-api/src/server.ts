import dotenv from "dotenv";
import Fastify from "fastify";
import { config } from "./config";
import { pool } from "./db";
import healthRoute from "./health";
import { logger } from "./logger";
import { redis } from "./redis";
import createRoute from "./routes/create";
import { sdk } from "./otel";

dotenv.config();
await sdk.start();
logger.info("OpenTelemetry SDK started");

const app = Fastify();

app.register(createRoute);
app.register(healthRoute);

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
