import { str } from "envalid";

export function nodeEnvValidator() {
    return str({
        choices: ["development", "production", "test"],
        default: "development",
    });
}

export function logLevelValidator() {
    return str({
        choices: ["error", "warn", "info", "debug"],
        default: "info",
    });
}

export function otlpBaseEndpointFromEnv() {
    return process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";
}
