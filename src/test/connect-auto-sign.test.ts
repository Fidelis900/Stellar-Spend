import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StellarWalletAdapter, _resetAdapterSingleton } from '@/lib/stellar';

// ── Mock @stellar/freighter-api ────────────────────────────────────────────────
vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn(),
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

const FREIGHTER_KEY = 'GCFREIGHTER1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890AB';
const LOBSTR_KEY = 'GBLOBSTR1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCD';
const SIGNED_XDR_F = 'freighter-signed-xdr';
const SIGNED_XDR_L = 'lobstr-signed-xdr';
const MAINNET = 'Public Global Stellar Network ; September 2015';

// ── Window helpers ─────────────────────────────────────────────────────────────

function setFreighterWindow(present: boolean) {
  const w = (global.window as any) ?? {};
  if (present) w.freighter = true;
  else delete w.freighter;
  global.window = w;
}

function makeLobstrProvider(
  overrides: Partial<{
    connect: () => Promise<unknown>;
    signTransaction: () => Promise<unknown>;
  }> = {},
) {
  return {
    connect: vi.fn().mockResolvedValue({ publicKey: LOBSTR_KEY }),
    signTransaction: vi.fn().mockResolvedValue({ signedXdr: SIGNED_XDR_L }),
    ...overrides,
  };
}

function setLobstrWindow(provider: ReturnType<typeof makeLobstrProvider> | null) {
  const w = (global.window as any) ?? {};
  if (provider) w.lobstr = provider;
  else delete w.lobstr;
  if (w.stellar) delete w.stellar;
  global.window = w;
}

function clearAllWallets() {
  const w = (global.window as any) ?? {};
  delete w.freighter;
  delete w.lobstr;
  if (w.stellar) delete w.stellar;
  global.window = w;
}

// Default Freighter mocks — "not connected, no address" so Freighter is
// treated as unavailable unless a test overrides them.
function mockFreighterUnavailable() {
  mockIsConnected.mockResolvedValue({ isConnected: false });
  mockGetAddress.mockResolvedValue({ address: '' });
  mockRequestAccess.mockResolvedValue({ address: '' });
}

function mockFreighterReady(key = FREIGHTER_KEY) {
  setFreighterWindow(true);
  mockIsConnected.mockResolvedValue({ isConnected: true });
  mockGetAddress.mockResolvedValue({ address: key });
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetAdapterSingleton();
  clearAllWallets();
  mockFreighterUnavailable();
});

// ── connectAuto — detection order ─────────────────────────────────────────────

describe('connectAuto — detection order', () => {
  it('connects via Freighter when available, ignoring Lobstr', async () => {
    mockFreighterReady();
    const lobstr = makeLobstrProvider();
    setLobstrWindow(lobstr);

    const wallet = await new StellarWalletAdapter().connectAuto();

    expect(wallet.type).toBe('freighter');
    expect(wallet.publicKey).toBe(FREIGHTER_KEY);
    expect(lobstr.connect).not.toHaveBeenCalled();
  });

  it('falls back to Lobstr when Freighter is not installed', async () => {
    // Freighter unavailable (default mocks + no window.freighter)
    const lobstr = makeLobstrProvider();
    setLobstrWindow(lobstr);

    const wallet = await new StellarWalletAdapter().connectAuto();

    expect(wallet.type).toBe('lobstr');
    expect(wallet.publicKey).toBe(LOBSTR_KEY);
  });

  it('falls back to Lobstr when Freighter isConnected() returns an error', async () => {
    // window.freighter absent, isConnected returns error → isFreighterAvailable=false
    mockIsConnected.mockResolvedValue({
      isConnected: false,
      error: { code: 1, message: 'not installed' },
    });
    const lobstr = makeLobstrProvider();
    setLobstrWindow(lobstr);

    const wallet = await new StellarWalletAdapter().connectAuto();

    expect(wallet.type).toBe('lobstr');
  });

  it('throws when neither Freighter nor Lobstr is available', async () => {
    clearAllWallets();
    await expect(new StellarWalletAdapter().connectAuto()).rejects.toThrow(
      /No Stellar wallet found/,
    );
  });

  it('error message includes install links for both wallets', async () => {
    clearAllWallets();
    await expect(new StellarWalletAdapter().connectAuto()).rejects.toThrow(/freighter\.app/i);
    await expect(new StellarWalletAdapter().connectAuto()).rejects.toThrow(/lobstr\.co/i);
  });
});

// ── connectAuto — idempotency and concurrency ──────────────────────────────────

