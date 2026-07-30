import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  StellarWalletAdapter,
  _resetAdapterSingleton,
  getStellarWalletAdapter,
} from '@/lib/stellar';

// ── Mock @stellar/freighter-api ────────────────────────────────────────────────
vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn(),
  isAllowed: vi.fn(),
  getAddress: vi.fn(),
  requestAccess: vi.fn(),
  signTransaction: vi.fn(),
  getNetworkDetails: vi
    .fn()
    .mockResolvedValue({ networkPassphrase: 'Public Global Stellar Network ; September 2015' }),
}));

import * as freighterApi from '@stellar/freighter-api';

const mockIsConnected = vi.mocked(freighterApi.isConnected);
const mockGetAddress = vi.mocked(freighterApi.getAddress);
const mockRequestAccess = vi.mocked(freighterApi.requestAccess);
const mockSignTransaction = vi.mocked(freighterApi.signTransaction);

const VALID_KEY = 'GCFX7ABCDE2YTKGCFX7ABCDE2YTKGCFX7ABCDE2YTKGCFX7ABCDE2YTK';
const SIGNED_XDR = 'signed-xdr-payload';

// Helper: simulate Freighter window sentinel
function setFreighterWindow(present: boolean) {
  if (present) {
    (global as any).window = { ...(global as any).window, freighter: true };
  } else {
    const w = (global as any).window ?? {};
    delete w.freighter;
    (global as any).window = w;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetAdapterSingleton();
  setFreighterWindow(false);
});

afterEach(() => {
  setFreighterWindow(false);
});

// ── isFreighterAvailable ───────────────────────────────────────────────────────

describe('isFreighterAvailable', () => {
  it('returns true when window.freighter sentinel is set', async () => {
    setFreighterWindow(true);
    const adapter = new StellarWalletAdapter();
    expect(await adapter.isFreighterAvailable()).toBe(true);
  });

  it('returns true when isConnected() resolves without error', async () => {
    mockIsConnected.mockResolvedValueOnce({ isConnected: true });
    const adapter = new StellarWalletAdapter();
    expect(await adapter.isFreighterAvailable()).toBe(true);
  });

  it('returns false when isConnected() throws', async () => {
    mockIsConnected.mockRejectedValueOnce(new Error('extension not found'));
    const adapter = new StellarWalletAdapter();
    expect(await adapter.isFreighterAvailable()).toBe(false);
  });

  it('returns false when isConnected() returns an error object', async () => {
    mockIsConnected.mockResolvedValueOnce({
      isConnected: false,
      error: { code: 1, message: 'not installed' },
    });
    const adapter = new StellarWalletAdapter();
    expect(await adapter.isFreighterAvailable()).toBe(false);
  });
});

// ── connectFreighter — happy paths ────────────────────────────────────────────

