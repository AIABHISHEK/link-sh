import type { FastifyInstance } from "fastify";
import { checkServiceHealth } from "./service";

export default async function (app: FastifyInstance) {
    app.get("/health", async (_, reply) => {
        try {
            await checkServiceHealth();
            return reply.send({ status: "ok" });
        } catch {
            return reply.status(503).send({
                status: "error",
                error: "Internal server error",
            });
        }
    });
}
