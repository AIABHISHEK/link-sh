import pino from "pino";
import { config } from "./config";

export const logger = pino({
    level: config.LOG_LEVEL,
    base: {
        service: "redirect-service",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
});

/*
Previous in-process OTEL emit implementation (for reference):

import { logs, SeverityNumber } from "@opentelemetry/api-logs";

const otelLogger = logs.getLogger("redirect-service");

function mapSeverity(level: number): SeverityNumber {
    if (level >= 60) return SeverityNumber.FATAL;
    if (level >= 50) return SeverityNumber.ERROR;
    if (level >= 40) return SeverityNumber.WARN;
    if (level >= 30) return SeverityNumber.INFO;
    if (level >= 20) return SeverityNumber.DEBUG;
    return SeverityNumber.TRACE;
}

function safeStringify(value: unknown): string {
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function extractAttributes(value: unknown): Record<string, any> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const record = value as Record<string, unknown>;
    const attributes: Record<string, any> = {};
    for (const [key, val] of Object.entries(record)) {
        if (val instanceof Error) {
            attributes[`${key}.name`] = val.name;
            attributes[`${key}.message`] = val.message;
            attributes[`${key}.stack`] = val.stack;
            continue;
        }
        if (
            val === null ||
            typeof val === "string" ||
            typeof val === "number" ||
            typeof val === "boolean"
        ) {
            attributes[key] = val;
            continue;
        }
        attributes[key] = safeStringify(val);
    }
    return attributes;
}

export const logger = pino({
    level: config.LOG_LEVEL,
    base: {
        service: "redirect-service",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    hooks: {
        logMethod(args, method, level) {
            const first = args[0];
            const second = args[1];
            const body =
                typeof second === "string"
                    ? second
                    : typeof first === "string"
                        ? first
                        : "application log";

            otelLogger.emit({
                severityNumber: mapSeverity(level),
                severityText: typeof level === "number" ? String(level) : undefined,
                body,
                attributes: extractAttributes(first),
            });

            return (method as (...a: any[]) => unknown).apply(this, args as any[]);
        },
    },
});
*/
