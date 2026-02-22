import { consumer } from "./kafka/consumer";
import { AggregationContext } from "../src/aggregator";
import { flush } from "./flush";
import { logger } from "./logger";
import { config } from "./config";
import { pool } from "./db";

let isShuttingDown = false;
let currentContext: AggregationContext | null = null;
async function start() {
    await consumer.connect()
    await consumer.subscribe({
        topic: config.TOPIC,
    })

    await consumer.run({
        autoCommit: false,
        eachBatch: async ({
            batch,
            resolveOffset,
            heartbeat,
            commitOffsetsIfNecessary,
            isRunning,
            isStale,
        }) => {
            logger.info({ batchSize: batch.messages.length }, "Processing batch");
            logger.info({ batchMessages: batch.messages.map(m => m.value?.toString()) }, "Batch messages");
            currentContext = new AggregationContext();
            for (const message of batch.messages) {
                if (!isRunning() || isStale()) break;
                if (!message.value) continue;

                const event = JSON.parse(message.value.toString());
                currentContext.process(event);
                resolveOffset(message.offset);
                await heartbeat();
            }
            await flush(currentContext);
            await commitOffsetsIfNecessary();
        }
    })
    logger.info("Kafka consumer started");
}

start().catch(
    (err) => {
        logger.error({ err }, "Error starting consumer");
        process.exit(1);
    }
);


// Handle graceful shutdown
async function shutdown() {
    logger.info("Shutdown signal received");
    isShuttingDown = true;

    try {
        await consumer.stop();
        logger.info("Kafka polling stopped");

        if (currentContext) {
            await flush(currentContext);
            logger.info("Final batch flushed");
        }

        await consumer.disconnect();
        logger.info("Kafka disconnected");

        await pool.end();
        logger.info("Postgres connection closed");

        process.exit(0);
    } catch (err) {
        logger.error({ err }, "Shutdown failed");
        process.exit(1);
    }
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);