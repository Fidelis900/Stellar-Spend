import { logger } from '@/lib/logger';
import {
  AllbridgeCoreSdk,
  nodeRpcUrlsDefault,
  ChainDetailsMap,
  TokenWithChainDetails,
} from '@allbridge/bridge-core-sdk';

// ─── Module-level SDK singleton ───────────────────────────────────────────────

/** Cached SDK instance (never replaced once set) */
let _sdkInstance: AllbridgeCoreSdk | null = null;

// ─── 5-minute TTL cache helpers ───────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

let _chainDetailsCache: CacheEntry<ChainDetailsMap> | null = null;
let _tokenInfoCache: CacheEntry<{ stellar: AllbridgeTokenInfo; base: AllbridgeTokenInfo }> | null =
  null;

function isFresh<T>(entry: CacheEntry<T> | null): entry is CacheEntry<T> {
  return entry !== null && Date.now() < entry.expiresAt;
}

function makeEntry<T>(value: T): CacheEntry<T> {
  return { value, expiresAt: Date.now() + CACHE_TTL_MS };
}

/** Invalidate all caches (called on any SDK error) */
export function invalidateSdkCache(): void {
  _sdkInstance = null;
  _chainDetailsCache = null;
  _tokenInfoCache = null;
}

// ─── SDK initialisation ───────────────────────────────────────────────────────

/**
 * Initialize the Allbridge Core SDK with proper RPC URLs.
 * Returns the cached instance on subsequent calls — no re-initialisation cost.
 */
export function initializeAllbridgeSdk(): AllbridgeCoreSdk {
  if (_sdkInstance) {
    return _sdkInstance;
  }

  const rpcUrls = { ...nodeRpcUrlsDefault };

  // Map Soroban RPC URL to SRB (Soroban chain key)
  const sorobanRpcUrl = process.env.STELLAR_SOROBAN_RPC_URL;
  if (sorobanRpcUrl) {
    rpcUrls.SRB = sorobanRpcUrl;
    logger.info(`[Allbridge SDK] Using Soroban RPC: ${sorobanRpcUrl}`);
  }

  // Map Horizon URL to STLR (Stellar chain key)
  const horizonUrl = process.env.STELLAR_HORIZON_URL;
  if (horizonUrl) {
    rpcUrls.STLR = horizonUrl;
    logger.info(`[Allbridge SDK] Using Horizon URL: ${horizonUrl}`);
  }

  // Legacy fallback for STELLAR_RPC_URL
  const legacyRpcUrl = process.env.STELLAR_RPC_URL;
  if (legacyRpcUrl && !sorobanRpcUrl && !horizonUrl) {
    if (legacyRpcUrl.includes('horizon')) {
      rpcUrls.STLR = legacyRpcUrl;
      logger.info(`[Allbridge SDK] Using legacy RPC as Horizon: ${legacyRpcUrl}`);
    } else {
      rpcUrls.SRB = legacyRpcUrl;
      logger.info(`[Allbridge SDK] Using legacy RPC as Soroban: ${legacyRpcUrl}`);
    }
  }

  _sdkInstance = new AllbridgeCoreSdk(rpcUrls);
  logger.info('[Allbridge SDK] Initialized new SDK instance');
  return _sdkInstance;
}

// ─── Cached chainDetailsMap ───────────────────────────────────────────────────

/**
 * Fetch chain details, caching the result for 5 minutes.
 * Invalidates cache and rethrows on error.
 */
export async function getCachedChainDetailsMap(sdk: AllbridgeCoreSdk): Promise<ChainDetailsMap> {
  if (isFresh(_chainDetailsCache)) {
    return _chainDetailsCache.value;
  }

  try {
    const details = await sdk.chainDetailsMap();
    _chainDetailsCache = makeEntry(details);
    return details;
  } catch (error) {
    invalidateSdkCache();
    throw error;
  }
}

// ─── Token info ───────────────────────────────────────────────────────────────

interface AllbridgeTokenInfo {
  chain: ChainDetailsMap[string];
  usdc: TokenWithChainDetails;
}

/**
 * Fetch Stellar and Base USDC token information from Allbridge SDK.
 * Caches the result for 5 minutes; invalidates cache on error.
 */
