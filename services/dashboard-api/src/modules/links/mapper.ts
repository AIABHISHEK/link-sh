import type { DashboardLink, LinkStatus } from "@link-sh/shared-types";
import { config } from "../../infrastructure/config";
import type { LinkRow } from "./types";

export function computeLinkStatus(row: Pick<LinkRow, "deletedAt" | "expiresAt">): LinkStatus {
    if (row.deletedAt) {
        return "deleted";
    }
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
        return "expired";
    }
    return "active";
}

export function toLinkResponse(row: LinkRow): DashboardLink {
    return {
        id: row.id,
        shortCode: row.shortCode,
        shortUrl: `${config.BASE_URL}/${row.shortCode}`,
        destinationUrl: row.longUrl,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
        status: computeLinkStatus(row),
    };
}