describe('connectAuto — idempotency and concurrency', () => {
  it('returns stored wallet immediately on second call without provider calls', async () => {
    mockFreighterReady();
    const adapter = new StellarWalletAdapter();
    await adapter.connectAuto();

    vi.clearAllMocks();
    const wallet = await adapter.connectAuto();

    expect(wallet.publicKey).toBe(FREIGHTER_KEY);
    expect(mockIsConnected).not.toHaveBeenCalled();
    expect(mockGetAddress).not.toHaveBeenCalled();
  });

  it('collapses concurrent calls into a single in-flight promise (Freighter)', async () => {
    mockFreighterReady();
    const adapter = new StellarWalletAdapter();

    const [w1, w2, w3] = await Promise.all([
      adapter.connectAuto(),
      adapter.connectAuto(),
      adapter.connectAuto(),
    ]);

    expect(w1.publicKey).toBe(FREIGHTER_KEY);
    expect(w2.publicKey).toBe(FREIGHTER_KEY);
    expect(w3.publicKey).toBe(FREIGHTER_KEY);
    // isConnected called once despite three concurrent callers
    expect(mockIsConnected).toHaveBeenCalledTimes(1);
  });

  it('collapses concurrent calls into a single in-flight promise (Lobstr)', async () => {
    const lobstr = makeLobstrProvider();
    setLobstrWindow(lobstr);
    const adapter = new StellarWalletAdapter();

    const [w1, w2, w3] = await Promise.all([
      adapter.connectAuto(),
      adapter.connectAuto(),
      adapter.connectAuto(),
    ]);

    expect(w1.publicKey).toBe(LOBSTR_KEY);
    expect(w2.publicKey).toBe(LOBSTR_KEY);
    expect(w3.publicKey).toBe(LOBSTR_KEY);
    expect(lobstr.connect).toHaveBeenCalledTimes(1);
  });

  it('stores walletType and publicKey after connectAuto via Freighter', async () => {
    mockFreighterReady();
    const adapter = new StellarWalletAdapter();
    await adapter.connectAuto();

    expect(adapter.getWallet()).toEqual({
      type: 'freighter',
      publicKey: FREIGHTER_KEY,
      isConnected: true,
    });
  });

  it('stores walletType and publicKey after connectAuto via Lobstr', async () => {
    setLobstrWindow(makeLobstrProvider());
    const adapter = new StellarWalletAdapter();
    await adapter.connectAuto();

    expect(adapter.getWallet()).toEqual({
      type: 'lobstr',
      publicKey: LOBSTR_KEY,
      isConnected: true,
    });
  });

  it('clears in-flight promise after resolution so next call works', async () => {
    mockFreighterReady();
    const adapter = new StellarWalletAdapter();
    await adapter.connectAuto();
    adapter.disconnect();

    mockFreighterReady();
    const wallet = await adapter.connectAuto();
    expect(wallet.publicKey).toBe(FREIGHTER_KEY);
  });
});

// ── signTransaction — routing ──────────────────────────────────────────────────

describe('signTransaction — routing', () => {
  it('routes to Freighter when walletType is freighter', async () => {
    mockFreighterReady();
    mockSignTransaction.mockResolvedValue({
      signedTxXdr: SIGNED_XDR_F,
      signerAddress: FREIGHTER_KEY,
    });

    const adapter = new StellarWalletAdapter();
    await adapter.connectAuto();
    const result = await adapter.signTransaction('raw-xdr');

    expect(result).toBe(SIGNED_XDR_F);
    expect(mockSignTransaction).toHaveBeenCalledTimes(1);
  });

  it('routes to Lobstr when walletType is lobstr', async () => {
    const lobstr = makeLobstrProvider();
    setLobstrWindow(lobstr);

    const adapter = new StellarWalletAdapter();
    await adapter.connectAuto();
    const result = await adapter.signTransaction('raw-xdr');

    expect(result).toBe(SIGNED_XDR_L);
    expect(lobstr.signTransaction).toHaveBeenCalledTimes(1);
    expect(mockSignTransaction).not.toHaveBeenCalled();
  });

  it('does not call Lobstr signTransaction when connected via Freighter', async () => {
    mockFreighterReady();
    mockSignTransaction.mockResolvedValue({
      signedTxXdr: SIGNED_XDR_F,
      signerAddress: FREIGHTER_KEY,
    });
    const lobstr = makeLobstrProvider();
    setLobstrWindow(lobstr);

    const adapter = new StellarWalletAdapter();
    await adapter.connectAuto();
    await adapter.signTransaction('raw-xdr');

    expect(lobstr.signTransaction).not.toHaveBeenCalled();
  });

  it('does not call Freighter signTransaction when connected via Lobstr', async () => {
    const lobstr = makeLobstrProvider();
    setLobstrWindow(lobstr);

    const adapter = new StellarWalletAdapter();
    await adapter.connectAuto();
    await adapter.signTransaction('raw-xdr');

    expect(mockSignTransaction).not.toHaveBeenCalled();
  });
});

