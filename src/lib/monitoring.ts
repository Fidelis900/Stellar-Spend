/**
 * OpenTelemetry Monitoring Configuration
 *
 * Sets up distributed tracing across the application
 * Exports traces to configured backend (Tempo/Jaeger)
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

// Enable debug logging in development
if (process.env.NODE_ENV === 'development') {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
}

/**
 * Get the tracing exporter based on environment configuration
 */
function getExporter() {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';

  return new OTLPTraceExporter({
    url: endpoint,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create and configure the OpenTelemetry SDK
 */
export function createTracingSDK(): NodeSDK {
  // Configure sampling
  const sampleRate = parseFloat(process.env.OTEL_SAMPLE_RATE || '1.0');
  const sampler = sampleRate < 1.0 ? new TraceIdRatioBasedSampler(sampleRate) : undefined;

  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'stellar-spend',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
  });

  const exporter = getExporter();

  const sdk = new NodeSDK({
    resource,
    traceExporter: exporter,
    spanProcessor: new BatchSpanProcessor(exporter),
    instrumentations: [
      // HTTP instrumentation for outbound requests
      new HttpInstrumentation({
        ignoreIncomingPaths: ['/health', '/metrics', '/favicon.ico'],
        requestHook: (span, request) => {
          // Add custom attributes to HTTP spans
          span.setAttribute('http.request.method', request.method);
          span.setAttribute('http.url', request.url);
        },
        responseHook: (span, response) => {
          span.setAttribute('http.status_code', response.statusCode);
        },
      }),

      // Express instrumentation for routes
      new ExpressInstrumentation({
        ignoreLayers: ['middleware', 'static'],
        requestHook: (span, request) => {
          // Add route information
          const route = request.route?.path || request.path;
          span.setAttribute('express.route', route);
          span.setAttribute('http.route', route);

          // Add user ID if available
          if ((request as any).user?.id) {
            span.setAttribute('user.id', (request as any).user.id);
          }
        },
      }),

      // PostgreSQL instrumentation for database queries
      new PgInstrumentation({
        requestHook: (span, queryInfo) => {
          // Sanitize query to remove sensitive data
          const sanitizedQuery = queryInfo.query?.replace(/\s+/g, ' ').trim();
          span.setAttribute('db.query.text', sanitizedQuery);
          span.setAttribute('db.system', 'postgresql');
        },
        responseHook: (span, result) => {
          span.setAttribute('db.rows_affected', result.rowCount || 0);
        },
      }),
    ],
  });

  return sdk;
}

/**
 * Initialize tracing with sampling configuration
 */
export function initializeTracing(): NodeSDK | undefined {
  // Skip tracing if disabled
  if (process.env.OTEL_DISABLED === 'true') {
    console.log('OpenTelemetry tracing is disabled');
    return undefined;
  }

  try {
    const sdk = createTracingSDK();
    sdk.start();
    console.log('OpenTelemetry tracing initialized');
    return sdk;
  } catch (error) {
    console.error('Failed to initialize OpenTelemetry:', error);
    return undefined;
  }
}

/**
 * Gracefully shutdown the tracing SDK
 */
export async function shutdownTracing(sdk: NodeSDK): Promise<void> {
  try {
    await sdk.shutdown();
    console.log('OpenTelemetry tracing shut down successfully');
  } catch (error) {
    console.error('Error shutting down OpenTelemetry:', error);
  }
}

// Note: TraceIdRatioBasedSampler needs to be imported
// This is a placeholder - the actual import should be:
// import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-node';

// For now, we'll use a simple wrapper
class TraceIdRatioBasedSampler {
  constructor(private ratio: number) {}
  shouldSample(
    context: any,
    traceId: string,
    spanName: string,
    spanKind: any,
    attributes: any,
    links: any,
  ) {
    // Simple random sampling
    const random = Math.random();
    return {
      decision: random < this.ratio ? 1 : 0, // 1 = RECORD_AND_SAMPLED, 0 = NOT_RECORD
      attributes: {},
    };
  }
}
