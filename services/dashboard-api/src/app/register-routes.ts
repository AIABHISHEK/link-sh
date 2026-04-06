import type { FastifyInstance } from "fastify";
import healthRoutes from "../modules/health/routes";
import linkRoutes from "../modules/links/routes";

export async function registerRoutes(app: FastifyInstance) {
    await app.register(healthRoutes);
    await app.register(linkRoutes);
}
