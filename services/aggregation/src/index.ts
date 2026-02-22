import { consumer } from "./kafka/consumer";
import { AggregationContext } from "../src/aggregator";
import { flush } from "./flush";

async function start() {
    await consumer.connect()
    await consumer.subscribe({ topic: "link.clicks" })

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
            const context = new AggregationContext();
            for (const message of batch.messages) {
                if (!isRunning() || isStale()) break;
                if (!message.value) continue;

                const event = JSON.parse(message.value.toString());
                console.log("Processing event:", event);
                context.process(event);
                resolveOffset(message.offset);
                await heartbeat();
            }
            await flush(context);
            await commitOffsetsIfNecessary();
        }
    })
    console.log("Aggregator running");
}

start().catch(console.error);