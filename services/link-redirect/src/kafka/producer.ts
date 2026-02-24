import { Kafka } from "kafkajs";
import { logger } from "../logger";
import { config } from "../config";

const kafka = new Kafka({
    clientId: "link-redirect-service",
    brokers: [config.KAFKA_BROKERS || "localhost:9092"],
});

export const producer = kafka.producer();

export async function connectProducer() {
    await producer.connect();
    logger.info("Kafka producer connected");
}
