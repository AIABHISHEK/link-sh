import { sdk } from "./otel";
await sdk.start();
import { logger } from "./logger";
console.log("OpenTelemetry SDK started");
import Fastify from "fastify";
import dotenv from "dotenv";
import createRoute from "./routes/create";
import redirectRoute from "./routes/redirect";
import healthRoute from "./health";
import { connectProducer } from "./kafka/producer";
import { config } from "./config";
import { producer } from "./kafka/producer";
import { pool } from "./db";
import { redis } from "./redis";


dotenv.config();

const app = Fastify();

app.register(createRoute);
app.register(redirectRoute);
app.register(healthRoute);

// TODO: fix the the connection with proper error handling following good practices

await connectProducer();
const server = await app.listen({ port: Number(process.env.PORT), host: "0.0.0.0" })
    .then(() => {
        logger.info("Server started");
    })
    .catch(err => {
        logger.error(err);
        process.exit(1);
    });
setupGracefulShutdown(server);

function setupGracefulShutdown(server: any) {
    const shutdown = async () => {
        logger.info("Shutdown signal received");

        try {
            await app.close();
            logger.info("HTTP server closed");

            await producer.disconnect();
            logger.info("Kafka producer disconnected");

            await pool.end();
            logger.info("Postgres connection closed");

            await redis.quit();
            logger.info("Redis connection closed");

            process.exit(0);
        } catch (err) {
            logger.error({ err }, "Error during shutdown");
            process.exit(1);
        }
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
}
