import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import pino from "pino";
import { otlpBaseEndpointFromEnv } from "@link-sh/shared-config";

export function createServiceLogger(serviceName: string, level: string) {
    return pino({
        level,
        base: {
            service: serviceName,
        },
        timestamp: pino.stdTimeFunctions.isoTime,
    });
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
        metricReader: new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter({
                url: `${otlpBaseEndpoint}/v1/metrics`,
            }),
            exportIntervalMillis: 5000,
        }),
    });
}
