import { describe, it, expect } from 'vitest';
import { mapPaycrestStatus } from '@/lib/offramp';

describe('mapPaycrestStatus', () => {
  it('maps payment_order.pending to pending', () => {
    expect(mapPaycrestStatus('payment_order.pending')).toBe('pending');
  });

  it('maps payment_order.validated to validated', () => {
    expect(mapPaycrestStatus('payment_order.validated')).toBe('validated');
  });

  it('maps payment_order.settled to settled', () => {
    expect(mapPaycrestStatus('payment_order.settled')).toBe('settled');
  });

  it('maps payment_order.refunded to refunded', () => {
    expect(mapPaycrestStatus('payment_order.refunded')).toBe('refunded');
  });

  it('maps payment_order.expired to expired', () => {
    expect(mapPaycrestStatus('payment_order.expired')).toBe('expired');
  });

  it('maps unknown event type to null', () => {
    expect(mapPaycrestStatus('unknown.event')).toBeNull();
  });
});
