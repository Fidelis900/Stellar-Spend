export interface PollOptions {
  interval?: number;
  timeout?: number;
  onProgress?: (attempt: number) => void;
}

export async function pollWithTimeout<T>(
  pollFn: () => Promise<T>,
  checkCondition: (result: T) => boolean,
  options: PollOptions = {},
): Promise<T> {
  const { interval = 5000, timeout = 300000, onProgress } = options;
  const startTime = Date.now();
  let attempt = 0;

  while (Date.now() - startTime < timeout) {
    attempt++;
    onProgress?.(attempt);
    const result = await pollFn();
    if (checkCondition(result)) return result;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Polling timeout exceeded');
}

export async function pollBridgeStatus(
  getStatus: () => Promise<{ status: string }>,
  terminalStates: string[],
  options: PollOptions = {},
): Promise<{ status: string }> {
  return pollWithTimeout(getStatus, (r) => terminalStates.includes(r.status), {
    interval: 5000,
    timeout: 600000,
    ...options,
  });
}

export async function pollPayoutStatus(
  getStatus: () => Promise<{ status: string }>,
  terminalStates: string[],
  options: PollOptions = {},
): Promise<{ status: string }> {
  return pollWithTimeout(getStatus, (r) => terminalStates.includes(r.status), {
    interval: 10000,
    timeout: 600000,
    ...options,
  });
}
