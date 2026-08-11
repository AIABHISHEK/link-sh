import { config } from "./config";
import { logger } from "./logger";

const DEV_TOKEN_PREFIX = "dev:";

export interface VerifiedIdentity {
    userId: string;
}

/**
 * Development-only token verification.
 *
 * A `dev:<userId>` token is accepted as proof of that identity, which is not
 * authentication at all — it exists so the gateway's middleware chain can be
 * wired and tested before a real identity provider is in place.
 *
 * Phase C replaces this with signature verification against the identity
 * provider's JWKS. Until then `assertVerifierUsable` prevents it ever running
 * in production.
 */
export function verifyToken(token: string): VerifiedIdentity | null {
    if (!token.startsWith(DEV_TOKEN_PREFIX)) {
        return null;
    }

    const userId = token.slice(DEV_TOKEN_PREFIX.length).trim();
    if (!userId) {
        return null;
    }

    return { userId };
}

export function assertVerifierUsable() {
    if (config.NODE_ENV === "production") {
        logger.fatal(
            "auth-service is still using the development token stub, which accepts any 'dev:<userId>' token as proof of identity; refusing to start with NODE_ENV=production"
        );
        process.exit(1);
    }

    logger.warn(
        "auth-service is using the development token stub: any 'dev:<userId>' bearer token will be accepted as that user"
    );
}
