import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import {
    BatchLogRecordProcessor,
} from "@opentelemetry/sdk-logs";

const traceExporter = new OTLPTraceExporter({
    url: "http://localhost:4318/v1/traces",
});

const metricExporter = new OTLPMetricExporter({
    url: "http://localhost:4318/v1/metrics",
});

const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "redirect-service",
});

// --------------------
// Log Exporter
// --------------------

const logExporter = new OTLPLogExporter({
    url: "http://localhost:4318/v1/logs",
});


export const sdk = new NodeSDK({
    resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: "redirect-service",
    }),
    instrumentations: [
        getNodeAutoInstrumentations(),
    ],
    spanProcessor: new BatchSpanProcessor(traceExporter),
    metricReader: new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 5000,
    }),
    logRecordProcessor: new BatchLogRecordProcessor(logExporter),
});
