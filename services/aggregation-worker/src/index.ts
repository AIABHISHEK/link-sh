import { sdk } from "./otel";
import { trace } from "@opentelemetry/api";
import type { ClickEvent } from "@link-sh/shared-types";
import { consumer } from "./kafka/consumer";
import { AggregationContext } from "./aggregator";
import { flush } from "./flush";
import { logger } from "./logger";
import { config } from "./config";
import { pool } from "./db";

let isShuttingDown = false;
let currentContext: AggregationContext | null = null;
const tracer = trace.getTracer("aggregation-worker");

await sdk.start();
logger.info("OpenTelemetry SDK started");

async function start() {
    logger.info({ topic: config.TOPIC }, "Starting aggregation consumer");

    await consumer.connect()
    logger.info("Kafka consumer connected");

    await consumer.subscribe({
        topic: config.TOPIC,
    })
    logger.info({ topic: config.TOPIC }, "Kafka consumer subscribed");

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
            await tracer.startActiveSpan("aggregation.process_batch", async (span) => {
                span.setAttributes({
                    "messaging.system": "kafka",
                    "messaging.destination.name": batch.topic,
                    "messaging.kafka.partition": batch.partition,
                    "messaging.batch.message_count": batch.messages.length,
                    "messaging.kafka.high_watermark": batch.highWatermark,
                });

                logger.info({
                    topic: batch.topic,
                    partition: batch.partition,
                    batchSize: batch.messages.length,
                    highWatermark: batch.highWatermark,
                }, "Processing Kafka batch");

                currentContext = new AggregationContext();
                let processedMessages = 0;

                try {
                    for (const message of batch.messages) {
                        if (!isRunning() || isStale()) {
                            logger.warn({
                                topic: batch.topic,
                                partition: batch.partition,
                                processedMessages,
                            }, "Stopping batch processing because consumer is not running or batch is stale");
                            break;
                        }

                        if (!message.value) {
                            logger.warn({
                                topic: batch.topic,
                                partition: batch.partition,
                                offset: message.offset,
                            }, "Skipping Kafka message with empty value");
                            continue;
                        }

                        const event = JSON.parse(message.value.toString()) as ClickEvent;
                        currentContext.process(event);
                        processedMessages += 1;
                        resolveOffset(message.offset);
                        await heartbeat();
                    }

                    span.setAttribute("messaging.batch.processed_count", processedMessages);
                    await flush(currentContext);
                    await commitOffsetsIfNecessary();
                    logger.info({
                        topic: batch.topic,
                        partition: batch.partition,
                        processedMessages,
                    }, "Kafka batch processed successfully");
                } catch (err) {
                    span.recordException(err as Error);
                    logger.error({
                        err,
                        topic: batch.topic,
                        partition: batch.partition,
                        processedMessages,
                    }, "Kafka batch processing failed");
                    throw err;
                } finally {
                    span.end();
                }
            });
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

        await sdk.shutdown();
        logger.info("OpenTelemetry SDK shut down");

        process.exit(0);
    } catch (err) {
        logger.error({ err }, "Shutdown failed");
        process.exit(1);
    }
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