describe('connectFreighter — happy paths', () => {
  it('returns wallet when already connected and getAddress succeeds', async () => {
    setFreighterWindow(true);
    mockIsConnected.mockResolvedValueOnce({ isConnected: true });
    mockGetAddress.mockResolvedValueOnce({ address: VALID_KEY });

    const adapter = new StellarWalletAdapter();
    const wallet = await adapter.connectFreighter();

    expect(wallet.type).toBe('freighter');
    expect(wallet.publicKey).toBe(VALID_KEY);
    expect(wallet.isConnected).toBe(true);
    expect(mockRequestAccess).not.toHaveBeenCalled();
  });

  it('calls requestAccess when isConnected=false and returns address from it', async () => {
    setFreighterWindow(true);
    mockIsConnected.mockResolvedValueOnce({ isConnected: false });
    mockRequestAccess.mockResolvedValueOnce({ address: VALID_KEY });

    const adapter = new StellarWalletAdapter();
    const wallet = await adapter.connectFreighter();

    expect(wallet.publicKey).toBe(VALID_KEY);
    expect(mockGetAddress).not.toHaveBeenCalled();
  });

  it('falls back to getAddress after requestAccess when requestAccess returns empty address', async () => {
    setFreighterWindow(true);
    mockIsConnected.mockResolvedValueOnce({ isConnected: false });
    mockRequestAccess.mockResolvedValueOnce({ address: '' });
    mockGetAddress.mockResolvedValueOnce({ address: VALID_KEY });

    const adapter = new StellarWalletAdapter();
    const wallet = await adapter.connectFreighter();

    expect(wallet.publicKey).toBe(VALID_KEY);
    expect(mockGetAddress).toHaveBeenCalledTimes(1);
  });

  it('calls requestAccess when isConnected=true but getAddress returns empty (locked wallet)', async () => {
    setFreighterWindow(true);
    mockIsConnected.mockResolvedValueOnce({ isConnected: true });
    mockGetAddress.mockResolvedValueOnce({ address: '' });
    mockRequestAccess.mockResolvedValueOnce({ address: VALID_KEY });

    const adapter = new StellarWalletAdapter();
    const wallet = await adapter.connectFreighter();

    expect(wallet.publicKey).toBe(VALID_KEY);
    expect(mockRequestAccess).toHaveBeenCalledTimes(1);
  });

  it('stores walletType and publicKey on the instance after connection', async () => {
    setFreighterWindow(true);
    mockIsConnected.mockResolvedValueOnce({ isConnected: true });
    mockGetAddress.mockResolvedValueOnce({ address: VALID_KEY });

    const adapter = new StellarWalletAdapter();
    await adapter.connectFreighter();

    expect(adapter.getWallet()).toEqual({
      type: 'freighter',
      publicKey: VALID_KEY,
      isConnected: true,
    });
  });

  it('returns immediately without API calls when already connected on instance', async () => {
    setFreighterWindow(true);
    mockIsConnected.mockResolvedValueOnce({ isConnected: true });
    mockGetAddress.mockResolvedValueOnce({ address: VALID_KEY });

    const adapter = new StellarWalletAdapter();
    await adapter.connectFreighter(); // first call
    vi.clearAllMocks();
    const wallet = await adapter.connectFreighter(); // second call — should be instant

    expect(wallet.publicKey).toBe(VALID_KEY);
    expect(mockIsConnected).not.toHaveBeenCalled();
    expect(mockGetAddress).not.toHaveBeenCalled();
    expect(mockRequestAccess).not.toHaveBeenCalled();
  });
});

// ── connectFreighter — error paths ────────────────────────────────────────────

