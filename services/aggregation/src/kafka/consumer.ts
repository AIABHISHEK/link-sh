import { Kafka } from "kafkajs";
import { config } from "../config";

const kafka = new Kafka({
    clientId: "link-redirect-service",
    brokers: [config.KAFKA_BROKERS || "localhost:9092"],
    connectionTimeout: 3000,
    requestTimeout: 30000,
    retry: {
        initialRetryTime: 100,
        retries: 8
    }
})

export const consumer = kafka.consumer({
    groupId: "link-click-aggregator",
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
})
