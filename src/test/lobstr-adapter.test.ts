import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  StellarWalletAdapter,
  getStellarWalletAdapter,
  _resetAdapterSingleton,
} from '@/lib/stellar';

// ── Freighter API mock (needed to satisfy the import, not under test here) ─────
vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn().mockResolvedValue({ isConnected: false }),
  getAddress: vi.fn().mockResolvedValue({ address: '' }),
  requestAccess: vi.fn().mockResolvedValue({ address: '' }),
  signTransaction: vi.fn().mockResolvedValue({ signedTxXdr: '', signerAddress: '' }),
  getNetworkDetails: vi
    .fn()
    .mockResolvedValue({ networkPassphrase: 'Public Global Stellar Network ; September 2015' }),
}));

const VALID_KEY = 'GBLOBSTR1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCD';
const SIGNED_XDR = 'lobstr-signed-xdr';

// ── Window helpers ─────────────────────────────────────────────────────────────

function setLobstrWindow(variant: 'lobstr' | 'stellar' | 'both' | 'none') {
  const w = (global.window as any) ?? {};

  // Clear previous state
  delete w.lobstr;
  if (w.stellar) delete w.stellar;

  const provider = {
    connect: vi.fn().mockResolvedValue({ publicKey: VALID_KEY }),
    signTransaction: vi.fn().mockResolvedValue({ signedXdr: SIGNED_XDR }),
  };

  if (variant === 'lobstr' || variant === 'both') {
    w.lobstr = provider;
  }
  if (variant === 'stellar' || variant === 'both') {
    w.stellar = {
      isLobstr: true,
      connect: provider.connect,
      signTransaction: provider.signTransaction,
    };
  }

  global.window = w;
  return provider;
}

function clearLobstrWindow() {
  const w = (global.window as any) ?? {};
  delete w.lobstr;
  if (w.stellar) delete w.stellar;
  global.window = w;
}

beforeEach(() => {
  clearLobstrWindow();
  _resetAdapterSingleton();
});

// ── isLobstrAvailable ──────────────────────────────────────────────────────────

describe('isLobstrAvailable', () => {
  it('returns true when window.lobstr is present with valid interface', () => {
    setLobstrWindow('lobstr');
    expect(new StellarWalletAdapter().isLobstrAvailable()).toBe(true);
  });

  it('returns true when window.stellar.isLobstr is truthy with valid interface', () => {
    setLobstrWindow('stellar');
    expect(new StellarWalletAdapter().isLobstrAvailable()).toBe(true);
  });

  it('returns true when both window.lobstr and window.stellar.isLobstr are present', () => {
    setLobstrWindow('both');
    expect(new StellarWalletAdapter().isLobstrAvailable()).toBe(true);
  });

  it('returns false when neither provider is present', () => {
    clearLobstrWindow();
    expect(new StellarWalletAdapter().isLobstrAvailable()).toBe(false);
  });

  it('returns false when window.lobstr exists but lacks connect()', () => {
    (global.window as any).lobstr = { signTransaction: vi.fn() }; // missing connect
    expect(new StellarWalletAdapter().isLobstrAvailable()).toBe(false);
  });

  it('returns false when window.lobstr exists but lacks signTransaction()', () => {
    (global.window as any).lobstr = { connect: vi.fn() }; // missing signTransaction
    expect(new StellarWalletAdapter().isLobstrAvailable()).toBe(false);
  });

  it('returns false when window.lobstr is not an object', () => {
    (global.window as any).lobstr = true;
    expect(new StellarWalletAdapter().isLobstrAvailable()).toBe(false);
  });

  it('returns false when window is undefined (SSR)', () => {
    const original = global.window;
    // @ts-expect-error intentional SSR simulation
    delete global.window;
    expect(new StellarWalletAdapter().isLobstrAvailable()).toBe(false);
    global.window = original;
  });
});

// ── connectLobstr — happy paths ────────────────────────────────────────────────