// ── signTransaction — Freighter ────────────────────────────────────────────────

describe('signTransaction — Freighter', () => {
  it('returns signedTxXdr on success', async () => {
    mockFreighterReady();
    mockSignTransaction.mockResolvedValue({
      signedTxXdr: SIGNED_XDR_F,
      signerAddress: FREIGHTER_KEY,
    });

    const adapter = new StellarWalletAdapter();
    await adapter.connectAuto();
    expect(await adapter.signTransaction('raw-xdr')).toBe(SIGNED_XDR_F);
  });

  it('always passes mainnet passphrase', async () => {
    mockFreighterReady();
    mockSignTransaction.mockResolvedValue({
      signedTxXdr: SIGNED_XDR_F,
      signerAddress: FREIGHTER_KEY,
    });

    const adapter = new StellarWalletAdapter();
    await adapter.connectAuto();
    await adapter.signTransaction('raw-xdr');

    expect(mockSignTransaction).toHaveBeenCalledWith(
      'raw-xdr',
      expect.objectContaining({ networkPassphrase: MAINNET }),
    );
  });

  it('throws user-friendly error when user declines signing', async () => {
    mockFreighterReady();
    mockSignTransaction.mockResolvedValue({
      signedTxXdr: '',
      signerAddress: '',
      error: { code: 3, message: 'User declined' },
    });

    const adapter = new StellarWalletAdapter();
    await adapter.connectAuto();
    await expect(adapter.signTransaction('raw-xdr')).rejects.toThrow(/declined/i);
  });

  it('throws when signedTxXdr is empty with no error', async () => {
    mockFreighterReady();
    mockSignTransaction.mockResolvedValue({ signedTxXdr: '', signerAddress: '' });

    const adapter = new StellarWalletAdapter();
    await adapter.connectAuto();
    await expect(adapter.signTransaction('raw-xdr')).rejects.toThrow(/empty signed transaction/i);
  });
});

// ── signTransaction — Lobstr ───────────────────────────────────────────────────

describe('signTransaction — Lobstr', () => {
  it('returns signedXdr on success', async () => {
    setLobstrWindow(makeLobstrProvider());
    const adapter = new StellarWalletAdapter();
    await adapter.connectAuto();
    expect(await adapter.signTransaction('raw-xdr')).toBe(SIGNED_XDR_L);
  });

  it('always passes mainnet passphrase', async () => {
    const lobstr = makeLobstrProvider();
    setLobstrWindow(lobstr);

    const adapter = new StellarWalletAdapter();
    await adapter.connectAuto();
    await adapter.signTransaction('raw-xdr');

    expect(lobstr.signTransaction).toHaveBeenCalledWith(
      'raw-xdr',
      expect.objectContaining({ networkPassphrase: MAINNET }),
    );
  });

  it('throws when provider disappears after connection', async () => {
    setLobstrWindow(makeLobstrProvider());
    const adapter = new StellarWalletAdapter();
    await adapter.connectAuto();

    clearAllWallets(); // simulate extension removed mid-session

    await expect(adapter.signTransaction('raw-xdr')).rejects.toThrow(
      /Lobstr is no longer available/,
    );
  });

  it('throws user-friendly error when user declines signing', async () => {
    const lobstr = makeLobstrProvider({
      signTransaction: vi.fn().mockRejectedValue(new Error('User declined')),
    });
    setLobstrWindow(lobstr);

    const adapter = new StellarWalletAdapter();
    await adapter.connectAuto();
    await expect(adapter.signTransaction('raw-xdr')).rejects.toThrow(/declined/i);
  });

  it('throws when signedXdr is empty', async () => {
    const lobstr = makeLobstrProvider({
      signTransaction: vi.fn().mockResolvedValue({ signedXdr: '' }),
    });
    setLobstrWindow(lobstr);

    const adapter = new StellarWalletAdapter();
    await adapter.connectAuto();
    await expect(adapter.signTransaction('raw-xdr')).rejects.toThrow(/empty signed transaction/i);
  });
});

// ── signTransaction — no wallet ────────────────────────────────────────────────

describe('signTransaction — no wallet connected', () => {
  it('throws before any provider call when no wallet is connected', async () => {
    const adapter = new StellarWalletAdapter();
    await expect(adapter.signTransaction('raw-xdr')).rejects.toThrow(/No wallet connected/);
    expect(mockSignTransaction).not.toHaveBeenCalled();
  });

  it('throws after disconnect', async () => {
    mockFreighterReady();
    const adapter = new StellarWalletAdapter();
    await adapter.connectAuto();
    adapter.disconnect();

    await expect(adapter.signTransaction('raw-xdr')).rejects.toThrow(/No wallet connected/);
  });
});
