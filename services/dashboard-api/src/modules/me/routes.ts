import type { FastifyInstance } from "fastify";

export default async function (app: FastifyInstance) {
    app.get("/me", async (req) => {
        return req.authContext;
    });
}