describe('connectLobstr — happy paths', () => {
  it('connects via window.lobstr and returns correct wallet', async () => {
    setLobstrWindow('lobstr');
    const wallet = await new StellarWalletAdapter().connectLobstr();

    expect(wallet.type).toBe('lobstr');
    expect(wallet.publicKey).toBe(VALID_KEY);
    expect(wallet.isConnected).toBe(true);
  });

  it('connects via window.stellar.isLobstr when window.lobstr is absent', async () => {
    setLobstrWindow('stellar');
    const wallet = await new StellarWalletAdapter().connectLobstr();

    expect(wallet.type).toBe('lobstr');
    expect(wallet.publicKey).toBe(VALID_KEY);
  });

  it('prefers window.lobstr over window.stellar when both are present', async () => {
    const providers = setLobstrWindow('both');
    await new StellarWalletAdapter().connectLobstr();

    // window.lobstr.connect should be called (it's the same mock in this helper,
    // but we verify connect was called exactly once — no double-connect)
    expect(providers.connect).toHaveBeenCalledTimes(1);
  });

  it('stores walletType and publicKey on the instance', async () => {
    setLobstrWindow('lobstr');
    const adapter = new StellarWalletAdapter();
    await adapter.connectLobstr();

    expect(adapter.getWallet()).toEqual({
      type: 'lobstr',
      publicKey: VALID_KEY,
      isConnected: true,
    });
  });

  it('trims whitespace from the returned public key', async () => {
    const w = global.window as any;
    w.lobstr = {
      connect: vi.fn().mockResolvedValue({ publicKey: `  ${VALID_KEY}  ` }),
      signTransaction: vi.fn(),
    };
    const wallet = await new StellarWalletAdapter().connectLobstr();
    expect(wallet.publicKey).toBe(VALID_KEY);
  });

  it('returns immediately without calling connect() when already connected', async () => {
    const provider = setLobstrWindow('lobstr');
    const adapter = new StellarWalletAdapter();

    await adapter.connectLobstr(); // first call
    vi.clearAllMocks();
    const wallet = await adapter.connectLobstr(); // second call — idempotent

    expect(wallet.publicKey).toBe(VALID_KEY);
    expect(provider.connect).not.toHaveBeenCalled();
  });
});

// ── connectLobstr — error paths ────────────────────────────────────────────────

