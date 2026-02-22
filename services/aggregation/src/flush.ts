import { pool } from "./db";
import { AggregationContext } from "./aggregator";

export async function flush(context: AggregationContext) {
    if (
        context.total.size === 0 &&
        context.hourly.size === 0 &&
        context.country.size === 0 &&
        context.device.size === 0
    ) return;

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
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}
