import 'next/server';

declare module 'next/server' {
  interface NextRequest {
    /** Correlation ID set by request-logging middleware */
    requestId?: string;
  }
}
