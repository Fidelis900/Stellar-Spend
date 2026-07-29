# Distributed Tracing with OpenTelemetry

## Overview

Stellar-Spend uses OpenTelemetry for distributed tracing across all services, enabling end-to-end visibility of request flows.

## Architecture

import { propagation, context } from '@opentelemetry/api';

// Extract context from headers
const headers = req.headers;
const extractedContext = propagation.extract(context.active(), headers);

// Inject context into outbound request
const headers = {};
propagation.inject(context.active(), headers);
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('stellar-spend');

// Create custom span
const span = tracer.startSpan('process_payment');
try {
// Do work
span.setAttribute('payment.amount', amount);
span.setStatus({ code: 0 }); // OK
} catch (error) {
span.setStatus({ code: 1, message: error.message }); // ERROR
span.recordException(error);
} finally {
span.end();
}
import { trace } from '@opentelemetry/api';

const span = trace.getActiveSpan();
const traceId = span?.spanContext().traceId;

logger.info('Payment processed', {
traceId,
spanId: span?.spanContext().spanId,
paymentId: payment.id,
});
{
"timestamp": "2024-01-01T00:00:00.000Z",
"level": "info",
"message": "Payment processed",
"traceId": "a1b2c3d4e5f6",
"spanId": "g7h8i9j0k1l2",
"paymentId": "pay_123"
}
import Sentry from '@sentry/node';
import { trace } from '@opentelemetry/api';

const span = trace.getActiveSpan();
Sentry.setTag('traceId', span?.spanContext().traceId);
Sentry.setTag('spanId', span?.spanContext().spanId);

# Start Jaeger locally

docker run -d --name jaeger \
 -p 16686:16686 \
 -p 4318:4318 \
 jaegertracing/all-in-one:latest

# Run application with tracing

OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces \
 npm run dev

# View traces at http://localhost:16686

// Test trace propagation
const headers = {
'traceparent': '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01'
};

const response = await fetch('http://localhost:3000/api/test', { headers });
expect(response.headers.get('x-trace-id')).toBeDefined();
// Dynamic sampling based on endpoint
if (req.path.startsWith('/admin')) {
sampleRate = 1.0; // Always trace admin
} else if (req.path.startsWith('/health')) {
sampleRate = 0.0; // Never trace health checks
} else {
sampleRate = 0.1; // Sample 10% of production traffic
}
