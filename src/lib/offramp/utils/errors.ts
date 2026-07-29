/**
 * Error decoding utilities for Stellar/Soroban transactions
 */

/**
 * Safely stringify a value, handling BigInt serialization
 * @param value - Any value to serialize to JSON
 * @returns JSON string representation
 */
export function safeJson(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';

  // Handle BigInt by converting to string representation
  const bigIntReplacer = (_key: string, val: unknown): unknown => {
    if (typeof val === 'bigint') {
      return `BigInt(${val.toString()})`;
    }
    return val;
  };

  try {
    return JSON.stringify(value, bigIntReplacer);
  } catch {
    // Fallback for objects that can't be stringified
    return String(value);
  }
}

/**
 * Decode Stellar XDR error result to human-readable code
 * @param errorResultXdr - Optional XDR string from transaction result
 * @returns Human-readable error code or null if not decodable
 */
export function decodeTxResultXdr(errorResultXdr?: string): string | null {
  if (!errorResultXdr) return null;

  try {
    // Common Stellar/Soroban error codes
    // These are typical result codes from Stellar transaction responses
    const errorPatterns: Record<string, string> = {
      tx_success: 'Transaction succeeded',
      tx_too_early: 'Transaction submitted too early',
      tx_too_late: 'Transaction submitted too late',
      tx_missing_operation: 'Transaction missing operations',
      tx_insufficient_balance: 'Insufficient balance',
      tx_no_source_account: 'Source account not found',
      tx_invalid_source_account: 'Invalid source account',
      tx_invalid_sequence_number: 'Invalid sequence number',
      tx_invalid_signature: 'Invalid signature',
      tx_missing_signature: 'Missing required signature',
      tx_fee_bump_invalid_sig: 'Fee bump has invalid signature',
      tx_fee_bump_missing_sig: 'Fee bump missing signature',
      tx_not_supported: 'Operation not supported',
      tx_too_many_operations: 'Too many operations in transaction',
      tx_invalid_operation: 'Invalid operation',
      op_invalid: 'Invalid operation',
      op_bad_auth: 'Invalid authorization',
      op_no_trust: 'Trust line not found',
      op_trust_NOT_ALLOWED: 'Trust not allowed',
      op_underfunded: 'Underfunded - insufficient balance',
      op_source_not_authorized: 'Source not authorized',
      op_no_account: 'Account not found',
      op_low_reserve: 'Below minimum balance',
      op_buy_not_AUTHORIZED: 'Buy not authorized',
      op_sell_not_AUTHORIZED: 'Sell not authorized',
    };

    // Try to decode base64 XDR if present
    // For now, return a generic message since full XDR decoding requires stellar-sdk
    if (errorResultXdr.length > 10) {
      // Check if it looks like base64 encoded
      const isBase64 = /^[A-Za-z0-9+/=]+$/.test(errorResultXdr);
      if (isBase64 && errorResultXdr.length > 20) {
        return 'Transaction failed (XDR encoded)';
      }
    }

    // Check for known error patterns in the string
    for (const [code, description] of Object.entries(errorPatterns)) {
      if (errorResultXdr.toLowerCase().includes(code.toLowerCase())) {
        return `${code}: ${description}`;
      }
    }

    return 'Transaction failed';
  } catch {
    return null;
  }
}

/**
 * Format a Soroban error payload into a readable string
 * @param payload - Error payload from Soroban contract
 * @returns Formatted error message
 */
export function formatSorobanError(payload: unknown): string {
  if (!payload) return 'Unknown error';

  // Try to parse the payload if it's a string
  let parsed: Record<string, unknown>;
  if (typeof payload === 'string') {
    try {
      parsed = JSON.parse(payload);
    } catch {
      return payload;
    }
  } else if (typeof payload === 'object') {
    parsed = payload as Record<string, unknown>;
  } else {
    return String(payload);
  }

  // Extract error components
  const parts: string[] = [];

  // Status - could be in various formats
  if (parsed.status) {
    const status = parsed.status;
    if (typeof status === 'string') {
      parts.push(status);
    } else if (typeof status === 'number') {
      parts.push(`Status(${status})`);
    } else {
      parts.push(safeJson(status));
    }
  }

  // Transaction code (txCode)
  if (parsed.txCode || parsed.tx_code || parsed.tx_code) {
    const txCode = parsed.txCode || parsed.tx_code;
    parts.push(`tx:${txCode}`);
  }

  // Operation code (opCode)
  if (parsed.opCode || parsed.op_code) {
    const opCode = parsed.opCode || parsed.op_code;
    parts.push(`op:${opCode}`);
  }

  // Error message
  if (parsed.message || parsed.error || parsed.errorMessage) {
    const message = parsed.message || parsed.error || parsed.errorMessage;
    parts.push(String(message));
  }

  // Raw XDR if present
  if (parsed.resultXdr || parsed.result_xdr || parsed.errorResultXdr) {
    const xdr = parsed.resultXdr || parsed.result_xdr || parsed.errorResultXdr;
    const decoded = decodeTxResultXdr(xdr as string);
    if (decoded) {
      parts.push(decoded);
    }
  }

  // If we have raw JSON, include it at the end
  if (parts.length === 0) {
    return safeJson(payload);
  }

  return parts.join(' | ');
}

/**
 * Extract error message from various error formats
 * @param error - Error object or string
 * @returns Human-readable error message
 */
export function extractErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error';

  if (typeof error === 'string') return error;

  if (error instanceof Error) return error.message;

  if (typeof error === 'object') {
    const err = error as Record<string, unknown>;
    if (err.message) return String(err.message);
    if (err.error) return String(err.error);
    if (err.error_message) return String(err.error_message);
  }

  return safeJson(error);
}