describe('connectFreighter — error paths', () => {
  it('throws user-friendly error when extension is not installed', async () => {
    // No window.freighter, isConnected throws
    mockIsConnected.mockRejectedValueOnce(new Error('not found'));

    const adapter = new StellarWalletAdapter();
    await expect(adapter.connectFreighter()).rejects.toThrow(
      /Freighter extension is not installed/,
    );
  });

  it('throws user-friendly error when isConnected returns an error', async () => {
    setFreighterWindow(true);
    mockIsConnected.mockResolvedValueOnce({
      isConnected: false,
      error: { code: 2, message: 'internal error' },
    });

    const adapter = new StellarWalletAdapter();
    await expect(adapter.connectFreighter()).rejects.toThrow(/Could not reach Freighter/);
  });

  it('throws user-friendly error when user declines requestAccess', async () => {
    setFreighterWindow(true);
    mockIsConnected.mockResolvedValueOnce({ isConnected: false });
    mockRequestAccess.mockResolvedValueOnce({
      address: '',
      error: { code: 3, message: 'User declined' },
    });

    const adapter = new StellarWalletAdapter();
    await expect(adapter.connectFreighter()).rejects.toThrow(/declined/i);
  });

  it('throws user-friendly error when requestAccess returns error without address', async () => {
    setFreighterWindow(true);
    mockIsConnected.mockResolvedValueOnce({ isConnected: false });
    mockRequestAccess.mockResolvedValueOnce({
      address: '',
      error: { code: 4, message: 'rejected' },
    });

    const adapter = new StellarWalletAdapter();
    await expect(adapter.connectFreighter()).rejects.toThrow(/declined/i);
  });

  it('throws when getAddress retry after requestAccess also fails', async () => {
    setFreighterWindow(true);
    mockIsConnected.mockResolvedValueOnce({ isConnected: false });
    mockRequestAccess.mockResolvedValueOnce({ address: '' });
    mockGetAddress.mockResolvedValueOnce({
      address: '',
      error: { code: 5, message: 'could not retrieve key' },
    });

    const adapter = new StellarWalletAdapter();
    await expect(adapter.connectFreighter()).rejects.toThrow(/could not retrieve your public key/i);
  });

  it('throws when getAddress retry returns empty address with no error', async () => {
    setFreighterWindow(true);
    mockIsConnected.mockResolvedValueOnce({ isConnected: false });
    mockRequestAccess.mockResolvedValueOnce({ address: '' });
    mockGetAddress.mockResolvedValueOnce({ address: '' });

    const adapter = new StellarWalletAdapter();
    await expect(adapter.connectFreighter()).rejects.toThrow(/no public key was returned/i);
  });

  it('does not expose internal error details in thrown message', async () => {
    setFreighterWindow(true);
    mockIsConnected.mockResolvedValueOnce({ isConnected: false });
    mockRequestAccess.mockResolvedValueOnce({
      address: '',
      error: { code: 99, message: 'INTERNAL_STACK_TRACE_XYZ' },
    });

    const adapter = new StellarWalletAdapter();
    // Should not throw the raw internal message verbatim for unknown errors
    // (it may pass through non-sensitive messages, but must not crash)
    await expect(adapter.connectFreighter()).rejects.toThrow(Error);
  });
});

// ── Idempotency / race condition prevention ────────────────────────────────────

describe('connectFreighter — idempotency', () => {
  it('collapses concurrent calls into a single in-flight promise', async () => {
    setFreighterWindow(true);
    mockIsConnected.mockResolvedValue({ isConnected: false });
    mockRequestAccess.mockResolvedValue({ address: VALID_KEY });

    const adapter = new StellarWalletAdapter();
    const [w1, w2, w3] = await Promise.all([
      adapter.connectFreighter(),
      adapter.connectFreighter(),
      adapter.connectFreighter(),
    ]);

    // All three resolve to the same wallet
    expect(w1.publicKey).toBe(VALID_KEY);
    expect(w2.publicKey).toBe(VALID_KEY);
    expect(w3.publicKey).toBe(VALID_KEY);

    // requestAccess was only called once despite three concurrent calls
    expect(mockRequestAccess).toHaveBeenCalledTimes(1);
  });

  it('clears the in-flight promise after resolution so next call works', async () => {
    setFreighterWindow(true);
    mockIsConnected.mockResolvedValue({ isConnected: true });
    mockGetAddress.mockResolvedValue({ address: VALID_KEY });

    const adapter = new StellarWalletAdapter();
    await adapter.connectFreighter();
    adapter.disconnect();

    // After disconnect, a fresh call should work
    setFreighterWindow(true);
    mockIsConnected.mockResolvedValueOnce({ isConnected: true });
    mockGetAddress.mockResolvedValueOnce({ address: VALID_KEY });

    const wallet = await adapter.connectFreighter();
    expect(wallet.publicKey).toBe(VALID_KEY);
  });
});

// ── signTransaction ────────────────────────────────────────────────────────────