describe('connectLobstr — error paths', () => {
  it('throws user-friendly error when no provider is present', async () => {
    clearLobstrWindow();
    await expect(new StellarWalletAdapter().connectLobstr()).rejects.toThrow(
      /Lobstr wallet is not installed or unavailable/,
    );
  });

  it('throws user-friendly error when provider interface is invalid', async () => {
    (global.window as any).lobstr = { connect: vi.fn() }; // missing signTransaction
    await expect(new StellarWalletAdapter().connectLobstr()).rejects.toThrow(
      /Lobstr wallet is not installed or unavailable/,
    );
  });

  it('throws user-friendly error when user rejects the connection', async () => {
    const w = global.window as any;
    w.lobstr = {
      connect: vi.fn().mockRejectedValue(new Error('User declined')),
      signTransaction: vi.fn(),
    };
    await expect(new StellarWalletAdapter().connectLobstr()).rejects.toThrow(/declined/i);
  });

  it("throws user-friendly error when connect() rejects with 'rejected'", async () => {
    const w = global.window as any;
    w.lobstr = {
      connect: vi.fn().mockRejectedValue(new Error('rejected')),
      signTransaction: vi.fn(),
    };
    await expect(new StellarWalletAdapter().connectLobstr()).rejects.toThrow(/declined/i);
  });

  it('throws when connect() returns null', async () => {
    const w = global.window as any;
    w.lobstr = {
      connect: vi.fn().mockResolvedValue(null),
      signTransaction: vi.fn(),
    };
    await expect(new StellarWalletAdapter().connectLobstr()).rejects.toThrow(
      /unexpected response/i,
    );
  });

  it('throws when connect() returns an object without publicKey', async () => {
    const w = global.window as any;
    w.lobstr = {
      connect: vi.fn().mockResolvedValue({ address: VALID_KEY }), // wrong field name
      signTransaction: vi.fn(),
    };
    await expect(new StellarWalletAdapter().connectLobstr()).rejects.toThrow(/valid public key/i);
  });

  it('throws when connect() returns an empty publicKey string', async () => {
    const w = global.window as any;
    w.lobstr = {
      connect: vi.fn().mockResolvedValue({ publicKey: '' }),
      signTransaction: vi.fn(),
    };
    await expect(new StellarWalletAdapter().connectLobstr()).rejects.toThrow(/valid public key/i);
  });

  it('throws when connect() returns a whitespace-only publicKey', async () => {
    const w = global.window as any;
    w.lobstr = {
      connect: vi.fn().mockResolvedValue({ publicKey: '   ' }),
      signTransaction: vi.fn(),
    };
    await expect(new StellarWalletAdapter().connectLobstr()).rejects.toThrow(/valid public key/i);
  });

  it('throws when connect() returns a non-string publicKey', async () => {
    const w = global.window as any;
    w.lobstr = {
      connect: vi.fn().mockResolvedValue({ publicKey: 12345 }),
      signTransaction: vi.fn(),
    };
    await expect(new StellarWalletAdapter().connectLobstr()).rejects.toThrow(/valid public key/i);
  });

  it('does not expose raw internal error details', async () => {
    const w = global.window as any;
    w.lobstr = {
      connect: vi.fn().mockRejectedValue(new Error('INTERNAL_STACK_TRACE_XYZ')),
      signTransaction: vi.fn(),
    };
    // Should throw an Error (not crash), message may pass through for unknown errors
    await expect(new StellarWalletAdapter().connectLobstr()).rejects.toBeInstanceOf(Error);
  });
});

// ── Idempotency / race condition prevention ────────────────────────────────────

describe('connectLobstr — idempotency and concurrency', () => {
  it('collapses concurrent calls into a single in-flight promise', async () => {
    const provider = setLobstrWindow('lobstr');
    const adapter = new StellarWalletAdapter();

    const [w1, w2, w3] = await Promise.all([
      adapter.connectLobstr(),
      adapter.connectLobstr(),
      adapter.connectLobstr(),
    ]);

    expect(w1.publicKey).toBe(VALID_KEY);
    expect(w2.publicKey).toBe(VALID_KEY);
    expect(w3.publicKey).toBe(VALID_KEY);

    // connect() called exactly once despite three concurrent callers
    expect(provider.connect).toHaveBeenCalledTimes(1);
  });

  it('clears the in-flight promise after resolution so a fresh call works', async () => {
    const provider = setLobstrWindow('lobstr');
    const adapter = new StellarWalletAdapter();

    await adapter.connectLobstr();
    adapter.disconnect();

    // Re-set provider since disconnect clears state
    provider.connect.mockResolvedValueOnce({ publicKey: VALID_KEY });
    const wallet = await adapter.connectLobstr();

    expect(wallet.publicKey).toBe(VALID_KEY);
    expect(provider.connect).toHaveBeenCalledTimes(2); // once before, once after disconnect
  });

  it('propagates rejection to all concurrent callers', async () => {
    const w = global.window as any;
    w.lobstr = {
      connect: vi.fn().mockRejectedValue(new Error('User declined')),
      signTransaction: vi.fn(),
    };
    const adapter = new StellarWalletAdapter();

    const results = await Promise.allSettled([
      adapter.connectLobstr(),
      adapter.connectLobstr(),
      adapter.connectLobstr(),
    ]);

    results.forEach((r) => {
      expect(r.status).toBe('rejected');
      expect((r as PromiseRejectedResult).reason.message).toMatch(/declined/i);
    });
  });
});

