import type { FastifyInstance, FastifyReply } from "fastify";
import {
    getAnalyticsCountries,
    getAnalyticsDevices,
    getAnalyticsOverview,
    getAnalyticsTimeseries,
    InvalidAnalyticsQueryError,
    InvalidLinkIdError,
    LinkNotFoundError,
} from "./service";

function handleAnalyticsError(err: unknown, reply: FastifyReply) {
    if (err instanceof InvalidLinkIdError || err instanceof InvalidAnalyticsQueryError) {
        return reply.status(400).send({ error: err.message });
    }
    if (err instanceof LinkNotFoundError) {
        return reply.status(404).send({ error: err.message });
    }

    return reply.status(500).send({ error: "Internal server error" });
}

export default async function (app: FastifyInstance) {
    app.get("/links/:linkId/analytics", async (req, reply) => {
        try {
            const { linkId } = req.params as { linkId: string };
            const response = await getAnalyticsOverview(req.authContext!.userId, linkId, req.query);
            return reply.send(response);
        } catch (err) {
            return handleAnalyticsError(err, reply);
        }
    });

    app.get("/links/:linkId/analytics/timeseries", async (req, reply) => {
        try {
            const { linkId } = req.params as { linkId: string };
            const response = await getAnalyticsTimeseries(req.authContext!.userId, linkId, req.query);
            return reply.send(response);
        } catch (err) {
            return handleAnalyticsError(err, reply);
        }
    });

    app.get("/links/:linkId/analytics/countries", async (req, reply) => {
        try {
            const { linkId } = req.params as { linkId: string };
            const response = await getAnalyticsCountries(req.authContext!.userId, linkId, req.query);
            return reply.send(response);
        } catch (err) {
            return handleAnalyticsError(err, reply);
        }
    });

    app.get("/links/:linkId/analytics/devices", async (req, reply) => {
        try {
            const { linkId } = req.params as { linkId: string };
            const response = await getAnalyticsDevices(req.authContext!.userId, linkId, req.query);
            return reply.send(response);
        } catch (err) {
            return handleAnalyticsError(err, reply);
        }
    });
}
