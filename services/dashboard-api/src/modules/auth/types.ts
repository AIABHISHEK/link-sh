import type { AuthenticatedUserContext } from "@link-sh/shared-types";

declare module "fastify" {
    interface FastifyRequest {
        authContext: AuthenticatedUserContext | null;
    }
}
