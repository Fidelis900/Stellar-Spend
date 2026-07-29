import { logger } from '@/lib/logger';
import * as StellarSdk from '@stellar/stellar-sdk';
import { randomBytes } from 'crypto';

/**
 * Convert float amount to on-chain integer representation
 */
/**
 * Convert float amount to on-chain integer representation
 */
export function floatToInt(amount: string, decimals: number): string {
  const [intPartRaw, fracPartRaw = ''] = amount.split('.');
  const intPart = intPartRaw || '0';
  let fracPart = fracPartRaw;

  if (fracPart.length > decimals) {
    fracPart = fracPart.substring(0, decimals);
  } else {
    fracPart = fracPart.padEnd(decimals, '0');
  }

  const result = BigInt(intPart) * BigInt(10) ** BigInt(decimals) + BigInt(fracPart);
  return result.toString();
}

/**
 * Encode EVM address as 32-byte buffer (left-pad 20-byte address)
 */
function encodeEvmAddress(address: string): Buffer {
  const cleanAddress = address.startsWith('0x') ? address.slice(2) : address;
  const addressBuffer = Buffer.from(cleanAddress, 'hex');
  const paddedBuffer = Buffer.alloc(32);
  addressBuffer.copy(paddedBuffer, 12); // Left-pad with 12 zeros
  return paddedBuffer;
}

/**
 * Encode token address as 32-byte buffer
 */
function encodeTokenAddress(address: string): Buffer {
  const cleanAddress = address.startsWith('0x') ? address.slice(2) : address;
  const buffer = Buffer.from(cleanAddress, 'hex');
  if (buffer.length === 32) return buffer;

  const paddedBuffer = Buffer.alloc(32);
  buffer.copy(paddedBuffer, 32 - buffer.length); // Right-align
  return paddedBuffer;
}

/**
 * Generate random nonce as positive BigInt
 */
export function getNonceBigInt(): bigint {
  const buffer = randomBytes(32);
  const nonce = buffer.readBigInt64BE(0);
  return nonce < BigInt(0) ? -nonce : nonce;
}

interface BuildSwapAndBridgeTxParams {
  rpcUrl: string;
  sourceAccountPublicKey: string;
  contractAddress: string;
  abiSpec: string;
  amount: string;
  decimals: number;
  recipientEvmAddress: string;
  receiveTokenAddress: string;
}

/**
 * Build Soroban swap_and_bridge transaction
 */
export async function buildSwapAndBridgeTx(params: BuildSwapAndBridgeTxParams): Promise<string> {
  const {
    rpcUrl,
    sourceAccountPublicKey,
    contractAddress,
    abiSpec,
    amount,
    decimals,
    recipientEvmAddress,
    receiveTokenAddress,
  } = params;

  // Connect to Soroban RPC
  const rpcServer = new StellarSdk.rpc.Server(rpcUrl);

  // Load source account
  const sourceAccount = await rpcServer.getAccount(sourceAccountPublicKey);

  // Get current ledger for expiration extension
  const latestLedgerResponse = await rpcServer.getLatestLedger();
  const latestLedger = latestLedgerResponse.sequence;

  // Convert amount to on-chain integer
  const amountInt = BigInt(floatToInt(amount, decimals));

  // Encode recipient EVM address as 32-byte buffer
  const recipientBuffer = encodeEvmAddress(recipientEvmAddress);

  // Encode receive token address as 32-byte buffer
  const receiveTokenBuffer = encodeTokenAddress(receiveTokenAddress);

  // Generate random nonce
  const nonce = getNonceBigInt();

  // Build contract call using ABI spec
  const contract = new StellarSdk.Contract(contractAddress);
  const spec = new StellarSdk.contract.Spec([abiSpec]);

  // Create invokeHostFunction operation
  const operation = contract.call(
    'swap_and_bridge',
    ...spec.funcArgsToScVals('swap_and_bridge', {
      amount: amountInt,
      recipient: recipientBuffer,
      receive_token: receiveTokenBuffer,
      nonce,
    }),
  );

  // Build transaction
  const txBuilder = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: StellarSdk.Networks.PUBLIC,
  });

  const tx = txBuilder.addOperation(operation).setTimeout(300).build();

  // Simulate transaction
  const simulationResponse = await rpcServer.simulateTransaction(tx);

  if (StellarSdk.rpc.Api.isSimulationError(simulationResponse)) {
    throw new Error(`Simulation failed: ${JSON.stringify(simulationResponse)}`);
  }

  // Extend auth entry expiration by setting to latestLedger + 500 (~40 minutes)
  if (simulationResponse.result?.auth) {
    simulationResponse.result.auth.forEach((entry: any) => {
      // Check for address credentials (sorobanCredentialsAddress in the requirement)
      if (entry.credentials?.address) {
        const oldExp = entry.credentials.address.signatureExpirationLedger;
        const newExp = latestLedger + 500;

        logger.info(`Extending auth expiration: old=${oldExp}, new=${newExp}`);
        entry.credentials.address.signatureExpirationLedger = newExp;
      }
    });
  }

  // Assemble transaction with modified auth entries
  const assembledTx = StellarSdk.rpc.assembleTransaction(tx, simulationResponse).build();

  // Apply bumped fee: (baseFee + minResourceFee) * 1.5
  const originalFee = parseInt(tx.fee);
  const simMinFee = parseInt(simulationResponse.minResourceFee || '0');
  const targetFee = Math.ceil((originalFee + simMinFee) * 1.5);

  logger.info(
    `[Fee Bump] originalFee: ${originalFee}, simMinFee: ${simMinFee}, targetFee: ${targetFee}`,
  );

  // Mutate the assembled tx fee
  (assembledTx as any)._fee = targetFee.toString();

  // Return base64 XDR
  return assembledTx.toXDR();
}
