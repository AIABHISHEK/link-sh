import type { FastifyInstance } from "fastify";
import "../modules/auth/types";
import { requireAuthenticatedUser } from "../modules/auth/middleware";
import analyticsRoutes from "../modules/analytics/routes";
import healthRoutes from "../modules/health/routes";
import linkRoutes from "../modules/links/routes";
import meRoutes from "../modules/me/routes";

export async function registerRoutes(app: FastifyInstance) {
    app.decorateRequest("authContext", null);

    await app.register(healthRoutes);

    await app.register(
        async (v1) => {
            v1.addHook("preHandler", requireAuthenticatedUser);
            await v1.register(meRoutes);
            await v1.register(linkRoutes);
            await v1.register(analyticsRoutes);
        },
        { prefix: "/v1" }
    );
}
