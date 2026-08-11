import { pool } from "../../infrastructure/db/pool";
import { generateShortCode } from "./id-generator";
import type { LinkRow, ListLinksFilter, ListLinksResult, UpdateLinkPayload } from "./types";

const CREATE_LINK_MAX_ATTEMPTS = 3;
const UNIQUE_VIOLATION = "23505";

const LINK_COLUMNS = `
    id,
    user_id AS "userId",
    short_code AS "shortCode",
    long_url AS "longUrl",
    created_at AS "createdAt",
    expires_at AS "expiresAt",
    deleted_at AS "deletedAt",
    click_count AS "clickCount"
`;

export async function insertLink(
    userId: string,
    destinationUrl: string,
    expiresAt: Date | null
): Promise<LinkRow> {
    for (let attempt = 1; attempt <= CREATE_LINK_MAX_ATTEMPTS; attempt++) {
        const shortCode = generateShortCode();

        try {
            const result = await pool.query(
                `
                INSERT INTO links (user_id, short_code, long_url, expires_at)
                VALUES ($1, $2, $3, $4)
                RETURNING ${LINK_COLUMNS}
                `,
                [userId, shortCode, destinationUrl, expiresAt]
            );

            return result.rows[0] as LinkRow;
        } catch (err) {
            if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
                continue;
            }

            throw err;
        }
    }

    throw new Error("Exceeded maximum retries while generating a unique short code");
}

export async function selectLinkByIdAndUser(userId: string, linkId: string): Promise<LinkRow | null> {
    const result = await pool.query(
        `SELECT ${LINK_COLUMNS} FROM links WHERE id = $1 AND user_id = $2`,
        [linkId, userId]
    );

    return (result.rows[0] as LinkRow | undefined) ?? null;
}

export async function selectLinksByUser(
    userId: string,
    filter: ListLinksFilter
): Promise<ListLinksResult> {
    const conditions = ["user_id = $1"];
    const params: unknown[] = [userId];

    if (filter.status === "deleted") {
        conditions.push("deleted_at IS NOT NULL");
    } else if (filter.status === "expired") {
        conditions.push("deleted_at IS NULL", "expires_at IS NOT NULL", "expires_at <= now()");
    } else if (filter.status === "active") {
        conditions.push("deleted_at IS NULL", "(expires_at IS NULL OR expires_at > now())");
    } else {
        conditions.push("deleted_at IS NULL");
    }

    if (filter.q) {
        params.push(`%${filter.q}%`);
        conditions.push(`(short_code ILIKE $${params.length} OR long_url ILIKE $${params.length})`);
    }

    if (filter.cursor) {
        params.push(filter.cursor);
        conditions.push(filter.sortDir === "asc" ? `id > $${params.length}` : `id < $${params.length}`);
    }

    params.push(filter.limit + 1);

    const result = await pool.query(
        `
        SELECT ${LINK_COLUMNS}
        FROM links
        WHERE ${conditions.join(" AND ")}
        ORDER BY id ${filter.sortDir === "asc" ? "ASC" : "DESC"}
        LIMIT $${params.length}
        `,
        params
    );

    const rows = result.rows as LinkRow[];
    const hasMore = rows.length > filter.limit;
    const page = hasMore ? rows.slice(0, filter.limit) : rows;
    const lastRow = page[page.length - 1];

    return {
        rows: page,
        nextCursor: hasMore && lastRow ? lastRow.id : null,
    };
}

export async function updateLinkByIdAndUser(
    userId: string,
    linkId: string,
    patch: UpdateLinkPayload
): Promise<LinkRow | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (patch.destinationUrl !== undefined) {
        params.push(patch.destinationUrl);
        setClauses.push(`long_url = $${params.length}`);
    }

    if (patch.expiresAt !== undefined) {
        params.push(patch.expiresAt);
        setClauses.push(`expires_at = $${params.length}`);
    }

    if (setClauses.length === 0) {
        return selectLinkByIdAndUser(userId, linkId);
    }

    params.push(linkId, userId);

    const result = await pool.query(
        `
        UPDATE links
        SET ${setClauses.join(", ")}
        WHERE id = $${params.length - 1} AND user_id = $${params.length} AND deleted_at IS NULL
        RETURNING ${LINK_COLUMNS}
        `,
        params
    );

    return (result.rows[0] as LinkRow | undefined) ?? null;
}

export async function softDeleteLinkByIdAndUser(userId: string, linkId: string): Promise<LinkRow | null> {
    const result = await pool.query(
        `
        UPDATE links
        SET deleted_at = now()
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
        RETURNING ${LINK_COLUMNS}
        `,
        [linkId, userId]
    );

    if (result.rowCount && result.rowCount > 0) {
        return result.rows[0] as LinkRow;
    }

    return selectLinkByIdAndUser(userId, linkId);
}
