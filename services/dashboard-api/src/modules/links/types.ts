import type { LinkStatus } from "@link-sh/shared-types";

export interface LinkRow {
    id: string;
    userId: string;
    shortCode: string;
    longUrl: string;
    createdAt: Date;
    expiresAt: Date | null;
    deletedAt: Date | null;
    clickCount: string;
}

export interface CreateLinkPayload {
    destinationUrl: string;
    expiresAt: Date | null;
}

export interface UpdateLinkPayload {
    destinationUrl?: string;
    expiresAt?: Date | null;
}

export interface ListLinksFilter {
    cursor: string | null;
    limit: number;
    status: LinkStatus | null;
    q: string | null;
    sortDir: "asc" | "desc";
}

export interface ListLinksResult {
    rows: LinkRow[];
    nextCursor: string | null;
}
