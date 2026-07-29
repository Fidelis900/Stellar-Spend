/**
 * Timeout utilities for external service calls
 */

/**
 * Custom error class for timeout scenarios
 */
export class TimeoutError extends Error {
  constructor(
    public serviceName: string,
    public duration: number,
    public operation?: string,
  ) {
    super(`${serviceName} timeout after ${duration / 1000}s${operation ? ` (${operation})` : ''}`);
    this.name = 'TimeoutError';
  }
}

/**
 * Configuration for timeout behavior
 */
export interface TimeoutConfig {
  duration: number;
  serviceName: string;
  operation?: string;
}

/**
 * Result of a timeout-wrapped operation
 */
export interface TimeoutResult<T> {
  success: boolean;
  data?: T;
  error?: TimeoutError;
  duration: number;
}

/**
 * Timeout configuration constants for each service type
 */
export const TIMEOUT_CONFIG = {
  ALLBRIDGE_SDK: {
    duration: 30000, // 30 seconds
    serviceName: 'Bridge service',
  },
  PAYCREST_API: {
    duration: 15000, // 15 seconds
    serviceName: 'Payment service',
  },
  SOROBAN_RPC: {
    duration: 15000, // 15 seconds
    serviceName: 'Blockchain service',
  },
} as const;

/**
 * Timeout error response format
 */
export interface TimeoutErrorResponse {
  error: string;
  message: string;
  service: string;
  duration: number;
  timestamp: string;
}

/**
 * Logging data model for timeout events
 */
export interface TimeoutLogEntry {
  timestamp: string;
  service: string;
  operation?: string;
  duration: number;
  status: 'success' | 'timeout' | 'near_timeout';
  requestId?: string;
  error?: string;
}

/**
 * Promise that can be aborted
 */
export interface AbortablePromise<T> extends Promise<T> {
  abort(): void;
}

/**
 * Creates an abortable promise with timeout functionality
 */
export function createAbortablePromise<T>(
  executor: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  serviceName: string,
  operation?: string,
): AbortablePromise<T> {
  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout;
  let startTime = Date.now();

  const promise = new Promise<T>((resolve, reject) => {
    // Set up timeout
    timeoutId = setTimeout(() => {
      controller.abort();
      const duration = Date.now() - startTime;
      const error = new TimeoutError(serviceName, timeoutMs, operation);

      // Log timeout event
      logTimeoutEvent({
        timestamp: new Date().toISOString(),
        service: serviceName,
        operation,
        duration,
        status: 'timeout',
        error: error.message,
      });

      reject(error);
    }, timeoutMs);

    // Execute the operation
    executor(controller.signal)
      .then((result) => {
        const duration = Date.now() - startTime;

        // Log successful completion
        logTimeoutEvent({
          timestamp: new Date().toISOString(),
          service: serviceName,
          operation,
          duration,
          status: duration > timeoutMs * 0.8 ? 'near_timeout' : 'success',
        });

        resolve(result);
      })
      .catch((error) => {
        const duration = Date.now() - startTime;

        // Only log if it's not a timeout (timeout already logged above)
        if (error.name !== 'TimeoutError') {
          logTimeoutEvent({
            timestamp: new Date().toISOString(),
            service: serviceName,
            operation,
            duration,
            status: 'success', // Operation completed, even with error
            error: error.message,
          });
        }

        reject(error);
      })
      .finally(() => {
        clearTimeout(timeoutId);
      });
  }) as AbortablePromise<T>;

  // Add abort method
  promise.abort = () => {
    clearTimeout(timeoutId);
    controller.abort();
  };

  return promise;
}

/**
 * Logs timeout events for monitoring
 */
function logTimeoutEvent(entry: TimeoutLogEntry): void {
  const logLevel =
    entry.status === 'timeout' ? 'error' : entry.status === 'near_timeout' ? 'warn' : 'info';

  console[logLevel]('Timeout event:', entry);
}

/**
 * Generic timeout wrapper for any promise.
 * Accepts either a TimeoutConfig object or (durationMs, operationName) shorthand.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  configOrDuration: TimeoutConfig | number,
  operation?: string,
): Promise<T> {
  const config: TimeoutConfig =
    typeof configOrDuration === 'number'
      ? { duration: configOrDuration, serviceName: operation ?? 'Operation', operation }
      : configOrDuration;

  return createAbortablePromise(
    async (_signal) => promise,
    config.duration,
    config.serviceName,
    config.operation,
  );
}

/**
 * Service-specific timeout wrappers
 */

/**
 * Wraps Allbridge SDK operations with 30-second timeout
 */
export async function withAllbridgeTimeout<T>(promise: Promise<T>, operation?: string): Promise<T> {
  return createAbortablePromise(
    async (signal) => {
      // For promises that don't natively support AbortSignal,
      // we race the promise with the timeout
      return promise;
    },
    TIMEOUT_CONFIG.ALLBRIDGE_SDK.duration,
    TIMEOUT_CONFIG.ALLBRIDGE_SDK.serviceName,
    operation,
  );
}

/**
 * Wraps Paycrest API calls with 15-second timeout
 */
export async function withPaycrestTimeout<T>(promise: Promise<T>, operation?: string): Promise<T> {
  return createAbortablePromise(
    async (signal) => {
      return promise;
    },
    TIMEOUT_CONFIG.PAYCREST_API.duration,
    TIMEOUT_CONFIG.PAYCREST_API.serviceName,
    operation,
  );
}

/**
 * Wraps Soroban RPC calls with 15-second timeout
 */
export async function withSorobanTimeout<T>(promise: Promise<T>, operation?: string): Promise<T> {
  return createAbortablePromise(
    async (signal) => {
      return promise;
    },
    TIMEOUT_CONFIG.SOROBAN_RPC.duration,
    TIMEOUT_CONFIG.SOROBAN_RPC.serviceName,
    operation,
  );
}

/**
 * Enhanced fetch wrapper with AbortSignal support for HTTP requests
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number; serviceName?: string; operation?: string } = {},
): Promise<Response> {
  const { timeout = 15000, serviceName = 'External service', operation, ...fetchOptions } = options;

  return createAbortablePromise(
    async (signal) => {
      return fetch(url, {
        ...fetchOptions,
        signal,
      });
    },
    timeout,
    serviceName,
    operation,
  );
}
