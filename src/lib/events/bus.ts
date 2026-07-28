import { Event, EventHandler, EventType, EventBusConfig } from './types';
import { logger } from '../logger';

class EventBus {
  private handlers: Map<EventType, EventHandler[]> = new Map();
  private config: Required<EventBusConfig>;

  constructor(config: EventBusConfig = {}) {
    this.config = {
      maxListeners: config.maxListeners ?? 10,
      logEvents: config.logEvents ?? true,
    };
  }

  on<T = any>(type: EventType, handler: EventHandler<T>): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    const listeners = this.handlers.get(type)!;
    if (listeners.length >= this.config.maxListeners) {
      logger.warn(
        `EventBus: Max listeners (${this.config.maxListeners}) reached for event type: ${type}`,
      );
    }
    listeners.push(handler);
  }

  off(type: EventType, handler: EventHandler): void {
    const listeners = this.handlers.get(type);
    if (!listeners) return;
    const index = listeners.indexOf(handler);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }

  async emit<T = any>(type: EventType, data: T): Promise<void> {
    const event: Event<T> = {
      type,
      data,
      timestamp: Date.now(),
      id: `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    if (this.config.logEvents) {
      logger.info(`EventBus: Emitting event`, { eventId: event.id, type });
    }

    const handlers = this.handlers.get(type) || [];
    const promises = handlers.map((handler) =>
      Promise.resolve()
        .then(() => handler(event))
        .catch((error) => {
          logger.error(`EventBus: Handler error for ${type}`, { error, eventId: event.id });
        }),
    );

    await Promise.all(promises);
  }

  once<T = any>(type: EventType, handler: EventHandler<T>): void {
    const wrapper: EventHandler<T> = async (event: Event<T>) => {
      await handler(event);
      this.off(type, wrapper);
    };
    this.on(type, wrapper);
  }

  removeAllListeners(type?: EventType): void {
    if (type) {
      this.handlers.delete(type);
    } else {
      this.handlers.clear();
    }
  }

  listenerCount(type: EventType): number {
    return this.handlers.get(type)?.length ?? 0;
  }
}

export const eventBus = new EventBus({ logEvents: true });
