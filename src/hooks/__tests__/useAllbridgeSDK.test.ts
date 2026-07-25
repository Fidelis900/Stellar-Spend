import { renderHook, waitFor } from '@testing-library/react';
import { useAllbridgeSDK } from '../useAllbridgeSDK';

jest.mock('@allbridge/bridge-core-sdk', () => ({
  AllbridgeCoreSdk: jest.fn(function(config: any) {
    this.config = config;
    return this;
  }),
  nodeRpcUrlsDefault: {
    sorobanRpc: 'https://default-soroban.example.com',
  },
}));

describe('useAllbridgeSDK', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete (global as any).sdkPromise;
  });

  it('returns a promise that resolves to SDK instance', async () => {
    const { result } = renderHook(() => useAllbridgeSDK());

    expect(result.current).toBeInstanceOf(Promise);

    const sdk = await result.current;
    expect(sdk).toBeDefined();
  });

  it('caches SDK instance on subsequent calls', async () => {
    const { result: result1 } = renderHook(() => useAllbridgeSDK());
    const { result: result2 } = renderHook(() => useAllbridgeSDK());

    const sdk1 = await result1.current;
    const sdk2 = await result2.current;

    expect(sdk1).toBe(sdk2);
  });

  it('handles environment variables for custom RPC URLs', async () => {
    process.env.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL = 'https://custom-soroban.example.com';
    process.env.NEXT_PUBLIC_BASE_RPC_URL = 'https://custom-base.example.com';

    const { result } = renderHook(() => useAllbridgeSDK());
    const sdk = await result.current;

    expect(sdk.config.sorobanRpc).toBe('https://custom-soroban.example.com');
    expect(sdk.config.ETH).toBe('https://custom-base.example.com');

    delete process.env.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL;
    delete process.env.NEXT_PUBLIC_BASE_RPC_URL;
  });
});
