import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PriceAlertStorage, PriceAlert } from './price-alerts';

describe('PriceAlertStorage', () => {
  beforeEach(() => {
    PriceAlertStorage.clearAll();
    vi.clearAllMocks();
  });

  it('should create a price alert', () => {
    const alert = PriceAlertStorage.createAlert({
      currency: 'NGN',
      targetPrice: 1500,
      alertType: 'above',
      status: 'active',
      triggeredCount: 0,
      recurring: false,
      userAddress: 'test-address',
    });

    expect(alert.id).toBeDefined();
    expect(alert.currency).toBe('NGN');
    expect(PriceAlertStorage.getAllAlerts().length).toBe(1);
  });

  it('should trigger an "above" alert when price crosses threshold', () => {
    const alert = PriceAlertStorage.createAlert({
      currency: 'NGN',
      targetPrice: 1500,
      alertType: 'above',
      status: 'active',
      triggeredCount: 0,
      recurring: false,
    });

    const triggered = PriceAlertStorage.checkAlerts({ NGN: 1550 });
    expect(triggered.length).toBe(1);
    expect(triggered[0].id).toBe(alert.id);

    const updated = PriceAlertStorage.getAlert(alert.id);
    expect(updated?.status).toBe('triggered');
    expect(updated?.triggeredCount).toBe(1);
    expect(updated?.triggerHistory.length).toBe(1);
  });

  it('should trigger a "below" alert when price crosses threshold', () => {
    const alert = PriceAlertStorage.createAlert({
      currency: 'KES',
      targetPrice: 130,
      alertType: 'below',
      status: 'active',
      triggeredCount: 0,
      recurring: false,
    });

    const triggered = PriceAlertStorage.checkAlerts({ KES: 125 });
    expect(triggered.length).toBe(1);
    expect(triggered[0].id).toBe(alert.id);
  });

  it('should not trigger if threshold is not met', () => {
    PriceAlertStorage.createAlert({
      currency: 'NGN',
      targetPrice: 1500,
      alertType: 'above',
      status: 'active',
      triggeredCount: 0,
      recurring: false,
    });

    const triggered = PriceAlertStorage.checkAlerts({ NGN: 1450 });
    expect(triggered.length).toBe(0);
  });

  it('should re-arm recurring alerts', () => {
    const alert = PriceAlertStorage.createAlert({
      currency: 'NGN',
      targetPrice: 1500,
      alertType: 'above',
      status: 'active',
      triggeredCount: 0,
      recurring: true,
    });

    PriceAlertStorage.checkAlerts({ NGN: 1550 });

    const updated = PriceAlertStorage.getAlert(alert.id);
    expect(updated?.status).toBe('active');
    expect(updated?.triggeredCount).toBe(1);
  });
});
