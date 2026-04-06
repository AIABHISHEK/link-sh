import type { CreateLinkPayload } from "./types";
import { getValidatedUrl } from "../../shared/utils/url";

export function parseCreateLinkBody(body: unknown): CreateLinkPayload | null {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return null;
    }

    const { longUrl } = body as { longUrl?: unknown };
    const validatedUrl = getValidatedUrl(longUrl);
    if (!validatedUrl) {
        return null;
    }

    return {
        longUrl: validatedUrl,
    };
}
