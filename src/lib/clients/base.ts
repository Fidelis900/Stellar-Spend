export interface ClientConfig {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export interface RetryOptions {
  maxRetries: number;
  delayMs: number;
  backoffMultiplier: number;
}

export class ClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ClientError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  let lastError: Error | undefined;
  let delay = options.delayMs;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < options.maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= options.backoffMultiplier;
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}
