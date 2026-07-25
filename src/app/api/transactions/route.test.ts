import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import * as dalModule from '@/lib/db/dal';

vi.mock('@/lib/db/dal');

describe('Transactions API Route', () => {
  let mockDal: any;

  beforeEach(() => {
    mockDal = dalModule.dal as any;
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('should return 400 when wallet parameter is missing', async () => {
      const request = new NextRequest(new URL('http://localhost:3000/api/transactions'));

      const response = await GET(request);

      expect(response.status).toBe(400);
    });

    it('should return transactions for valid wallet address', async () => {
      const mockTransactions = [
        {
          id: 'tx-1',
          timestamp: Date.now(),
          userAddress: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
          amount: '100',
          currency: 'USD',
          beneficiary: {
            institution: 'Bank',
            accountIdentifier: '1234567890',
            accountName: 'User',
            currency: 'USD',
          },
          status: 'completed',
        },
      ];

      mockDal.getByUser.mockResolvedValue(mockTransactions);

      const url = new URL('http://localhost:3000/api/transactions');
      url.searchParams.set('wallet', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
      const request = new NextRequest(url);

      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it('should handle database errors gracefully', async () => {
      mockDal.getByUser.mockRejectedValue(new Error('Database connection failed'));

      const url = new URL('http://localhost:3000/api/transactions');
      url.searchParams.set('wallet', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
      const request = new NextRequest(url);

      const response = await GET(request);

      expect(response.status).toBe(500);
    });
  });

  describe('POST', () => {
    it('should reject invalid JSON', async () => {
      const request = new NextRequest(new URL('http://localhost:3000/api/transactions'), {
        method: 'POST',
        body: 'invalid json {',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('should validate required fields', async () => {
      const incompleteTransaction = {
        id: 'tx-1',
        timestamp: Date.now(),
        userAddress: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        // Missing amount, currency, beneficiary, status
      };

      const request = new NextRequest(new URL('http://localhost:3000/api/transactions'), {
        method: 'POST',
        body: JSON.stringify(incompleteTransaction),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('should validate beneficiary structure', async () => {
      const transactionWithInvalidBeneficiary = {
        id: 'tx-1',
        timestamp: Date.now(),
        userAddress: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        amount: '100',
        currency: 'USD',
        beneficiary: { institution: 'Bank' }, // Missing required fields
        status: 'pending',
      };

      const request = new NextRequest(new URL('http://localhost:3000/api/transactions'), {
        method: 'POST',
        body: JSON.stringify(transactionWithInvalidBeneficiary),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('should create transaction successfully', async () => {
      const validTransaction = {
        id: 'tx-1',
        timestamp: Date.now(),
        userAddress: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        amount: '100.50',
        currency: 'USD',
        beneficiary: {
          institution: 'Bank A',
          accountIdentifier: '1234567890',
          accountName: 'John Doe',
          currency: 'USD',
        },
        status: 'pending',
      };

      mockDal.save.mockResolvedValue(undefined);

      const request = new NextRequest(new URL('http://localhost:3000/api/transactions'), {
        method: 'POST',
        body: JSON.stringify(validTransaction),
      });

      const response = await POST(request);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.id).toBe('tx-1');
    });

    it('should handle database save errors', async () => {
      mockDal.save.mockRejectedValue(new Error('Database save failed'));

      const validTransaction = {
        id: 'tx-1',
        timestamp: Date.now(),
        userAddress: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        amount: '100.50',
        currency: 'USD',
        beneficiary: {
          institution: 'Bank A',
          accountIdentifier: '1234567890',
          accountName: 'John Doe',
          currency: 'USD',
        },
        status: 'pending',
      };

      const request = new NextRequest(new URL('http://localhost:3000/api/transactions'), {
        method: 'POST',
        body: JSON.stringify(validTransaction),
      });

      const response = await POST(request);

      expect(response.status).toBe(500);
    });
  });
});
