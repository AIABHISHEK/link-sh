import { Kafka } from "kafkajs";

const kafka = new Kafka({
    clientId: "link-redirect-service",
    brokers: [process.env.KAFKA_BROKER || "localhost:9092"],
});

export const producer = kafka.producer();

export async function connectProducer() {
    await producer.connect();
    console.log("Kafka producer connected");
}
