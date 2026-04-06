import type { FastifyInstance } from "fastify";
import { createLink, InvalidCreateLinkPayloadError } from "./service";

export default async function (app: FastifyInstance) {
    app.post("/links", async (req, reply) => {
        try {
            const response = await createLink(req.body);
            return reply.status(201).send(response);
        } catch (err) {
            if (err instanceof InvalidCreateLinkPayloadError) {
                return reply.status(400).send({ error: err.message });
            }

            return reply.status(500).send({ error: "Internal server error" });
        }
    });
}
