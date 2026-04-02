import { trace } from "@opentelemetry/api";
import { pool } from "./db";
import { AggregationContext } from "./aggregator";
import { logger } from "./logger";

const tracer = trace.getTracer("aggregation-worker");

export async function flush(context: AggregationContext) {
    if (
        context.total.size === 0 &&
        context.hourly.size === 0 &&
        context.country.size === 0 &&
        context.device.size === 0
    ) return;

    return tracer.startActiveSpan("aggregation.flush", async (span) => {
        span.setAttributes({
            "aggregation.total_keys": context.total.size,
            "aggregation.hourly_keys": context.hourly.size,
            "aggregation.country_keys": context.country.size,
            "aggregation.device_keys": context.device.size,
        });

        logger.info({
            totalKeys: context.total.size,
            hourlyKeys: context.hourly.size,
            countryKeys: context.country.size,
            deviceKeys: context.device.size,
        }, "Flushing aggregation context");

        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            for (const [shortCode, count] of context.total) {
                await client.query(
                    `
        UPDATE links
        SET click_count = click_count + $1
        WHERE short_code = $2
        `,
                    [count, shortCode]
                );
            }

            for (const [key, count] of context.hourly) {
                const [shortCode, date, hour] = key.split(":");

                await client.query(
                    `
        INSERT INTO link_click_hourly (short_code, date, hour, click_count)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (short_code, date, hour)
        DO UPDATE SET click_count =
          link_click_hourly.click_count + EXCLUDED.click_count
        `,
                    [shortCode, date, Number(hour), count]
                );
            }

            for (const [key, count] of context.country) {
                const [shortCode, countryCode] = key.split(":");

                await client.query(
                    `
        INSERT INTO link_click_country (short_code, country, click_count)
        VALUES ($1, $2, $3)
        ON CONFLICT (short_code, country)
        DO UPDATE SET click_count =
          link_click_country.click_count + EXCLUDED.click_count
        `,
                    [shortCode, countryCode, count]
                );
            }

            for (const [key, count] of context.device) {
                const [shortCode, deviceType] = key.split(":");

                await client.query(
                    `
        INSERT INTO link_click_device (short_code, device_type, click_count)
        VALUES ($1, $2, $3)
        ON CONFLICT (short_code, device_type)
        DO UPDATE SET click_count =
          link_click_device.click_count + EXCLUDED.click_count
        `,
                    [shortCode, deviceType, count]
                );
            }

            await client.query("COMMIT");
            logger.info("Aggregation flush committed");
        } catch (err) {
            span.recordException(err as Error);
            await client.query("ROLLBACK");
            logger.error({ err }, "Aggregation flush failed");
            throw err;
        } finally {
            client.release();
            span.end();
        }
    });
}