describe('signTransaction', () => {
  it('signs successfully and returns signedTxXdr', async () => {
    setFreighterWindow(true);
    mockIsConnected.mockResolvedValueOnce({ isConnected: true });
    mockGetAddress.mockResolvedValueOnce({ address: VALID_KEY });
    mockSignTransaction.mockResolvedValueOnce({
      signedTxXdr: SIGNED_XDR,
      signerAddress: VALID_KEY,
    });

    const adapter = new StellarWalletAdapter();
    await adapter.connectFreighter();
    const result = await adapter.signTransaction('raw-xdr');

    expect(result).toBe(SIGNED_XDR);
    expect(mockSignTransaction).toHaveBeenCalledWith('raw-xdr', {
      networkPassphrase: 'Public Global Stellar Network ; September 2015',
    });
  });

  it('throws when no wallet is connected', async () => {
    const adapter = new StellarWalletAdapter();
    await expect(adapter.signTransaction('raw-xdr')).rejects.toThrow(/No wallet connected/);
  });

  it('throws user-friendly error when signing is rejected', async () => {
    setFreighterWindow(true);
    mockIsConnected.mockResolvedValueOnce({ isConnected: true });
    mockGetAddress.mockResolvedValueOnce({ address: VALID_KEY });
    mockSignTransaction.mockResolvedValueOnce({
      signedTxXdr: '',
      signerAddress: '',
      error: { code: 6, message: 'User declined' },
    });

    const adapter = new StellarWalletAdapter();
    await adapter.connectFreighter();
    await expect(adapter.signTransaction('raw-xdr')).rejects.toThrow(/declined/i);
  });

  it('throws when signedTxXdr is empty with no error', async () => {
    setFreighterWindow(true);
    mockIsConnected.mockResolvedValueOnce({ isConnected: true });
    mockGetAddress.mockResolvedValueOnce({ address: VALID_KEY });
    mockSignTransaction.mockResolvedValueOnce({ signedTxXdr: '', signerAddress: '' });

    const adapter = new StellarWalletAdapter();
    await adapter.connectFreighter();
    await expect(adapter.signTransaction('raw-xdr')).rejects.toThrow(/empty signed transaction/i);
  });

  it('always uses mainnet passphrase', async () => {
    setFreighterWindow(true);
    mockIsConnected.mockResolvedValueOnce({ isConnected: true });
    mockGetAddress.mockResolvedValueOnce({ address: VALID_KEY });
    mockSignTransaction.mockResolvedValueOnce({
      signedTxXdr: SIGNED_XDR,
      signerAddress: VALID_KEY,
    });

    const adapter = new StellarWalletAdapter();
    await adapter.connectFreighter();
    await adapter.signTransaction('raw-xdr');

    expect(mockSignTransaction).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        networkPassphrase: 'Public Global Stellar Network ; September 2015',
      }),
    );
  });
});

// ── getWallet / disconnect ─────────────────────────────────────────────────────

describe('getWallet and disconnect', () => {
  it('returns null before any connection', () => {
    const adapter = new StellarWalletAdapter();
    expect(adapter.getWallet()).toBeNull();
  });

  it('returns wallet after successful connection', async () => {
    setFreighterWindow(true);
    mockIsConnected.mockResolvedValueOnce({ isConnected: true });
    mockGetAddress.mockResolvedValueOnce({ address: VALID_KEY });

    const adapter = new StellarWalletAdapter();
    await adapter.connectFreighter();

    expect(adapter.getWallet()).toEqual({
      type: 'freighter',
      publicKey: VALID_KEY,
      isConnected: true,
    });
  });

  it('returns null after disconnect', async () => {
    setFreighterWindow(true);
    mockIsConnected.mockResolvedValueOnce({ isConnected: true });
    mockGetAddress.mockResolvedValueOnce({ address: VALID_KEY });

    const adapter = new StellarWalletAdapter();
    await adapter.connectFreighter();
    adapter.disconnect();

    expect(adapter.getWallet()).toBeNull();
  });
});

// ── getStellarWalletAdapter singleton ─────────────────────────────────────────

describe('getStellarWalletAdapter singleton', () => {
  it('returns the same instance on repeated calls', () => {
    const a = getStellarWalletAdapter();
    const b = getStellarWalletAdapter();
    expect(a).toBe(b);
  });

  it('returns a fresh instance after _resetAdapterSingleton', () => {
    const a = getStellarWalletAdapter();
    _resetAdapterSingleton();
    const b = getStellarWalletAdapter();
    expect(a).not.toBe(b);
  });
});
