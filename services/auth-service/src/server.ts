import Fastify from "fastify";
import { config } from "./config";
import { logger } from "./logger";
import { sdk } from "./otel";
import verifyRoutes from "./routes/verify";
import { assertVerifierUsable } from "./token-verifier";

await sdk.start();
logger.info("OpenTelemetry SDK started");

assertVerifierUsable();

const app = Fastify();

app.get("/health", async () => ({ status: "ok" }));
await app.register(verifyRoutes);

try {
    await app.listen({
        port: config.PORT,
        host: "0.0.0.0",
    });
    logger.info({ port: config.PORT }, "Auth service started");
} catch (err) {
    logger.error({ err }, "Failed to start auth service");
    process.exit(1);
}

setupGracefulShutdown();

function setupGracefulShutdown() {
    const shutdown = async () => {
        logger.info("Shutdown signal received");

        try {
            await app.close();
            logger.info("HTTP server closed");

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
