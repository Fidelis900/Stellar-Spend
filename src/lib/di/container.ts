/**
 * Dependency Injection Container
 * Lightweight DI framework for managing service dependencies with lifetime management
 */

export type ServiceFactory<T> = () => T | Promise<T>;
export type ServiceProvider<T> = T | ServiceFactory<T>;

export enum ServiceLifetime {
  SINGLETON = 'singleton',
  TRANSIENT = 'transient',
  SCOPED = 'scoped',
}

export interface ServiceRegistration<T> {
  provider: ServiceProvider<T>;
  lifetime: ServiceLifetime;
}

export interface DIContainerConfig {
  validateOnResolve?: boolean;
}

export class DIContainer {
  private services: Map<string | symbol, ServiceRegistration<any>> = new Map();
  private instances: Map<string | symbol, any> = new Map();
  private scopes: Map<string, Map<string | symbol, any>> = new Map();
  private config: DIContainerConfig;

  constructor(config: DIContainerConfig = { validateOnResolve: true }) {
    this.config = config;
  }

  /**
   * Register a transient service (new instance each time)
   */
  registerTransient<T>(key: string | symbol, provider: ServiceProvider<T>): void {
    this.services.set(key, { provider, lifetime: ServiceLifetime.TRANSIENT });
  }

  /**
   * Register a singleton service (single instance for app lifetime)
   */
  registerSingleton<T>(key: string | symbol, provider: ServiceProvider<T>): void {
    this.services.set(key, { provider, lifetime: ServiceLifetime.SINGLETON });
  }

  /**
   * Register a scoped service (single instance per scope)
   */
  registerScoped<T>(key: string | symbol, provider: ServiceProvider<T>): void {
    this.services.set(key, { provider, lifetime: ServiceLifetime.SCOPED });
  }

  /**
   * Resolve a service
   */
  async resolve<T>(key: string | symbol, scopeId?: string): Promise<T> {
    const registration = this.services.get(key);
    if (!registration) {
      throw new Error(`Service not registered: ${String(key)}`);
    }

    // Return cached singleton
    if (registration.lifetime === ServiceLifetime.SINGLETON && this.instances.has(key)) {
      return this.instances.get(key) as T;
    }

    // Return scoped instance
    if (registration.lifetime === ServiceLifetime.SCOPED && scopeId) {
      const scope = this.scopes.get(scopeId);
      if (scope?.has(key)) {
        return scope.get(key) as T;
      }
    }

    // Create new instance
    let instance: T;
    if (typeof registration.provider === 'function') {
      instance = await registration.provider();
    } else {
      instance = registration.provider as T;
    }

    // Cache based on lifetime
    if (registration.lifetime === ServiceLifetime.SINGLETON) {
      this.instances.set(key, instance);
    } else if (registration.lifetime === ServiceLifetime.SCOPED && scopeId) {
      if (!this.scopes.has(scopeId)) {
        this.scopes.set(scopeId, new Map());
      }
      this.scopes.get(scopeId)!.set(key, instance);
    }

    return instance;
  }

  /**
   * Resolve synchronously (for non-async factories)
   */
  resolveSync<T>(key: string | symbol, scopeId?: string): T {
    const registration = this.services.get(key);
    if (!registration) {
      throw new Error(`Service not registered: ${String(key)}`);
    }

    // Return cached singleton
    if (registration.lifetime === ServiceLifetime.SINGLETON && this.instances.has(key)) {
      return this.instances.get(key) as T;
    }

    // Return scoped instance
    if (registration.lifetime === ServiceLifetime.SCOPED && scopeId) {
      const scope = this.scopes.get(scopeId);
      if (scope?.has(key)) {
        return scope.get(key) as T;
      }
    }

    // Create new instance
    let instance: T;
    if (typeof registration.provider === 'function') {
      const result = (registration.provider as any)();
      if (result instanceof Promise) {
        throw new Error(`Cannot resolve async service synchronously: ${String(key)}`);
      }
      instance = result;
    } else {
      instance = registration.provider as T;
    }

    // Cache based on lifetime
    if (registration.lifetime === ServiceLifetime.SINGLETON) {
      this.instances.set(key, instance);
    } else if (registration.lifetime === ServiceLifetime.SCOPED && scopeId) {
      if (!this.scopes.has(scopeId)) {
        this.scopes.set(scopeId, new Map());
      }
      this.scopes.get(scopeId)!.set(key, instance);
    }

    return instance;
  }

  /**
   * Create a new scope
   */
  createScope(scopeId: string): void {
    if (this.scopes.has(scopeId)) {
      throw new Error(`Scope already exists: ${scopeId}`);
    }
    this.scopes.set(scopeId, new Map());
  }

  /**
   * Dispose a scope
   */
  disposeScope(scopeId: string): void {
    this.scopes.delete(scopeId);
  }

  /**
   * Register or override a singleton service, clearing any cached instance.
   * Useful for test mocks: container.registerOverride('key', mockObj).
   */
  registerOverride<T>(key: string | symbol, instance: T): void {
    this.instances.delete(key);
    this.services.set(key, { provider: instance, lifetime: ServiceLifetime.SINGLETON });
  }

  /**
   * Check if a service is registered
   */
  has(key: string | symbol): boolean {
    return this.services.has(key);
  }

  /**
   * Get all registered service keys
   */
  getRegisteredServices(): (string | symbol)[] {
    return Array.from(this.services.keys());
  }

  /**
   * Validate all registered services can be resolved
   */
  async validate(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    const keys = Array.from(this.services.keys());
    for (const key of keys) {
      try {
        await this.resolve(key);
      } catch (error) {
        errors.push(
          `Failed to resolve ${String(key)}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return { valid: errors.length === 0, errors };
  }

  /**
   * Clear all services and instances
   */
  clear(): void {
    this.services.clear();
    this.instances.clear();
    this.scopes.clear();
  }
}

// Global DI container instance
export const globalContainer = new DIContainer();
