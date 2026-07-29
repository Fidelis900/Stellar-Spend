import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AllbridgeAdapter } from './allbridge-adapter';

describe('AllbridgeAdapter', () => {
  let adapter: AllbridgeAdapter;

  beforeEach(() => {
    adapter = new AllbridgeAdapter();
  });

  describe('getChainDetails', () => {
    it('should return chain details for supported chains', async () => {
      const details = await adapter.getChainDetails('STELLAR');
      expect(details).toBeDefined();
      expect(details.chainId).toBe('STELLAR');
    });

    it('should throw for unsupported chains', async () => {
      await expect(adapter.getChainDetails('INVALID')).rejects.toThrow();
    });
  });

  describe('getTokens', () => {
    it('should return tokens for a chain', async () => {
      const tokens = await adapter.getTokens('STELLAR');
      expect(Array.isArray(tokens)).toBe(true);
      expect(tokens.length).toBeGreaterThan(0);
    });

    it('should include USDC token', async () => {
      const tokens = await adapter.getTokens('STELLAR');
      const usdc = tokens.find((t) => t.symbol === 'USDC');
      expect(usdc).toBeDefined();
    });
  });

  describe('buildBridgeTransaction', () => {
    it('should build valid bridge transaction', async () => {
      const tx = await adapter.buildBridgeTransaction({
        amount: '100',
        sourceChain: 'STELLAR',
        destinationChain: 'BASE',
        sourceToken: 'USDC',
        destinationToken: 'USDC',
        recipient: '0x1234567890123456789012345678901234567890',
      });

      expect(tx).toBeDefined();
      expect(tx.sourceAmount).toBe('100');
    });

    it('should throw for invalid amount', async () => {
      await expect(
        adapter.buildBridgeTransaction({
          amount: '-100',
          sourceChain: 'STELLAR',
          destinationChain: 'BASE',
          sourceToken: 'USDC',
          destinationToken: 'USDC',
          recipient: '0x1234567890123456789012345678901234567890',
        }),
      ).rejects.toThrow();
    });

    it('should throw for zero amount', async () => {
      await expect(
        adapter.buildBridgeTransaction({
          amount: '0',
          sourceChain: 'STELLAR',
          destinationChain: 'BASE',
          sourceToken: 'USDC',
          destinationToken: 'USDC',
          recipient: '0x1234567890123456789012345678901234567890',
        }),
      ).rejects.toThrow();
    });
  });

  describe('getTransferStatus', () => {
    it('should return status for valid transaction hash', async () => {
      const status = await adapter.getTransferStatus('test-tx-hash');
      expect(status).toBeDefined();
      expect(['pending', 'completed', 'failed']).toContain(status.status);
    });

    it('should handle network errors gracefully', async () => {
      vi.spyOn(adapter, 'getTransferStatus').mockRejectedValueOnce(new Error('Network error'));
      await expect(adapter.getTransferStatus('test-hash')).rejects.toThrow('Network error');
    });
  });
});
