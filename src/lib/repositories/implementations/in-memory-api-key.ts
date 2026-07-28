import type { ApiKeyRepository, ApiKey } from '../api-key';

export class InMemoryApiKeyRepository implements ApiKeyRepository {
  private apiKeys: Map<string, ApiKey> = new Map();

  async save(apiKey: ApiKey): Promise<void> {
    this.apiKeys.set(apiKey.id, apiKey);
  }

  async update(id: string, updates: Partial<ApiKey>): Promise<void> {
    const apiKey = this.apiKeys.get(id);
    if (!apiKey) throw new Error(`ApiKey ${id} not found`);
    this.apiKeys.set(id, { ...apiKey, ...updates });
  }

  async getById(id: string): Promise<ApiKey | null> {
    return this.apiKeys.get(id) ?? null;
  }

  async delete(id: string): Promise<void> {
    this.apiKeys.delete(id);
  }

  async getAll(): Promise<ApiKey[]> {
    return Array.from(this.apiKeys.values());
  }

  async getByKey(key: string): Promise<ApiKey | null> {
    for (const apiKey of this.apiKeys.values()) {
      if (apiKey.key === key) return apiKey;
    }
    return null;
  }

  async getByUserId(userId: string): Promise<ApiKey[]> {
    return Array.from(this.apiKeys.values()).filter((k) => k.userId === userId);
  }

  async getActiveByUserId(userId: string): Promise<ApiKey[]> {
    return Array.from(this.apiKeys.values()).filter(
      (k) => k.userId === userId && k.isActive && (!k.expiresAt || k.expiresAt > Date.now()),
    );
  }
}
