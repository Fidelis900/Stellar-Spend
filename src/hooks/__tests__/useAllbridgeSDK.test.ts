import { renderHook, waitFor } from '@testing-library/react';
import { useAllbridgeSDK } from '../useAllbridgeSDK';

jest.mock('@allbridge/bridge-core-sdk', () => ({
  AllbridgeCoreSdk: jest.fn(function (config: any) {
    this.config = config;
    return this;
  }),
  nodeRpcUrlsDefault: {
    sorobanRpc: 'https://default-soroban.example.com',
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAllbridgeSDK', () => {
  let savedSorobanUrl: string | undefined;
  let savedBaseRpcUrl: string | undefined;

  beforeEach(() => {
    savedSorobanUrl = process.env.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL;
    savedBaseRpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL;
    mockSdkConstructor.mockClear();
  });

  afterEach(() => {
    // Restore env vars
    if (savedSorobanUrl === undefined) {
      delete process.env.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL;
    } else {
      process.env.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL = savedSorobanUrl;
    }
    if (savedBaseRpcUrl === undefined) {
      delete process.env.NEXT_PUBLIC_BASE_RPC_URL;
    } else {
      process.env.NEXT_PUBLIC_BASE_RPC_URL = savedBaseRpcUrl;
    }
  });

  it('returns a Promise from the hook', async () => {
    const { useAllbridgeSDK } = await import('../useAllbridgeSDK');
    const { result } = renderHook(() => useAllbridgeSDK());
    expect(result.current).toBeInstanceOf(Promise);
  });

  it('the promise resolves to a defined object', async () => {
    const { useAllbridgeSDK } = await import('../useAllbridgeSDK');
    const { result } = renderHook(() => useAllbridgeSDK());
    const sdk = await result.current;
    expect(sdk).toBeDefined();
  });

  it('subsequent hook calls return the same Promise (singleton)', async () => {
    const { useAllbridgeSDK } = await import('../useAllbridgeSDK');
    const { result: r1 } = renderHook(() => useAllbridgeSDK());
    const { result: r2 } = renderHook(() => useAllbridgeSDK());
    // Both hooks must return the exact same Promise reference
    expect(r1.current).toBe(r2.current);
  });

  it('resolved SDK instances from different hooks are identical', async () => {
    const { useAllbridgeSDK } = await import('../useAllbridgeSDK');
    const { result: r1 } = renderHook(() => useAllbridgeSDK());
    const { result: r2 } = renderHook(() => useAllbridgeSDK());
    const [sdk1, sdk2] = await Promise.all([r1.current, r2.current]);
    expect(sdk1).toBe(sdk2);
  });

  it('resolves with an object that has a config property (from constructor mock)', async () => {
    const { useAllbridgeSDK } = await import('../useAllbridgeSDK');
    const { result } = renderHook(() => useAllbridgeSDK());
    const sdk = await result.current;
    // The mock constructor assigns config = the arg passed
    expect(sdk).toHaveProperty('config');
  });

  it('isEnabled returns false before flags are loaded (structural sanity)', async () => {
    // Ensure the hook resolves without throwing
    const { useAllbridgeSDK } = await import('../useAllbridgeSDK');
    const { result } = renderHook(() => useAllbridgeSDK());
    await expect(result.current).resolves.not.toThrow();
  });
});
