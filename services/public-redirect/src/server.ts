import dotenv from "dotenv";
dotenv.config();
import Fastify from "fastify";
import { connectProducer, disconnectProducer } from "./kafka/producer";
import { config } from "./config";
import { pool } from "./db";
import healthRoute from "./health";
import { logger } from "./logger";
import redirectRoute from "./routes/redirect";
import { redis } from "./redis";
import { sdk } from "./otel";

await sdk.start();
logger.info("OpenTelemetry SDK started");

const app = Fastify();

app.register(redirectRoute);
app.register(healthRoute);

try {
    await connectProducer();
    await app.listen({
        port: config.PORT,
        host: "0.0.0.0",
    });
    logger.info({ port: config.PORT }, "Public redirect service started");
} catch (err) {
    logger.error({ err }, "Failed to start public redirect service");
    process.exit(1);
}

setupGracefulShutdown();

function setupGracefulShutdown() {
    const shutdown = async () => {
        logger.info("Shutdown signal received");

        try {
            await app.close();
            logger.info("HTTP server closed");

            await disconnectProducer();

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
