import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../../infrastructure/config";
import { logger } from "../../infrastructure/observability/logger";

const USER_ID_HEADER = "x-user-id";
const GATEWAY_SECRET_HEADER = "x-gateway-secret";

function headerValue(req: FastifyRequest, name: string): string | undefined {
    const raw = req.headers[name];
    return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * This service does not authenticate end users; it trusts the gateway's
 * `x-user-id` assertion. That is only safe if the caller really is the gateway,
 * so requests must also carry the shared secret.
 */
function isTrustedGatewayRequest(req: FastifyRequest): boolean {
    const expected = config.GATEWAY_SHARED_SECRET;

    // No secret configured means no gateway in front (local dev). Production
    // startup refuses this configuration outright, so it can only happen in dev.
    if (!expected) {
        return true;
    }

    const provided = headerValue(req, GATEWAY_SECRET_HEADER);
    if (!provided) {
        return false;
    }

    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(provided);

    // timingSafeEqual throws on length mismatch, and length is not secret.
    if (expectedBuffer.length !== providedBuffer.length) {
        return false;
    }

    return timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function requireAuthenticatedUser(req: FastifyRequest, reply: FastifyReply) {
    if (!isTrustedGatewayRequest(req)) {
        logger.warn(
            { path: req.url, ip: req.ip },
            "Rejected request that did not come from the gateway"
        );
        return reply.status(403).send({ error: "Forbidden" });
    }

    const userId = headerValue(req, USER_ID_HEADER)?.trim();

    if (!userId) {
        return reply.status(401).send({ error: "Missing or invalid x-user-id header" });
    }

    req.authContext = { userId };
}

/**
 * Fails fast rather than silently running with an open trust boundary: a
 * production deployment that forgets the shared secret would otherwise let any
 * client that can reach this service assert any user id.
 */
export function assertGatewayTrustConfigured() {
    if (config.NODE_ENV === "production" && !config.GATEWAY_SHARED_SECRET) {
        logger.fatal(
            "GATEWAY_SHARED_SECRET is required when NODE_ENV=production; refusing to start without a gateway trust boundary"
        );
        process.exit(1);
    }

    if (!config.GATEWAY_SHARED_SECRET) {
        logger.warn(
            "GATEWAY_SHARED_SECRET is not set: gateway provenance checks are disabled and any caller that can reach this service may assert any x-user-id"
        );
    }
}
