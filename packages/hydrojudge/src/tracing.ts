import { OTLPTraceExporter as OTLPTraceExporterHttp } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK, resources, tracing } from '@opentelemetry/sdk-node';
import { Logger } from './log';

const logger = new Logger('tracing');

export function initTracing(endpoint: string, samplePercentage = 1.0) {
    const traceExporter = new OTLPTraceExporterHttp({
        url: endpoint.includes('/v1/traces') ? endpoint : `${endpoint}/v1/traces`,
    });
    const sdk = new NodeSDK({
        resource: resources.resourceFromAttributes({
            'service.name': 'hydrojudge',
            'service.version': require('../package.json').version,
        }),
        traceExporter,
        sampler: new tracing.TraceIdRatioBasedSampler(samplePercentage),
        instrumentations: [],
    });
    sdk.start();
    const originalExport = traceExporter.export;
    if (originalExport && process.env.HYDROJUDGE_DEBUG_TRACING) {
        // eslint-disable-next-line consistent-return
        traceExporter.export = function wrappedExport(spans: any, resultCallback: any) {
            const spanCount = spans?.length || 0;
            logger.info('[Tracing] Exporting %d span(s) to Tempo...', spanCount);
            const wrappedCallback = (result: any) => {
                if (result.code === 0) {
                    logger.info('[Tracing] Successfully exported %d span(s) - result code: %d', spanCount, result.code);
                } else {
                    logger.error('[Tracing] Export failed: %o', {
                        code: result.code,
                        error: result.error,
                        details: result,
                    });
                }
                resultCallback?.(result);
            };
            try {
                return originalExport.call(this, spans, wrappedCallback);
            } catch (error) {
                logger.error('[Tracing] Export exception: %o', error);
                resultCallback?.({ code: 1, error });
            }
        };
    }
    return sdk;
}
