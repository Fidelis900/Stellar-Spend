import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStellarBalances } from '../useStellarBalances';

const mockFetch = vi.fn();
const USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

function makeHorizonResponse(xlm: string, usdc: string) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        balances: [
          { asset_type: 'native', balance: xlm },
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'USDC',
            asset_issuer: USDC_ISSUER,
            balance: usdc,
          },
        ],
      }),
  };
}

describe('useStellarBalances', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('should return nulls when no publicKey is provided', () => {
    const { result } = renderHook(() => useStellarBalances(undefined));
    expect(result.current.usdc).toBeNull();
    expect(result.current.xlm).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('should set isLoading while fetching', () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useStellarBalances('GCFX...1234'));
    expect(result.current.isLoading).toBe(true);
  });

  it('should populate usdc and xlm after a successful fetch', async () => {
    mockFetch.mockResolvedValueOnce(makeHorizonResponse('50.1234567', '200.500000'));

    const { result } = renderHook(() => useStellarBalances('GCFX...1234'));

    await act(async () => { await vi.runAllTicks(); });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.xlm).not.toBeNull();
    expect(result.current.usdc).not.toBeNull();
  });

  it('should return "0.00" values when the fetch fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useStellarBalances('GCFX...1234'));

    await act(async () => { await vi.runAllTicks(); });

    expect(result.current.usdc).toBe('0.00');
    expect(result.current.xlm).toBe('0.00');
  });

  it('should return "0.00" when horizon returns a non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });

    const { result } = renderHook(() => useStellarBalances('GCFX...1234'));

    await act(async () => { await vi.runAllTicks(); });

    expect(result.current.usdc).toBe('0.00');
    expect(result.current.xlm).toBe('0.00');
  });

  it('should reset to null when publicKey is removed', async () => {
    mockFetch.mockResolvedValue(makeHorizonResponse('50.00', '100.00'));

    const { result, rerender } = renderHook(
      ({ pk }: { pk: string | undefined }) => useStellarBalances(pk),
      { initialProps: { pk: 'GCFX...1234' as string | undefined } },
    );

    await act(async () => { await vi.runAllTicks(); });
    expect(result.current.xlm).not.toBeNull();

    rerender({ pk: undefined });
    expect(result.current.usdc).toBeNull();
    expect(result.current.xlm).toBeNull();
  });

  it('should re-fetch when refresh() is called', async () => {
    mockFetch.mockResolvedValue(makeHorizonResponse('10.00', '50.00'));

    const { result } = renderHook(() => useStellarBalances('GCFX...1234'));

    await act(async () => { await vi.runAllTicks(); });
    const callsBefore = mockFetch.mock.calls.length;

    await act(async () => { await result.current.refresh(); });

    expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});
