import type { FastifyInstance } from "fastify";
import {
    createLink,
    deleteLink,
    getLink,
    InvalidCreateLinkPayloadError,
    InvalidLinkIdError,
    InvalidUpdateLinkPayloadError,
    LinkDeletedConflictError,
    LinkNotFoundError,
    listLinks,
    updateLink,
} from "./service";

export default async function (app: FastifyInstance) {
    app.post("/links", async (req, reply) => {
        try {
            const response = await createLink(req.authContext!.userId, req.body);
            return reply.status(201).send(response);
        } catch (err) {
            if (err instanceof InvalidCreateLinkPayloadError) {
                return reply.status(400).send({ error: err.message });
            }

            return reply.status(500).send({ error: "Internal server error" });
        }
    });

    app.get("/links", async (req, reply) => {
        try {
            const response = await listLinks(req.authContext!.userId, req.query);
            return reply.send(response);
        } catch {
            return reply.status(500).send({ error: "Internal server error" });
        }
    });

    app.get("/links/:linkId", async (req, reply) => {
        try {
            const { linkId } = req.params as { linkId: string };
            const response = await getLink(req.authContext!.userId, linkId);
            return reply.send(response);
        } catch (err) {
            if (err instanceof InvalidLinkIdError) {
                return reply.status(400).send({ error: err.message });
            }
            if (err instanceof LinkNotFoundError) {
                return reply.status(404).send({ error: err.message });
            }

            return reply.status(500).send({ error: "Internal server error" });
        }
    });

    app.patch("/links/:linkId", async (req, reply) => {
        try {
            const { linkId } = req.params as { linkId: string };
            const response = await updateLink(req.authContext!.userId, linkId, req.body);
            return reply.send(response);
        } catch (err) {
            if (err instanceof InvalidLinkIdError || err instanceof InvalidUpdateLinkPayloadError) {
                return reply.status(400).send({ error: err.message });
            }
            if (err instanceof LinkNotFoundError) {
                return reply.status(404).send({ error: err.message });
            }
            if (err instanceof LinkDeletedConflictError) {
                return reply.status(409).send({ error: err.message });
            }

            return reply.status(500).send({ error: "Internal server error" });
        }
    });

    app.delete("/links/:linkId", async (req, reply) => {
        try {
            const { linkId } = req.params as { linkId: string };
            await deleteLink(req.authContext!.userId, linkId);
            return reply.status(204).send();
        } catch (err) {
            if (err instanceof InvalidLinkIdError) {
                return reply.status(400).send({ error: err.message });
            }
            if (err instanceof LinkNotFoundError) {
                return reply.status(404).send({ error: err.message });
            }

            return reply.status(500).send({ error: "Internal server error" });
        }
    });
}
