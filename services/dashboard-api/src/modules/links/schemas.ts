import type { LinkStatus } from "@link-sh/shared-types";
import { getValidatedUrl } from "../../shared/utils/url";
import type { CreateLinkPayload, ListLinksFilter, UpdateLinkPayload } from "./types";

const MAX_LIST_LIMIT = 100;
const DEFAULT_LIST_LIMIT = 20;
const VALID_STATUSES: LinkStatus[] = ["active", "expired", "deleted"];

function parseExpiresAt(value: unknown): { ok: true; value: Date | null } | { ok: false } {
    if (value === null || value === undefined) {
        return { ok: true, value: null };
    }
    if (typeof value !== "string") {
        return { ok: false };
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return { ok: false };
    }

    return { ok: true, value: parsed };
}

export function parseCreateLinkBody(body: unknown): CreateLinkPayload | null {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return null;
    }

    const raw = body as Record<string, unknown>;
    const validatedUrl = getValidatedUrl(raw.destinationUrl);
    if (!validatedUrl) {
        return null;
    }

    const parsedExpiresAt = parseExpiresAt(raw.expiresAt);
    if (!parsedExpiresAt.ok) {
        return null;
    }

    return {
        destinationUrl: validatedUrl,
        expiresAt: parsedExpiresAt.value,
    };
}

export function parseUpdateLinkBody(body: unknown): UpdateLinkPayload | null {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return null;
    }

    const raw = body as Record<string, unknown>;
    const patch: UpdateLinkPayload = {};

    if ("destinationUrl" in raw) {
        const validatedUrl = getValidatedUrl(raw.destinationUrl);
        if (!validatedUrl) {
            return null;
        }
        patch.destinationUrl = validatedUrl;
    }

    if ("expiresAt" in raw) {
        const parsedExpiresAt = parseExpiresAt(raw.expiresAt);
        if (!parsedExpiresAt.ok) {
            return null;
        }
        patch.expiresAt = parsedExpiresAt.value;
    }

    if (Object.keys(patch).length === 0) {
        return null;
    }

    return patch;
}

export function parseLinkId(value: unknown): string | null {
    if (typeof value !== "string" || !/^\d+$/.test(value)) {
        return null;
    }
    return value;
}

export function parseListLinksQuery(query: unknown): ListLinksFilter {
    const raw = (query ?? {}) as Record<string, unknown>;

    const rawLimit = Number(raw.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(Math.floor(rawLimit), MAX_LIST_LIMIT)
        : DEFAULT_LIST_LIMIT;

    const status = typeof raw.status === "string" && VALID_STATUSES.includes(raw.status as LinkStatus)
        ? (raw.status as LinkStatus)
        : null;

    const cursor = typeof raw.cursor === "string" && /^\d+$/.test(raw.cursor) ? raw.cursor : null;

    const q = typeof raw.q === "string" && raw.q.trim().length > 0 ? raw.q.trim() : null;

    const sortDir = raw.sort === "created_at:asc" ? "asc" : "desc";

    return { cursor, limit, status, q, sortDir };
}
