import Fastify from "fastify";
import dotenv from "dotenv";
import { logger } from "./logger";
import createRoute from "./routes/create";
import redirectRoute from "./routes/redirect";
import healthRoute from "./health";

dotenv.config();

const app = Fastify({
    logger: {
        level: "info",
        transport: {
            target: "pino-pretty",
        },
    },
});


app.register(createRoute);
app.register(redirectRoute);
app.register(healthRoute);

app.listen({ port: Number(process.env.PORT), host: "0.0.0.0" })
    .then(() => {
        logger.info("Server started");
    })
    .catch(err => {
        logger.error(err);
        process.exit(1);
    });
