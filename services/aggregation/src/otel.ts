import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

const otlpBaseEndpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";

const traceExporter = new OTLPTraceExporter({
    url: `${otlpBaseEndpoint}/v1/traces`,
});

const metricExporter = new OTLPMetricExporter({
    url: `${otlpBaseEndpoint}/v1/metrics`,
});

const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "aggregation-service",
});

export const sdk = new NodeSDK({
    resource,
    instrumentations: [
        getNodeAutoInstrumentations({
            "@opentelemetry/instrumentation-pino": {
                enabled: false,
                disableLogSending: true,
                disableLogCorrelation: false,
            },
        }),
    ],
    spanProcessor: new BatchSpanProcessor(traceExporter),
    metricReader: new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 5000,
    }),
});
