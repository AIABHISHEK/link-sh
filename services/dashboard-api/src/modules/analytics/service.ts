import type {
    AnalyticsInterval,
    AnalyticsTimeseriesPoint,
    LinkAnalyticsCountries,
    LinkAnalyticsDevices,
    LinkAnalyticsOverview,
    LinkAnalyticsTimeseries,
} from "@link-sh/shared-types";
import { selectLinkByIdAndUser } from "../links/repository";
import { parseLinkId } from "../links/schemas";
import type { LinkRow } from "../links/types";
import {
    selectCountryAnalyticsByShortCode,
    selectDeviceAnalyticsByShortCode,
    selectHourlyAnalyticsByShortCode,
} from "./repository";
import { parseBreakdownLimit, parseDateRange, parseInterval, parseTimezone } from "./schemas";
import type { HourlyClickRow } from "./types";

const OVERVIEW_BREAKDOWN_LIMIT = 5;

export class InvalidLinkIdError extends Error {
    constructor() {
        super("Invalid linkId");
        this.name = "InvalidLinkIdError";
    }
}

export class InvalidAnalyticsQueryError extends Error {
    constructor() {
        super("Invalid analytics query parameters");
        this.name = "InvalidAnalyticsQueryError";
    }
}

export class LinkNotFoundError extends Error {
    constructor() {
        super("Link not found");
        this.name = "LinkNotFoundError";
    }
}

async function resolveOwnedLink(userId: string, linkIdParam: unknown): Promise<LinkRow> {
    const linkId = parseLinkId(linkIdParam);
    if (!linkId) {
        throw new InvalidLinkIdError();
    }

    const link = await selectLinkByIdAndUser(userId, linkId);
    if (!link) {
        throw new LinkNotFoundError();
    }

    return link;
}

// Hourly buckets are always UTC-aligned to match how the aggregation worker
// derives `date`/`hour` from the click event timestamp. Only day-level
// bucketing respects the requested timezone.
function hourlyRowToUtcDate(row: HourlyClickRow): Date {
    return new Date(`${row.date}T${String(row.hour).padStart(2, "0")}:00:00.000Z`);
}

function dayBucketKey(date: Date, timezone: string): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
}

function buildTimeseries(
    rows: HourlyClickRow[],
    interval: AnalyticsInterval,
    timezone: string
): AnalyticsTimeseriesPoint[] {
    if (interval === "hour") {
        return rows.map((row) => ({
            bucketStart: hourlyRowToUtcDate(row).toISOString(),
            clicks: Number(row.clickCount),
        }));
    }

    const buckets = new Map<string, number>();
    for (const row of rows) {
        const key = dayBucketKey(hourlyRowToUtcDate(row), timezone);
        buckets.set(key, (buckets.get(key) ?? 0) + Number(row.clickCount));
    }

    return Array.from(buckets.entries())
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([bucketStart, clicks]) => ({ bucketStart, clicks }));
}

export async function getAnalyticsOverview(
    userId: string,
    linkIdParam: unknown,
    query: unknown
): Promise<LinkAnalyticsOverview> {
    const link = await resolveOwnedLink(userId, linkIdParam);
    const raw = (query ?? {}) as Record<string, unknown>;

    const range = parseDateRange(raw);
    const timezone = parseTimezone(raw.timezone);
    if (!range || !timezone) {
        throw new InvalidAnalyticsQueryError();
    }

    const [hourlyRows, countryRows, deviceRows] = await Promise.all([
        selectHourlyAnalyticsByShortCode(link.shortCode, range.from, range.to),
        selectCountryAnalyticsByShortCode(link.shortCode, OVERVIEW_BREAKDOWN_LIMIT),
        selectDeviceAnalyticsByShortCode(link.shortCode, OVERVIEW_BREAKDOWN_LIMIT),
    ]);

    return {
        summary: { totalClicks: Number(link.clickCount) },
        timeseries: buildTimeseries(hourlyRows, "day", timezone),
        topCountries: countryRows.map((row) => ({ country: row.country, clicks: Number(row.clickCount) })),
        topDevices: deviceRows.map((row) => ({ deviceType: row.deviceType, clicks: Number(row.clickCount) })),
    };
}

export async function getAnalyticsTimeseries(
    userId: string,
    linkIdParam: unknown,
    query: unknown
): Promise<LinkAnalyticsTimeseries> {
    const link = await resolveOwnedLink(userId, linkIdParam);
    const raw = (query ?? {}) as Record<string, unknown>;

    const range = parseDateRange(raw);
    const timezone = parseTimezone(raw.timezone);
    const interval = parseInterval(raw.interval);
    if (!range || !timezone || !interval) {
        throw new InvalidAnalyticsQueryError();
    }

    const hourlyRows = await selectHourlyAnalyticsByShortCode(link.shortCode, range.from, range.to);

    return {
        interval,
        points: buildTimeseries(hourlyRows, interval, timezone),
    };
}

export async function getAnalyticsCountries(
    userId: string,
    linkIdParam: unknown,
    query: unknown
): Promise<LinkAnalyticsCountries> {
    const link = await resolveOwnedLink(userId, linkIdParam);
    const raw = (query ?? {}) as Record<string, unknown>;
    const limit = parseBreakdownLimit(raw.limit);

    const rows = await selectCountryAnalyticsByShortCode(link.shortCode, limit);

    return {
        items: rows.map((row) => ({ country: row.country, clicks: Number(row.clickCount) })),
    };
}

export async function getAnalyticsDevices(
    userId: string,
    linkIdParam: unknown,
    query: unknown
): Promise<LinkAnalyticsDevices> {
    const link = await resolveOwnedLink(userId, linkIdParam);
    const raw = (query ?? {}) as Record<string, unknown>;
    const limit = parseBreakdownLimit(raw.limit);

    const rows = await selectDeviceAnalyticsByShortCode(link.shortCode, limit);

    return {
        items: rows.map((row) => ({ deviceType: row.deviceType, clicks: Number(row.clickCount) })),
    };
}
