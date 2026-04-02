import { CompressionTypes, Kafka, type Message } from "kafkajs";
import type { ClickEvent } from "@link-sh/shared-types";
import { logger } from "../logger";
import { config } from "../config";

type BufferedRecord = {
    topic: string;
    message: Message;
};

const kafka = new Kafka({
    clientId: "public-redirect-service",
    brokers: [config.KAFKA_BROKERS || "localhost:9092"],
});

export const producer = kafka.producer({
    idempotent: true,
    maxInFlightRequests: 5,
    retry: {
        retries: config.KAFKA_PRODUCER_RETRIES,
        initialRetryTime: config.KAFKA_PRODUCER_RETRY_INITIAL_MS,
        maxRetryTime: config.KAFKA_PRODUCER_RETRY_MAX_MS,
    },
});

const bufferedRecords: BufferedRecord[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight: Promise<void> | null = null;
let producerConnected = false;

async function sendTopicMessages(topic: string, messages: Message[]) {
    await producer.send({
        topic,
        messages,
        compression: CompressionTypes.GZIP,
        acks: -1,
        timeout: config.KAFKA_PRODUCER_ACK_TIMEOUT_MS,
    });
}

function scheduleFlush(delayMs = config.KAFKA_BATCH_MAX_WAIT_MS) {
    if (flushTimer) {
        return;
    }

    flushTimer = setTimeout(() => {
        flushTimer = null;
        void flushBufferedRecords();
    }, delayMs);

    (flushTimer as NodeJS.Timeout).unref?.();
}

async function sendOverflowRecord(record: BufferedRecord) {
    if (!producerConnected) {
        logger.warn({ topic: record.topic }, "Kafka buffer full and producer disconnected, dropping message");
        return;
    }

    try {
        await sendTopicMessages(record.topic, [record.message]);
        logger.warn({ topic: record.topic }, "Kafka buffer full, sent message directly without buffering");
    } catch (err) {
        logger.error({ err, topic: record.topic }, "Kafka buffer full and direct send failed, dropping message");
    }
}

function bufferRecord(record: BufferedRecord) {
    if (bufferedRecords.length >= config.KAFKA_MAX_BUFFERED_MESSAGES) {
        void flushBufferedRecords();
        void sendOverflowRecord(record);
        return;
    }

    bufferedRecords.push(record);
    if (bufferedRecords.length >= config.KAFKA_BATCH_SIZE) {
        void flushBufferedRecords();
        return;
    }

    scheduleFlush();
}

async function sendBufferedBatch(batch: BufferedRecord[]) {
    const topicGroups = new Map<string, Message[]>();

    for (const record of batch) {
        const existing = topicGroups.get(record.topic);
        if (existing) {
            existing.push(record.message);
            continue;
        }

        topicGroups.set(record.topic, [record.message]);
    }

    for (const [topic, messages] of topicGroups) {
        await sendTopicMessages(topic, messages);
    }
}

async function flushBufferedRecords() {
    if (!producerConnected || bufferedRecords.length === 0) {
        return;
    }

    if (flushInFlight) {
        await flushInFlight;
        return;
    }

    flushInFlight = (async () => {
        while (producerConnected && bufferedRecords.length > 0) {
            const batchSize = Math.min(config.KAFKA_BATCH_SIZE, bufferedRecords.length);
            const batch = bufferedRecords.slice(0, batchSize);

            try {
                await sendBufferedBatch(batch);
                bufferedRecords.splice(0, batchSize);
            } catch (err) {
                bufferedRecords.splice(0, batchSize);
                logger.error(
                    {
                        err,
                        pendingMessages: bufferedRecords.length,
                        droppedCount: batchSize,
                    },
                    "Failed to flush Kafka batch after producer retries, dropped batch"
                );
            }
        }
    })().finally(() => {
        flushInFlight = null;
    });

    await flushInFlight;
}

export function enqueueClickEvent(event: ClickEvent) {
    bufferRecord({
        topic: "link.clicks",
        message: {
            key: event.shortCode,
            value: JSON.stringify(event),
        },
    });
}

export async function connectProducer() {
    if (producerConnected) {
        return;
    }

    await producer.connect();
    logger.info("Kafka producer connected");
    producerConnected = true;

    if (bufferedRecords.length > 0) {
        scheduleFlush(0);
    }
}

export async function disconnectProducer() {
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }

    await flushBufferedRecords().catch((err) => {
        logger.error({ err }, "Failed while flushing Kafka buffer during shutdown");
    });

    if (bufferedRecords.length > 0) {
        logger.warn({ droppedMessages: bufferedRecords.length }, "Dropping buffered Kafka messages on shutdown");
    }

    if (!producerConnected) {
        return;
    }

    await producer.disconnect();
    producerConnected = false;
    logger.info("Kafka producer disconnected");
}