export async function getAllbridgeTokens(sdk: AllbridgeCoreSdk): Promise<{
  stellar: AllbridgeTokenInfo;
  base: AllbridgeTokenInfo;
}> {
  if (isFresh(_tokenInfoCache)) {
    return _tokenInfoCache.value;
  }

  try {
    const chainDetailsMap = await getCachedChainDetailsMap(sdk);

    // Extract Stellar chain (SRB) and find USDC token
    const stellarChain = chainDetailsMap.SRB;
    if (!stellarChain) {
      throw new Error('Stellar chain (SRB) not found in Allbridge chain details');
    }
    const stellarUsdc = stellarChain.tokens.find(
      (token: TokenWithChainDetails) => token.symbol === 'USDC',
    );
    if (!stellarUsdc) {
      throw new Error('USDC token not found on Stellar chain');
    }

    // Extract Base chain (BAS) and find USDC token
    const baseChain = chainDetailsMap.BAS;
    if (!baseChain) {
      throw new Error('Base chain (BAS) not found in Allbridge chain details');
    }
    const baseUsdc = baseChain.tokens.find(
      (token: TokenWithChainDetails) => token.symbol === 'USDC',
    );
    if (!baseUsdc) {
      throw new Error('USDC token not found on Base chain');
    }

    const result = {
      stellar: { chain: stellarChain, usdc: stellarUsdc },
      base: { chain: baseChain, usdc: baseUsdc },
    };

    _tokenInfoCache = makeEntry(result);
    return result;
  } catch (error) {
    invalidateSdkCache();
    throw error;
  }
}

/**
 * Find a specific token (e.g. USDC or USDT) on a given chain.
 * Returns the token or throws if not found.
 */
export async function getAllbridgeToken(
  sdk: AllbridgeCoreSdk,
  chainKey: string,
  tokenSymbol: string,
): Promise<TokenWithChainDetails> {
  try {
    const chainDetailsMap = await getCachedChainDetailsMap(sdk);
    const chain = chainDetailsMap[chainKey];
    if (!chain) throw new Error(`Chain ${chainKey} not found in Allbridge details`);
    const token = chain.tokens.find(
      (t: TokenWithChainDetails) => t.symbol === tokenSymbol.toUpperCase(),
    );
    if (!token) throw new Error(`${tokenSymbol} not found on chain ${chainKey}`);
    return token;
  } catch (error) {
    invalidateSdkCache();
    throw error;
  }
}

/**
 * List all tokens available on a given chain (e.g. 'SRB' for Stellar).
 */
export async function getAllbridgeChainTokens(
  sdk: AllbridgeCoreSdk,
  chainKey: string,
): Promise<TokenWithChainDetails[]> {
  try {
    const chainDetailsMap = await getCachedChainDetailsMap(sdk);
    const chain = chainDetailsMap[chainKey];
    if (!chain) throw new Error(`Chain ${chainKey} not found`);
    return chain.tokens;
  } catch (error) {
    invalidateSdkCache();
    throw error;
  }
}

// ─── Quote ────────────────────────────────────────────────────────────────────

/**
 * Get bridge quote with receive amount, fee, and estimated time.
 */
export async function getAllbridgeQuote(
  sdk: AllbridgeCoreSdk,
  sourceToken: TokenWithChainDetails,
  destinationToken: TokenWithChainDetails,
  amount: string,
): Promise<{
  receiveAmount: string;
  fee: string;
  estimatedTime: number;
}> {
  try {
    const { Messenger } = await import('@allbridge/bridge-core-sdk');

    const amountToBeReceived = await sdk.getAmountToBeReceived(
      amount,
      sourceToken,
      destinationToken,
    );

    const fee = (parseFloat(amount) - parseFloat(amountToBeReceived)).toString();

    const estimatedTime = await sdk.getAverageTransferTime(
      sourceToken,
      destinationToken,
      Messenger.ALLBRIDGE,
    );

    return { receiveAmount: amountToBeReceived, fee, estimatedTime: estimatedTime ?? 0 };
  } catch (error) {
    invalidateSdkCache();
    throw error;
  }
}
