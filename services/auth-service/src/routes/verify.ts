import type { FastifyInstance } from "fastify";
import { logger } from "../logger";
import { verifyToken } from "../token-verifier";

const BEARER_PREFIX = "Bearer ";

/**
 * Called by the gateway's ForwardAuth middleware for every authenticated route.
 * A 2xx response authorises the request, and the gateway copies `x-user-id`
 * from this response onto the upstream request. Anything else rejects it.
 */
export default async function (app: FastifyInstance) {
    app.all("/verify", async (req, reply) => {
        const authorization = req.headers.authorization;

        if (!authorization?.startsWith(BEARER_PREFIX)) {
            return reply.status(401).send({ error: "Missing bearer token" });
        }

        const identity = verifyToken(authorization.slice(BEARER_PREFIX.length).trim());

        if (!identity) {
            // The gateway sends the original path via X-Forwarded-Uri.
            logger.warn(
                { forwardedUri: req.headers["x-forwarded-uri"] },
                "Rejected request with an invalid token"
            );
            return reply.status(401).send({ error: "Invalid token" });
        }

        return reply.header("x-user-id", identity.userId).status(204).send();
    });
}
