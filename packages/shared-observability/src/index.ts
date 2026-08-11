import { context, trace } from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import pino from "pino";
import { otlpBaseEndpointFromEnv } from "@link-sh/shared-config";

const PINO_LEVEL_TO_SEVERITY: Record<
    number,
    { number: SeverityNumber; text: string }
> = {
    10: { number: SeverityNumber.TRACE, text: "TRACE" },
    20: { number: SeverityNumber.DEBUG, text: "DEBUG" },
    30: { number: SeverityNumber.INFO, text: "INFO" },
    40: { number: SeverityNumber.WARN, text: "WARN" },
    50: { number: SeverityNumber.ERROR, text: "ERROR" },
    60: { number: SeverityNumber.FATAL, text: "FATAL" },
};

/**
 * Puts the active span's ids on every log line so stdout output stays
 * greppable by trace. The OTLP path carries real trace context separately.
 */
function traceContextMixin() {
    const activeSpan = trace.getActiveSpan();
    if (!activeSpan) {
        return {};
    }

    const { traceId, spanId, traceFlags } = activeSpan.spanContext();
    return {
        trace_id: traceId,
        span_id: spanId,
        trace_flags: traceFlags.toString(16).padStart(2, "0"),
    };
}

/**
 * A pino destination that forwards each record to the OpenTelemetry Logs API,
 * which the NodeSDK exports over OTLP. Runs on the main thread so the record is
 * emitted inside the active context, giving exact trace correlation.
 */
function createOtelLogStream(serviceName: string) {
    return {
        write(line: string) {
            try {
                const {
                    level,
                    time,
                    msg,
                    // Carried by the OTLP resource and log record instead.
                    service: _service,
                    trace_id: _traceId,
                    span_id: _spanId,
                    trace_flags: _traceFlags,
                    ...attributes
                } = JSON.parse(line);

                const severity = PINO_LEVEL_TO_SEVERITY[level] ?? {
                    number: SeverityNumber.UNSPECIFIED,
                    text: String(level),
                };

                logs.getLogger(serviceName).emit({
                    body: msg,
                    severityNumber: severity.number,
                    severityText: severity.text,
                    timestamp: typeof time === "string" ? Date.parse(time) : time,
                    observedTimestamp: Date.now(),
                    attributes,
                    context: context.active(),
                });
            } catch {
                // Telemetry must never take the process down.
            }
        },
    };
}

export function createServiceLogger(serviceName: string, level: string) {
    const streams: pino.StreamEntry[] = [
        { level: level as pino.Level, stream: process.stdout },
        { level: level as pino.Level, stream: createOtelLogStream(serviceName) },
    ];

    return pino(
        {
            level,
            base: {
                service: serviceName,
            },
            timestamp: pino.stdTimeFunctions.isoTime,
            mixin: traceContextMixin,
        },
        pino.multistream(streams)
    );
}

export function createNodeSdk(serviceName: string) {
    const otlpBaseEndpoint = otlpBaseEndpointFromEnv();

    return new NodeSDK({
        resource: resourceFromAttributes({
            [ATTR_SERVICE_NAME]: serviceName,
        }),
        instrumentations: [
            getNodeAutoInstrumentations({
                "@opentelemetry/instrumentation-pino": {
                    enabled: false,
                    disableLogSending: true,
                    disableLogCorrelation: false,
                },
            }),
        ],
        spanProcessor: new BatchSpanProcessor(
            new OTLPTraceExporter({
                url: `${otlpBaseEndpoint}/v1/traces`,
            })
        ),
        logRecordProcessors: [
            new BatchLogRecordProcessor(
                new OTLPLogExporter({
                    url: `${otlpBaseEndpoint}/v1/logs`,
                })
            ),
        ],
        metricReader: new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter({
                url: `${otlpBaseEndpoint}/v1/metrics`,
            }),
            exportIntervalMillis: 5000,
        }),
    });
}
