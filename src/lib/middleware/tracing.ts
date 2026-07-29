/**
 * Express middleware for OpenTelemetry tracing
 * Automatically creates spans for each request
 */

import { Request, Response, NextFunction } from 'express';
import { trace, context, propagation, SpanStatusCode } from '@opentelemetry/api';

/**
 * Middleware to add tracing to Express requests
 */
export function tracingMiddleware(req: Request, res: Response, next: NextFunction) {
  // Get the current tracer
  const tracer = trace.getTracer('stellar-spend-http');

  // Extract trace context from incoming request
  const headers: Record<string, string> = {};
  Object.entries(req.headers).forEach(([key, value]) => {
    if (value) {
      headers[key] = Array.isArray(value) ? value[0] : value;
    }
  });

  const extractedContext = propagation.extract(propagation.activeContext(), headers);

  // Start a new span for this request
  const span = tracer.startSpan(
    `${req.method} ${req.route?.path || req.path}`,
    {
      kind: 1, // SERVER
      attributes: {
        'http.method': req.method,
        'http.url': req.url,
        'http.path': req.path,
        'http.route': req.route?.path || req.path,
        'http.user_agent': req.headers['user-agent'],
        'http.client_ip': req.ip || req.connection.remoteAddress,
      },
    },
    extractedContext,
  );

  // Set span as active in context
  const ctx = trace.setSpan(extractedContext, span);

  // Add trace headers to response
  res.setHeader('X-Trace-Id', span.spanContext().traceId);
  res.setHeader('X-Span-Id', span.spanContext().spanId);

  // Handle request completion
  const originalEnd = res.end;
  res.end = function (chunk?: any, encoding?: any, callback?: any) {
    // Add response attributes
    span.setAttribute('http.status_code', res.statusCode);

    // Set span status based on response
    if (res.statusCode >= 400) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: `HTTP ${res.statusCode}`,
      });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }

    // End the span
    span.end();

    // Call original end
    return originalEnd.call(this, chunk, encoding, callback);
  };

  // Handle errors
  res.on('error', (error) => {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    span.recordException(error);
    span.end();
  });

  // Run the next middleware in the span context
  context.with(ctx, () => {
    next();
  });
}

/**
 * Middleware to add tracing to outbound HTTP calls
 */
export function traceOutboundRequest(url: string, options: any) {
  const tracer = trace.getTracer('stellar-spend-outbound');
  const span = tracer.startSpan(`HTTP ${options.method || 'GET'} ${url}`);

  // Inject trace context into request headers
  const ctx = trace.setSpan(propagation.activeContext(), span);
  const headers = propagation.inject(ctx);

  // Merge headers with options
  options.headers = {
    ...options.headers,
    ...headers,
  };

  // Track request completion
  const originalCallback = options.callback;
  options.callback = (response: any) => {
    span.setAttribute('http.status_code', response.statusCode);
    if (response.statusCode >= 400) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: `HTTP ${response.statusCode}`,
      });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }
    span.end();

    if (originalCallback) {
      originalCallback(response);
    }
  };

  return { options, span, ctx };
}