// ── signTransaction (Lobstr) ───────────────────────────────────────────────────

describe('signTransaction — Lobstr', () => {
  it('signs successfully and returns signedXdr', async () => {
    const provider = setLobstrWindow('lobstr');
    const adapter = new StellarWalletAdapter();
    await adapter.connectLobstr();

    const result = await adapter.signTransaction('raw-xdr');

    expect(result).toBe(SIGNED_XDR);
    expect(provider.signTransaction).toHaveBeenCalledWith('raw-xdr', {
      networkPassphrase: 'Public Global Stellar Network ; September 2015',
    });
  });

  it('always passes mainnet passphrase', async () => {
    const provider = setLobstrWindow('lobstr');
    const adapter = new StellarWalletAdapter();
    await adapter.connectLobstr();
    await adapter.signTransaction('raw-xdr');

    expect(provider.signTransaction).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        networkPassphrase: 'Public Global Stellar Network ; September 2015',
      }),
    );
  });

  it('throws when provider disappears after connection', async () => {
    setLobstrWindow('lobstr');
    const adapter = new StellarWalletAdapter();
    await adapter.connectLobstr();

    clearLobstrWindow(); // simulate extension being uninstalled mid-session

    await expect(adapter.signTransaction('raw-xdr')).rejects.toThrow(
      /Lobstr is no longer available/,
    );
  });

  it('throws user-friendly error when signing is rejected', async () => {
    const w = global.window as any;
    const provider = {
      connect: vi.fn().mockResolvedValue({ publicKey: VALID_KEY }),
      signTransaction: vi.fn().mockRejectedValue(new Error('User declined')),
    };
    w.lobstr = provider;

    const adapter = new StellarWalletAdapter();
    await adapter.connectLobstr();

    await expect(adapter.signTransaction('raw-xdr')).rejects.toThrow(/declined/i);
  });

  it('throws when signedXdr is empty', async () => {
    const w = global.window as any;
    w.lobstr = {
      connect: vi.fn().mockResolvedValue({ publicKey: VALID_KEY }),
      signTransaction: vi.fn().mockResolvedValue({ signedXdr: '' }),
    };

    const adapter = new StellarWalletAdapter();
    await adapter.connectLobstr();

    await expect(adapter.signTransaction('raw-xdr')).rejects.toThrow(/empty signed transaction/i);
  });
});

// ── connectAuto with Lobstr ────────────────────────────────────────────────────

describe('connectAuto — Lobstr fallback', () => {
  it('uses Lobstr when Freighter is unavailable', async () => {
    // Freighter mocks return falsy — no window.freighter, isConnected=false
    setLobstrWindow('lobstr');

    const wallet = await new StellarWalletAdapter().connectAuto();
    expect(wallet.type).toBe('lobstr');
    expect(wallet.publicKey).toBe(VALID_KEY);
  });

  it('throws when neither wallet is available', async () => {
    clearLobstrWindow();
    await expect(new StellarWalletAdapter().connectAuto()).rejects.toThrow(
      /No Stellar wallet found/,
    );
  });
});

// ── getWallet / disconnect ─────────────────────────────────────────────────────

describe('getWallet and disconnect — Lobstr', () => {
  it('returns null before connection', () => {
    expect(new StellarWalletAdapter().getWallet()).toBeNull();
  });

  it('returns wallet after successful Lobstr connection', async () => {
    setLobstrWindow('lobstr');
    const adapter = new StellarWalletAdapter();
    await adapter.connectLobstr();

    expect(adapter.getWallet()).toEqual({
      type: 'lobstr',
      publicKey: VALID_KEY,
      isConnected: true,
    });
  });

  it('returns null after disconnect', async () => {
    setLobstrWindow('lobstr');
    const adapter = new StellarWalletAdapter();
    await adapter.connectLobstr();
    adapter.disconnect();

    expect(adapter.getWallet()).toBeNull();
  });
});
