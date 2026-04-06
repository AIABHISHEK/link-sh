import { pool } from "../../infrastructure/db/pool";
import { generateShortCode } from "./id-generator";
import type { CreatedLinkRecord } from "./types";

const CREATE_LINK_MAX_ATTEMPTS = 3;
const UNIQUE_VIOLATION = "23505";

export async function insertLink(longUrl: string): Promise<CreatedLinkRecord> {
    for (let attempt = 1; attempt <= CREATE_LINK_MAX_ATTEMPTS; attempt++) {
        const shortCode = generateShortCode();

        try {
            await pool.query(
                "INSERT INTO links (short_code, long_url) VALUES ($1, $2)",
                [shortCode, longUrl]
            );

            return { shortCode, longUrl };
        } catch (err) {
            if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
                continue;
            }

            throw err;
        }
    }

    throw new Error("Exceeded maximum retries while generating a unique short code");
}
