import type { AnalyticsInterval } from "@link-sh/shared-types";
import type { AnalyticsDateRange } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 7;
const MAX_RANGE_DAYS = 90;
const DEFAULT_BREAKDOWN_LIMIT = 10;
const MAX_BREAKDOWN_LIMIT = 50;

export function parseDateRange(query: Record<string, unknown>): AnalyticsDateRange | null {
    const to = query.to !== undefined ? new Date(String(query.to)) : new Date();
    if (Number.isNaN(to.getTime())) {
        return null;
    }

    const from = query.from !== undefined
        ? new Date(String(query.from))
        : new Date(to.getTime() - DEFAULT_RANGE_DAYS * MS_PER_DAY);
    if (Number.isNaN(from.getTime())) {
        return null;
    }

    if (from.getTime() >= to.getTime()) {
        return null;
    }

    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * MS_PER_DAY) {
        return null;
    }

    return { from, to };
}

export function parseTimezone(value: unknown): string | null {
    if (value === undefined) {
        return "UTC";
    }
    if (typeof value !== "string") {
        return null;
    }

    try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });
        return value;
    } catch {
        return null;
    }
}

export function parseInterval(value: unknown): AnalyticsInterval | null {
    if (value === undefined) {
        return "day";
    }
    if (value === "hour" || value === "day") {
        return value;
    }
    return null;
}

export function parseBreakdownLimit(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
        return DEFAULT_BREAKDOWN_LIMIT;
    }
    return Math.min(Math.floor(n), MAX_BREAKDOWN_LIMIT);
}
