import { pool } from "../../infrastructure/db/pool";
import type { CountryClickRow, DeviceClickRow, HourlyClickRow } from "./types";

export async function selectHourlyAnalyticsByShortCode(
    shortCode: string,
    fromUtc: Date,
    toUtc: Date
): Promise<HourlyClickRow[]> {
    const result = await pool.query(
        `
        SELECT
            to_char(date, 'YYYY-MM-DD') AS "date",
            hour,
            click_count AS "clickCount"
        FROM link_click_hourly
        WHERE short_code = $1
          AND (date + (hour || ' hour')::interval) >= ($2::timestamptz AT TIME ZONE 'UTC')
          AND (date + (hour || ' hour')::interval) < ($3::timestamptz AT TIME ZONE 'UTC')
        ORDER BY date, hour
        `,
        [shortCode, fromUtc, toUtc]
    );

    return result.rows as HourlyClickRow[];
}

export async function selectCountryAnalyticsByShortCode(
    shortCode: string,
    limit: number
): Promise<CountryClickRow[]> {
    const result = await pool.query(
        `
        SELECT country, click_count AS "clickCount"
        FROM link_click_country
        WHERE short_code = $1
        ORDER BY click_count DESC, country ASC
        LIMIT $2
        `,
        [shortCode, limit]
    );

    return result.rows as CountryClickRow[];
}

export async function selectDeviceAnalyticsByShortCode(
    shortCode: string,
    limit: number
): Promise<DeviceClickRow[]> {
    const result = await pool.query(
        `
        SELECT device_type AS "deviceType", click_count AS "clickCount"
        FROM link_click_device
        WHERE short_code = $1
        ORDER BY click_count DESC, device_type ASC
        LIMIT $2
        `,
        [shortCode, limit]
    );

    return result.rows as DeviceClickRow[];
}
