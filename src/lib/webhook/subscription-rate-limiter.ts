import { getCacheClient } from '../cache/client';

export class SubscriptionRateLimiter {
  private readonly cache = getCacheClient();

  async check(
    subscriptionId: string,
    maxPerMinute: number,
  ): Promise<{ allowed: boolean; remaining: number }> {
    const key = `webhook:ratelimit:${subscriptionId}`;
    const windowMs = 60_000;

    const current = await this.cache.get(key);
    const count = current ? Number(current) : 0;

    if (count >= maxPerMinute) {
      return { allowed: false, remaining: 0 };
    }

    const newCount = count + 1;
    await this.cache.set(key, String(newCount), 60);
    return { allowed: true, remaining: maxPerMinute - newCount };
  }

  async reset(subscriptionId: string): Promise<void> {
    const key = `webhook:ratelimit:${subscriptionId}`;
    await this.cache.del(key);
  }
}

export const subscriptionRateLimiter = new SubscriptionRateLimiter();
